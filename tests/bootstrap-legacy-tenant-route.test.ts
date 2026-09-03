import assert from "node:assert/strict";
import test from "node:test";

import { BootstrapLegacyTenantRoute } from "../application/bootstrap-legacy-tenant-route.ts";
import { createTenantSecretEnvelope } from "../adapters/security/tenant-secret-envelope.ts";
import type { LegacyTenantBootstrapStorePort } from
  "../ports/legacy-tenant-bootstrap-store-port.ts";

function fixtureMaterial(label: string): string {
  return `${label}-fixture-material-`.padEnd(32, "x");
}

test("legacy tenant bootstrap verifies identity and atomically creates one authoritative route", async () => {
  const stored: Parameters<LegacyTenantBootstrapStorePort["bootstrap"]>[0][] = [];
  let sequence = 0;
  const service = new BootstrapLegacyTenantRoute({
    verify: { async verify({ clientId }) { return {
      providerFamily: "OAUTH2", providerKey: "feishu", clientId,
      externalTenantDigest: `sha256:${"a".repeat(64)}`, tenantDisplayName: "浙江镭科文化创意有限公司",
    }; } },
    envelope: createTenantSecretEnvelope({
      activeKeyVersion: "key-one", keys: new Map([["key-one", Buffer.alloc(32, 1)]]),
      randomBytes: () => Buffer.alloc(12, 2),
    }),
    store: {
      async inspect() { return "READY"; },
      async bootstrap(input) { stored.push(input); return "CREATED"; },
    },
    nextId: () => `legacy-${++sequence}`,
    now: () => "2026-09-03T09:00:00.000Z",
  });
  const appSecret = fixtureMaterial("legacy-feishu");
  const result = await service.bootstrap({
    companyId: "company-leike", ownerUserId: "user-owner", slug: "leike",
    appId: "cli_leike", appSecret,
  });

  assert.deepEqual(result, { status: "CREATED", companyId: "company-leike", slug: "leike" });
  assert.equal(stored[0]?.registration.status, "COMPLETED");
  assert.equal(stored[0]?.registration.companyId, "company-leike");
  assert.equal(stored[0]?.registration.verifiedHumanId, "user-owner");
  assert.equal(stored[0]?.binding.status, "active");
  assert.equal(stored[0]?.binding.companyId, "company-leike");
  assert.equal(stored[0]?.binding.publicProviderId, "feishu-legacy-2");
  assert.notEqual(stored[0]?.secret.ciphertext, appSecret);
  assert.doesNotMatch(JSON.stringify(stored[0]), new RegExp(appSecret));
});

test("legacy tenant bootstrap is idempotent and fails closed on a conflicting route", async () => {
  const dependencies = {
    verify: { async verify({ clientId }: { clientId: string }) { return {
      providerFamily: "OAUTH2" as const, providerKey: "feishu", clientId,
      externalTenantDigest: `sha256:${"b".repeat(64)}` as `sha256:${string}`, tenantDisplayName: "Legacy",
    }; } },
    envelope: createTenantSecretEnvelope({
      activeKeyVersion: "key-one", keys: new Map([["key-one", Buffer.alloc(32, 1)]]),
    }),
    nextId: (() => { let sequence = 0; return () => `legacy-${++sequence}`; })(),
    now: () => "2026-09-03T09:00:00.000Z",
  };
  const input = { companyId: "company-leike", ownerUserId: "user-owner", slug: "leike",
    appId: "cli_leike", appSecret: fixtureMaterial("legacy-feishu") };
  const idempotent = new BootstrapLegacyTenantRoute({
    ...dependencies, store: {
      async inspect() { return "ALREADY_PRESENT" as const; },
      async bootstrap() { return "ALREADY_PRESENT" as const; },
    },
  });
  assert.equal((await idempotent.bootstrap(input)).status, "ALREADY_PRESENT");

  const conflict = new BootstrapLegacyTenantRoute({
    ...dependencies, store: {
      async inspect() { return "CONFLICT" as const; },
      async bootstrap() { return "CONFLICT" as const; },
    },
  });
  await assert.rejects(conflict.bootstrap(input), /LEGACY_TENANT_BOOTSTRAP_CONFLICT/);
});

test("legacy tenant bootstrap rejects unsafe input before verification or persistence", async () => {
  let verified = 0;
  let stored = 0;
  const service = new BootstrapLegacyTenantRoute({
    verify: { async verify() { verified += 1; throw new Error("MUST_NOT_VERIFY"); } },
    envelope: createTenantSecretEnvelope({
      activeKeyVersion: "key-one", keys: new Map([["key-one", Buffer.alloc(32, 1)]]),
    }),
    store: {
      async inspect() { stored += 1; return "READY"; },
      async bootstrap() { stored += 1; return "CREATED"; },
    },
    nextId: () => "legacy-id",
    now: () => "2026-09-03T09:00:00.000Z",
  });
  await assert.rejects(service.bootstrap({
    companyId: "company-leike", ownerUserId: "user-owner", slug: "../leike",
    appId: "cli_leike", appSecret: fixtureMaterial("legacy-feishu"),
  }), /TENANT_SLUG_INVALID/);
  assert.equal(verified, 0);
  assert.equal(stored, 0);
});

test("legacy preflight validates input, Feishu identity, and operator mapping without sealing", async () => {
  let inspected = 0;
  let sealed = 0;
  const service = new BootstrapLegacyTenantRoute({
    verify: { async verify({ clientId }) { return {
      providerFamily: "OAUTH2", providerKey: "feishu", clientId,
      externalTenantDigest: `sha256:${"d".repeat(64)}`, tenantDisplayName: "Legacy",
    }; } },
    envelope: { seal() { sealed += 1; throw new Error("MUST_NOT_SEAL"); } },
    store: {
      async inspect(mapping) {
        inspected += 1;
        assert.deepEqual(mapping, {
          companyId: "company-leike", ownerUserId: "user-owner", slug: "leike",
          appId: "cli_leike", externalTenantDigest: `sha256:${"d".repeat(64)}`,
        });
        return "READY";
      },
      async bootstrap() { throw new Error("MUST_NOT_WRITE"); },
    },
    nextId: () => { throw new Error("MUST_NOT_ALLOCATE_ID"); },
    now: () => "2026-09-03T09:00:00.000Z",
  });
  assert.deepEqual(await service.preflight({
    companyId: "company-leike", ownerUserId: "user-owner", slug: "leike",
    appId: "cli_leike", appSecret: fixtureMaterial("legacy-feishu"),
  }), { status: "READY", companyId: "company-leike", slug: "leike" });
  assert.equal(inspected, 1);
  assert.equal(sealed, 0);
});
