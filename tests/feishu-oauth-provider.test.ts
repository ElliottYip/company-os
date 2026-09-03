import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { buildFeishuOAuthProvider } from "../adapters/identity/feishu-oauth-provider.ts";
import { tenantAssertedEmailHmac } from "../adapters/security/tenant-identity-email-hmac.ts";

function fixtureMaterial(label: string): string {
  return `${label}-fixture-material-`.padEnd(32, "x");
}

const configuration = {
  baseUrl: "https://company.example.test",
  redirectUri: "https://company.example.test/api/auth/oauth2/callback/feishu",
  appId: "cli_company_os_fixture",
  appSecret: fixtureMaterial("feishu-app"),
  expectedTenantKey: "tenant-company-fixture",
};

function tenantDigest(tenantKey: string): string {
  return `sha256:${createHash("sha256").update(tenantKey).digest("hex")}`;
}

test("Feishu OAuth uses the current authorization-code boundary with S256 PKCE", async () => {
  const requests: { readonly url: string; readonly init?: RequestInit }[] = [];
  const provider = buildFeishuOAuthProvider(configuration, async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({
      code: 0,
      access_token: "user-access-token-fixture",
      expires_in: 7200,
      token_type: "Bearer",
      scope: "auth:user.id:read contact:user.email:readonly",
    }), { status: 200, headers: { "content-type": "application/json" } });
  });

  assert.equal(provider.providerId, "feishu");
  assert.equal(provider.authorizationUrl, "https://accounts.feishu.cn/open-apis/authen/v1/authorize");
  assert.equal(provider.pkce, true);
  assert.deepEqual(provider.scopes, ["auth:user.id:read", "contact:user.email:readonly"]);
  const tokens = await provider.getToken?.({
    code: "authorization-code-fixture",
    redirectURI: configuration.redirectUri,
    codeVerifier: "v".repeat(64),
  });

  assert.equal(tokens?.accessToken, "user-access-token-fixture");
  assert.deepEqual(tokens?.scopes, ["auth:user.id:read", "contact:user.email:readonly"]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "https://open.feishu.cn/open-apis/authen/v2/oauth/token");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    grant_type: "authorization_code",
    client_id: configuration.appId,
    client_secret: configuration.appSecret,
    code: "authorization-code-fixture",
    redirect_uri: configuration.redirectUri,
    code_verifier: "v".repeat(64),
  });
});

test("Feishu identity is tenant-locked and maps only stable bounded fields", async () => {
  let tenantKey = configuration.expectedTenantKey;
  const provider = buildFeishuOAuthProvider(configuration, async () => new Response(JSON.stringify({
    code: 0,
    msg: "success",
    data: {
      union_id: "on_company_human_fixture",
      open_id: "ou_company_human_fixture",
      tenant_key: tenantKey,
      name: "Company Human",
      enterprise_email: "human@company.example",
      email: "personal@example.net",
      avatar_url: "https://example.test/avatar.png",
      mobile: "+8613800000000",
      employee_no: "secret-employee-number",
    },
  }), { status: 200, headers: { "content-type": "application/json" } }));

  const user = await provider.getUserInfo?.({ accessToken: "user-access-token-fixture" });
  assert.deepEqual(user, {
    id: "on_company_human_fixture",
    name: "Company Human",
    email: "human@company.example",
    image: "https://example.test/avatar.png",
    emailVerified: true,
  });
  assert.doesNotMatch(JSON.stringify(user), /mobile|employee_no|open_id|tenant_key/);

  tenantKey = "another-tenant";
  await assert.rejects(
    provider.getUserInfo?.({ accessToken: "user-access-token-fixture" }),
    /FEISHU_TENANT_MISMATCH/,
  );
});

test("Feishu identity remains usable when the tenant has no employee email attributes", async () => {
  const provider = buildFeishuOAuthProvider(configuration, async () => Response.json({
    code: 0,
    data: {
      union_id: "on_company_human_without_email",
      tenant_key: configuration.expectedTenantKey,
      name: "Company Human",
      enterprise_email: "",
      email: "",
    },
  }));

  const first = await provider.getUserInfo?.({ accessToken: "user-access-token-fixture" });
  const second = await provider.getUserInfo?.({ accessToken: "user-access-token-fixture" });
  assert.equal(first?.email, second?.email);
  assert.match(first?.email ?? "", /^feishu-[a-f0-9]{40}@identity\.invalid$/);
  assert.equal(first?.emailVerified, true);
});

test("dynamic Feishu providers use tenant-scoped aliases even when Feishu asserts an email", async () => {
  const tenantKey = "tenant-dynamic-company";
  const assertedEmailHmacKey = Buffer.alloc(32, 7);
  const dynamicConfiguration = {
    ...configuration,
    providerId: "feishu-binding-one",
    redirectUri: "https://company.example.test/api/auth/oauth2/callback/feishu-binding-one",
    expectedTenantKey: undefined,
    expectedTenantDigest: tenantDigest(tenantKey),
    tenantScopedAlias: true,
    assertedEmailHmacKey,
  };
  const profile = {
    code: 0,
    data: {
      union_id: "on_same_human_fixture",
      tenant_key: tenantKey,
      name: "Tenant Human",
      enterprise_email: "same-human@example.test",
    },
  };
  const provider = buildFeishuOAuthProvider(dynamicConfiguration, async () => Response.json(profile));
  const user = await provider.getUserInfo?.({ accessToken: "user-access-token-fixture" });

  assert.equal(provider.providerId, "feishu-binding-one");
  assert.match(user?.email ?? "", /^feishu-[a-f0-9]{40}@identity\.invalid$/);
  assert.notEqual(user?.email, profile.data.enterprise_email);
  assert.equal(user?.assertedEmailHmac, tenantAssertedEmailHmac({
    key: assertedEmailHmacKey,
    tenantDigest: tenantDigest(tenantKey),
    email: profile.data.enterprise_email,
  }));

  const secondProvider = buildFeishuOAuthProvider({
    ...dynamicConfiguration,
    providerId: "feishu-binding-two",
    redirectUri: "https://company.example.test/api/auth/oauth2/callback/feishu-binding-two",
  }, async () => Response.json(profile));
  const secondUser = await secondProvider.getUserInfo?.({ accessToken: "user-access-token-fixture" });
  assert.notEqual(user?.email, secondUser?.email);
});

test("dynamic Feishu providers match the verified tenant digest and fail closed on routing config", async () => {
  const tenantKey = "tenant-dynamic-company";
  const dynamicConfiguration = {
    ...configuration,
    providerId: "feishu-binding-one",
    redirectUri: "https://company.example.test/api/auth/oauth2/callback/feishu-binding-one",
    expectedTenantKey: undefined,
    expectedTenantDigest: tenantDigest(tenantKey),
    tenantScopedAlias: true,
  };
  let returnedTenantKey = tenantKey;
  const provider = buildFeishuOAuthProvider(dynamicConfiguration, async () => Response.json({
    code: 0,
    data: {
      union_id: "on_dynamic_human_fixture",
      tenant_key: returnedTenantKey,
      name: "Dynamic Human",
    },
  }));

  await provider.getUserInfo?.({ accessToken: "user-access-token-fixture" });
  returnedTenantKey = "tenant-attacker";
  await assert.rejects(
    provider.getUserInfo?.({ accessToken: "user-access-token-fixture" }),
    /FEISHU_TENANT_MISMATCH/,
  );

  assert.throws(() => buildFeishuOAuthProvider({
    ...dynamicConfiguration,
    providerId: "../../feishu",
  }), /FEISHU_PROVIDER_ID_INVALID/);
  assert.throws(() => buildFeishuOAuthProvider({
    ...dynamicConfiguration,
    redirectUri: "https://company.example.test/api/auth/oauth2/callback/feishu-binding-two",
  }), /FEISHU_REDIRECT_URI_MISMATCH/);
  assert.throws(() => buildFeishuOAuthProvider({
    ...dynamicConfiguration,
    expectedTenantDigest: "sha256:not-a-digest",
  }), /FEISHU_TENANT_DIGEST_INVALID/);
  assert.throws(() => buildFeishuOAuthProvider({
    ...dynamicConfiguration,
    tenantScopedAlias: false,
  }), /FEISHU_TENANT_SCOPED_ALIAS_REQUIRED/);
});

test("Feishu OAuth configuration and remote responses fail closed", async () => {
  assert.throws(() => buildFeishuOAuthProvider({
    ...configuration,
    redirectUri: "https://company.example.test/api/auth/oauth2/callback/wrong",
  }), /FEISHU_REDIRECT_URI_MISMATCH/);
  assert.throws(() => buildFeishuOAuthProvider({
    ...configuration,
    expectedTenantKey: "",
  }), /FEISHU_TENANT_KEY_REQUIRED/);

  const provider = buildFeishuOAuthProvider(configuration, async () => new Response(JSON.stringify({
    code: 20050,
    error: "server_error",
    error_description: "contains-sensitive-upstream-detail",
  }), { status: 200, headers: { "content-type": "application/json" } }));
  await assert.rejects(
    provider.getToken?.({ code: "code", redirectURI: configuration.redirectUri, codeVerifier: "v".repeat(64) }),
    (error: unknown) => error instanceof Error && error.message === "FEISHU_TOKEN_EXCHANGE_FAILED",
  );
});
