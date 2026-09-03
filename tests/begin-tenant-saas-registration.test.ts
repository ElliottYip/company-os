import assert from "node:assert/strict";
import test from "node:test";

import { BeginTenantSaasRegistration } from "../application/begin-tenant-saas-registration.ts";
import { createTenantSecretEnvelope } from "../adapters/security/tenant-secret-envelope.ts";
import type { TenantSaasProvisioningStorePort } from
  "../ports/tenant-saas-provisioning-store-port.ts";

function fixtureMaterial(label: string): string {
  return `${label}-fixture-material-`.padEnd(32, "x");
}

test("SaaS registration verifies Feishu before atomically storing only an encrypted binding", async () => {
  const calls: string[] = [];
  const stored: Parameters<TenantSaasProvisioningStorePort["provision"]>[0][] = [];
  let sequence = 0;
  const service = new BeginTenantSaasRegistration({
    verify: {
      async verify(input) {
        calls.push(`verify:${input.clientId}:${input.clientSecret.length}`);
        return {
          providerFamily: "OAUTH2",
          providerKey: "feishu",
          clientId: input.clientId,
          externalTenantDigest: `sha256:${"a".repeat(64)}`,
          tenantDisplayName: "Alpha Company",
        };
      },
    },
    envelope: createTenantSecretEnvelope({
      activeKeyVersion: "key-one",
      keys: new Map([["key-one", Buffer.alloc(32, 1)]]),
      randomBytes: () => Buffer.alloc(12, 2),
    }),
    store: {
      async provision(input) { calls.push("store"); stored.push(input); return "CREATED"; },
    },
    nextId: () => `record-${++sequence}`,
    now: () => "2026-09-03T08:00:00.000Z",
  });
  const appSecret = fixtureMaterial("feishu-app");
  const result = await service.begin({
    slug: "alpha-company", companyName: "Alpha Company", appId: "cli_alpha", appSecret,
  });

  assert.deepEqual(calls, [`verify:cli_alpha:${appSecret.length}`, "store"]);
  assert.equal(result.status, "PENDING_IDENTITY");
  assert.equal(result.providerId, "feishu-record-2");
  assert.equal(stored[0]?.binding.externalTenantDigest, `sha256:${"a".repeat(64)}`);
  assert.notEqual(stored[0]?.secret.ciphertext, appSecret);
  assert.doesNotMatch(JSON.stringify(stored[0]), new RegExp(appSecret));
});

test("SaaS registration persists nothing when verification or uniqueness fails", async () => {
  let stores = 0;
  const dependencies = {
    envelope: createTenantSecretEnvelope({
      activeKeyVersion: "key-one", keys: new Map([["key-one", Buffer.alloc(32, 1)]]),
    }),
    store: { async provision() { stores += 1; return "CONFLICT" as const; } },
    nextId: (() => { let id = 0; return () => `record-${++id}`; })(),
    now: () => "2026-09-03T08:00:00.000Z",
  };
  const rejected = new BeginTenantSaasRegistration({
    ...dependencies,
    verify: { async verify() { throw new Error("IDENTITY_BINDING_VERIFICATION_FAILED"); } },
  });
  await assert.rejects(rejected.begin({
    slug: "alpha-company", companyName: "Alpha", appId: "cli_alpha",
    appSecret: fixtureMaterial("rejected"),
  }), /IDENTITY_BINDING_VERIFICATION_FAILED/);
  assert.equal(stores, 0);

  const conflict = new BeginTenantSaasRegistration({
    ...dependencies,
    verify: { async verify() { return {
      providerFamily: "OAUTH2", providerKey: "feishu", clientId: "cli_alpha",
      externalTenantDigest: `sha256:${"a".repeat(64)}`, tenantDisplayName: "Alpha",
    }; } },
  });
  await assert.rejects(conflict.begin({
    slug: "alpha-company", companyName: "Alpha", appId: "cli_alpha",
    appSecret: fixtureMaterial("conflict"),
  }), /TENANT_REGISTRATION_CONFLICT/);
  assert.equal(stores, 1);
});

test("SaaS registration reserves an upgraded legacy tenant before sealing or persistence", async () => {
  let seals = 0;
  let stores = 0;
  const digest = `sha256:${"b".repeat(64)}`;
  const service = new BeginTenantSaasRegistration({
    verify: { async verify(input) { return {
      providerFamily: "OAUTH2", providerKey: "feishu", clientId: input.clientId,
      externalTenantDigest: digest as `sha256:${string}`, tenantDisplayName: "Legacy Company",
    }; } },
    envelope: { seal() { seals += 1; throw new Error("MUST_NOT_SEAL"); } },
    store: { async provision() { stores += 1; return "CREATED"; } },
    nextId: (() => { let id = 0; return () => `record-${++id}`; })(),
    now: () => "2026-09-03T08:00:00.000Z",
    reservedExternalTenantDigests: new Set([digest]),
  });

  await assert.rejects(service.begin({
    slug: "legacy-duplicate", companyName: "Legacy Duplicate", appId: "cli_legacy",
    appSecret: fixtureMaterial("legacy"),
  }), /TENANT_IDENTITY_ALREADY_BOUND/);
  assert.equal(seals, 0);
  assert.equal(stores, 0);
});

test("SaaS registration exposes a used invitation only as generic signup denial", async () => {
  const service = new BeginTenantSaasRegistration({
    verify: { async verify(input) { return {
      providerFamily: "OAUTH2", providerKey: "feishu", clientId: input.clientId,
      externalTenantDigest: `sha256:${"c".repeat(64)}`, tenantDisplayName: "Invite tenant",
    }; } },
    envelope: createTenantSecretEnvelope({
      activeKeyVersion: "key-one", keys: new Map([["key-one", Buffer.alloc(32, 1)]]),
    }),
    store: { async provision() { return "INVITE_USED"; } },
    nextId: (() => { let id = 0; return () => `record-${++id}`; })(),
    now: () => "2026-09-03T08:00:00.000Z",
  });
  await assert.rejects(service.begin({
    slug: "invite-tenant", companyName: "Invite tenant", appId: "cli_invite",
    appSecret: fixtureMaterial("invite"),
    signupInviteDigest: `hmac-sha256:${"1".repeat(64)}`,
  }), /TENANT_SIGNUP_NOT_ALLOWED/);
});
