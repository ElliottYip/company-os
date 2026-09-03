import assert from "node:assert/strict";
import test from "node:test";

import {
  createTenantAuthRequestRouter,
  type TenantAuthRuntime,
} from "../adapters/identity/tenant-auth-router.ts";

function runtime(slug: string, providerId: string, calls: Request[]): TenantAuthRuntime {
  return {
    slug,
    providerId,
    status: "ACTIVE",
    handle(request) {
      calls.push(request);
      return Promise.resolve(Response.json({ providerId, path: new URL(request.url).pathname }));
    },
  };
}

test("tenant sign-in resolves exactly one active binding and fixes provider and landing URL server-side", async () => {
  const alphaCalls: Request[] = [];
  const betaCalls: Request[] = [];
  const alpha = runtime("alpha-company", "feishu-binding-alpha", alphaCalls);
  const beta = runtime("beta-company", "feishu-binding-beta", betaCalls);
  const router = createTenantAuthRequestRouter({
    authBaseUrl: "https://api.company.example",
    webBaseUrl: "https://company.example",
    resolveBySlug: async (slug) => slug === alpha.slug ? alpha : slug === beta.slug ? beta : null,
    resolveByProviderId: async (providerId) => providerId === alpha.providerId
      ? alpha : providerId === beta.providerId ? beta : null,
    legacyHandle: async () => new Response("legacy"),
  });

  const response = await router(new Request(
    "https://api.company.example/t/alpha-company/sign-in",
    { method: "POST", headers: { origin: "https://company.example" } },
  ));

  assert.equal(response.status, 200);
  assert.equal(alphaCalls.length, 1);
  assert.equal(betaCalls.length, 0);
  assert.equal(new URL(alphaCalls[0]!.url).pathname, "/api/auth/sign-in/oauth2");
  assert.deepEqual(await alphaCalls[0]!.json(), {
    providerId: "feishu-binding-alpha",
    callbackURL: "https://company.example/t/alpha-company",
  });
  assert.equal(alphaCalls[0]!.headers.get("origin"), "https://company.example");
});

test("an explicitly verified legacy tenant slug reuses the static Feishu identity", async () => {
  const legacyCalls: Request[] = [];
  const router = createTenantAuthRequestRouter({
    authBaseUrl: "https://api.company.example",
    webBaseUrl: "https://company.example",
    resolveLegacyBySlug: async (slug) => slug === "legacy-company",
    resolveBySlug: async () => { throw new Error("DYNAMIC_RUNTIME_MUST_NOT_BE_USED"); },
    resolveByProviderId: async () => null,
    legacyHandle: async (request) => {
      legacyCalls.push(request);
      return Response.json({ ok: true });
    },
  });

  const response = await router(new Request(
    "https://api.company.example/t/legacy-company/sign-in",
    { method: "POST" },
  ));
  assert.equal(response.status, 200);
  assert.equal(legacyCalls.length, 1);
  assert.equal(new URL(legacyCalls[0]!.url).pathname, "/api/auth/sign-in/oauth2");
  assert.deepEqual(await legacyCalls[0]!.json(), {
    providerId: "feishu",
    callbackURL: "https://company.example/legacy-company/",
  });
});

test("binding-specific callbacks never fall back to another tenant or the legacy provider", async () => {
  const alphaCalls: Request[] = [];
  const betaCalls: Request[] = [];
  let legacyCalls = 0;
  const alpha = runtime("alpha-company", "feishu-binding-alpha", alphaCalls);
  const beta = runtime("beta-company", "feishu-binding-beta", betaCalls);
  const router = createTenantAuthRequestRouter({
    authBaseUrl: "https://api.company.example",
    webBaseUrl: "https://company.example",
    resolveBySlug: async () => null,
    resolveByProviderId: async (providerId) => providerId === alpha.providerId
      ? alpha : providerId === beta.providerId ? beta : null,
    legacyHandle: async () => { legacyCalls += 1; return new Response("legacy"); },
  });

  const alphaCallback = await router(new Request(
    "https://api.company.example/api/auth/oauth2/callback/feishu-binding-alpha?code=one&state=alpha",
  ));
  assert.equal(alphaCallback.status, 200);
  assert.equal(alphaCalls.length, 1);
  assert.equal(betaCalls.length, 0);
  assert.equal(legacyCalls, 0);

  const swapped = await router(new Request(
    "https://api.company.example/api/auth/oauth2/callback/feishu-binding-unknown?code=one&state=alpha",
  ));
  assert.equal(swapped.status, 404);
  assert.equal(alphaCalls.length, 1);
  assert.equal(betaCalls.length, 0);
  assert.equal(legacyCalls, 0);

  const legacy = await router(new Request(
    "https://api.company.example/api/auth/oauth2/callback/feishu?code=legacy&state=legacy",
  ));
  assert.equal(legacy.status, 200);
  assert.equal(legacyCalls, 1);
});

test("tenant auth routing fails closed for inactive, inconsistent, malformed, and ambiguous lookups", async () => {
  const calls: Request[] = [];
  const router = createTenantAuthRequestRouter({
    authBaseUrl: "https://api.company.example",
    webBaseUrl: "https://company.example",
    resolveBySlug: async (slug) => slug === "inactive-company"
      ? { ...runtime(slug, "feishu-binding-inactive", calls), status: "DISABLED" }
      : runtime("different-company", "feishu-binding-other", calls),
    resolveByProviderId: async () => runtime("tenant-company", "feishu-binding-different", calls),
    legacyHandle: async () => new Response("legacy"),
  });

  for (const path of [
    "/t/inactive-company/sign-in",
    "/t/requested-company/sign-in",
    "/t/..%2Fother/sign-in",
  ]) {
    const response = await router(new Request(`https://api.company.example${path}`, { method: "POST" }));
    assert.equal(response.status, 404);
  }
  const inconsistentCallback = await router(new Request(
    "https://api.company.example/api/auth/oauth2/callback/feishu-binding-requested?code=x&state=y",
  ));
  assert.equal(inconsistentCallback.status, 404);
  assert.equal(calls.length, 0);
});
