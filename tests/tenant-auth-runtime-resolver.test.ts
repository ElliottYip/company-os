import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createTenantAuthRuntimeResolver,
  tenantOAuthCallbackUri,
} from "../adapters/identity/tenant-auth-runtime-resolver.ts";
import { createTenantSecretEnvelope } from "../adapters/security/tenant-secret-envelope.ts";

const envelope = createTenantSecretEnvelope({
  activeKeyVersion: "key-one",
  keys: new Map([["key-one", Buffer.alloc(32, 7)]]),
  randomBytes: () => Buffer.alloc(12, 3),
});

test("tenant callback URI is exact, HTTPS, and provider-bound", () => {
  assert.equal(tenantOAuthCallbackUri("https://api.company.example/path", "feishu-binding-alpha"),
    "https://api.company.example/api/auth/oauth2/callback/feishu-binding-alpha");
  assert.throws(() => tenantOAuthCallbackUri("http://api.company.example", "feishu-binding-alpha"),
    /TENANT_AUTH_BASE_URL_INVALID/);
  assert.throws(() => tenantOAuthCallbackUri("https://api.company.example", "other-alpha"),
    /TENANT_AUTH_PROVIDER_ID_INVALID/);
});

function fixtureMaterial(label: string): string {
  return `${label}-fixture-material-`.padEnd(32, "x");
}

function material(slug: string, suffix: string) {
  const bindingId = `binding-${suffix}`;
  return {
    bindingId,
    registrationId: `registration-${suffix}`,
    slug,
    registrationStatus: "PENDING_IDENTITY" as const,
    expiresAt: "2026-09-03T06:15:00.000Z",
    companyId: null,
    providerFamily: "OAUTH2",
    providerKey: "feishu",
    providerId: `feishu-binding-${suffix}`,
    tenantDigest: `sha256:${createHash("sha256").update(suffix).digest("hex")}`,
    appId: `cli_${suffix}`,
    bindingStatus: "pending",
    bindingRevision: 1,
    secretRevokedAt: null,
    secret: envelope.seal({
      id: `secret-${suffix}`,
      ownerReference: bindingId,
      purpose: "IDENTITY_PROVIDER_CLIENT_SECRET",
      plaintext: fixtureMaterial(suffix),
      createdAt: "2026-09-03T06:00:00.000Z",
    }),
  };
}

test("runtime resolver builds and caches isolated tenant auth instances from encrypted bindings", async () => {
  const alpha = material("alpha-company", "alpha");
  const beta = material("beta-company", "beta");
  const configurations: Array<Record<string, unknown>> = [];
  const resolver = createTenantAuthRuntimeResolver({
    authBaseUrl: "https://api.company.example",
    sessionSecret: fixtureMaterial("session"),
    instanceId: "shared",
    trustedWebOrigins: ["https://company.example"],
    envelope,
    now: () => "2026-09-03T06:05:00.000Z",
    source: {
      findBySlug: async (slug) => slug === alpha.slug ? alpha : slug === beta.slug ? beta : null,
      findByProviderId: async (providerId) => providerId === alpha.providerId
        ? alpha : providerId === beta.providerId ? beta : null,
    },
    createHandler(configuration) {
      configurations.push(configuration as unknown as Record<string, unknown>);
      return async () => Response.json({ providerId: configuration.providerId });
    },
  });

  const alphaRuntime = await resolver.resolveBySlug(alpha.slug);
  const betaRuntime = await resolver.resolveByProviderId(beta.providerId);
  assert.equal(alphaRuntime?.providerId, alpha.providerId);
  assert.equal(betaRuntime?.slug, beta.slug);
  assert.notEqual(alphaRuntime, betaRuntime);
  assert.equal(await resolver.resolveBySlug(alpha.slug), alphaRuntime);
  assert.equal(configurations.length, 2);
  assert.deepEqual(configurations.map((value) => ({
    providerId: value.providerId,
    redirectUri: value.redirectUri,
    expectedTenantDigest: value.expectedTenantDigest,
    tenantScopedAlias: value.tenantScopedAlias,
  })), [{
    providerId: alpha.providerId,
    redirectUri: `https://api.company.example/api/auth/oauth2/callback/${alpha.providerId}`,
    expectedTenantDigest: alpha.tenantDigest,
    tenantScopedAlias: true,
  }, {
    providerId: beta.providerId,
    redirectUri: `https://api.company.example/api/auth/oauth2/callback/${beta.providerId}`,
    expectedTenantDigest: beta.tenantDigest,
    tenantScopedAlias: true,
  }]);
});

test("runtime resolver rejects expired or incoherent binding and registration states", async () => {
  const base = material("alpha-company", "alpha");
  const candidates = [
    { ...base, expiresAt: "2026-09-03T06:00:00.000Z" },
    { ...base, bindingStatus: "suspended" },
    { ...base, registrationStatus: "COMPLETED", bindingStatus: "pending", companyId: null },
    { ...base, providerKey: "other" },
    { ...base, slug: "Different-Company" },
  ];
  let index = 0;
  const resolver = createTenantAuthRuntimeResolver({
    authBaseUrl: "https://api.company.example",
    sessionSecret: fixtureMaterial("session"),
    envelope,
    now: () => "2026-09-03T06:05:00.000Z",
    source: {
      findBySlug: async () => candidates[index++] ?? null,
      findByProviderId: async () => null,
    },
    createHandler: () => async () => new Response(),
  });
  for (let candidate = 0; candidate < candidates.length; candidate += 1) {
    assert.equal(await resolver.resolveBySlug("alpha-company"), null);
  }
});

test("legacy resolution requires an active completed binding with the configured tenant digest", async () => {
  const legacy = {
    ...material("legacy-company", "legacy"),
    registrationStatus: "COMPLETED",
    companyId: "company-legacy",
    bindingStatus: "active",
  };
  const resolver = createTenantAuthRuntimeResolver({
    authBaseUrl: "https://api.company.example",
    sessionSecret: fixtureMaterial("session"),
    envelope,
    now: () => "2026-09-03T06:05:00.000Z",
    legacyTenantDigest: legacy.tenantDigest,
    source: {
      findBySlug: async (slug) => slug === legacy.slug ? legacy : null,
      findByProviderId: async () => null,
    },
    createHandler: () => async () => new Response(),
  });
  assert.equal(await resolver.resolveLegacyBySlug?.("legacy-company"), true);
  assert.equal(await resolver.resolveLegacyBySlug?.("other-company"), false);

  const wrongDigest = createTenantAuthRuntimeResolver({
    authBaseUrl: "https://api.company.example",
    sessionSecret: fixtureMaterial("session"),
    envelope,
    now: () => "2026-09-03T06:05:00.000Z",
    legacyTenantDigest: `sha256:${"f".repeat(64)}`,
    source: { findBySlug: async () => legacy, findByProviderId: async () => null },
    createHandler: () => async () => new Response(),
  });
  assert.equal(await wrongDigest.resolveLegacyBySlug?.("legacy-company"), false);
});
