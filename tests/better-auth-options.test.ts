import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCompanyAuthOptions,
  buildConfiguredCompanyAuthOptions,
  buildCompanyFeishuAuthOptions,
  deriveCompanyAuthCookiePrefix,
  deriveCompanyAuthTrustedOrigins,
  parseCompanyIdentityProvider,
  parseTrustedProxyCidrs,
} from "../adapters/identity/better-auth-options.ts";

function fixtureMaterial(label: string, minimumLength = 16): string {
  return `${label}-fixture-material-`.padEnd(minimumLength, "x");
}

const configuration = {
  baseUrl: "https://company.example.test",
  redirectUri: "https://company.example.test/api/auth/oauth2/callback/enterprise-oidc",
  issuer: "https://identity.example.test",
  discoveryUrl: "https://identity.example.test/.well-known/openid-configuration",
  clientId: "company-os",
  clientSecret: fixtureMaterial("oidc-client"),
  sessionSecret: fixtureMaterial("session-signing", 40),
};

test("Better Auth follows the Paperclip session baseline and only enables enterprise OIDC", () => {
  const options = buildCompanyAuthOptions({
    ...configuration,
    trustedWebOrigins: ["https://app.company.example.test"],
  }, { adapter: "durable-adapter" } as never);
  assert.deepEqual(options.emailAndPassword, { enabled: false });
  assert.equal(options.account?.encryptOAuthTokens, true);
  assert.equal(options.account?.storeStateStrategy, "database");
  assert.deepEqual(options.rateLimit, { enabled: true, storage: "database" });
  assert.deepEqual(options.trustedOrigins, [
    "https://company.example.test",
    "https://app.company.example.test",
  ]);
  assert.equal(options.advanced?.cookiePrefix, "company-os-default");
  assert.deepEqual(options.advanced?.ipAddress, {
    ipAddressHeaders: ["x-company-os-client-chain"], trustedProxies: [],
  });
  const generateId = options.advanced?.database?.generateId;
  assert.equal(typeof generateId, "function");
  assert.match((generateId as (input: { model: string }) => string)({ model: "user" }),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(options.plugins?.[0]?.id, "generic-oauth");
});

test("formal identity provider selection is explicit and fail-closed", () => {
  assert.equal(parseCompanyIdentityProvider(undefined), "OIDC");
  assert.equal(parseCompanyIdentityProvider("OIDC"), "OIDC");
  assert.equal(parseCompanyIdentityProvider("FEISHU"), "FEISHU");
  assert.throws(() => parseCompanyIdentityProvider("oauth"), /IDENTITY_PROVIDER_INVALID/);
});

test("trusted proxy CIDRs are explicit and invalid network boundaries fail closed", () => {
  assert.deepEqual(parseTrustedProxyCidrs("192.0.2.10/32, 2001:db8::/48"), [
    "192.0.2.10/32", "2001:db8::/48",
  ]);
  assert.deepEqual(parseTrustedProxyCidrs(undefined), []);
  assert.throws(() => parseTrustedProxyCidrs("10.0.0.0/33"), /TRUSTED_PROXY_CIDR_INVALID/);
  assert.throws(() => parseTrustedProxyCidrs("not-an-address"), /TRUSTED_PROXY_CIDR_INVALID/);
});

test("auth cookie and trusted origins are instance-scoped and exact", () => {
  assert.equal(deriveCompanyAuthCookiePrefix("FDE Shanghai / Pilot"), "company-os-FDE-Shanghai-Pilot");
  assert.deepEqual(deriveCompanyAuthTrustedOrigins("https://company.example.test/app"), [
    "https://company.example.test",
  ]);
  assert.deepEqual(deriveCompanyAuthTrustedOrigins("https://company.example.test", [
    "https://web.company.example.test",
    "https://web.company.example.test",
  ]), ["https://company.example.test", "https://web.company.example.test"]);
  assert.throws(() => deriveCompanyAuthTrustedOrigins("http://company.example.test"), /AUTH_BASE_URL_HTTPS_REQUIRED/);
  assert.throws(() => deriveCompanyAuthTrustedOrigins("https://company.example.test", [
    "https://web.company.example.test/path",
  ]), /AUTH_TRUSTED_ORIGIN_INVALID/);
  assert.throws(() => deriveCompanyAuthTrustedOrigins("https://company.example.test", [
    "https:\/\/.*\\.example\\.test",
  ]), /AUTH_TRUSTED_ORIGIN_INVALID/);
});

test("OIDC configuration rejects incomplete or unsafe provider boundaries", () => {
  assert.throws(() => buildCompanyAuthOptions({ ...configuration, clientSecret: "" }, {} as never), /OIDC_CLIENT_SECRET_REQUIRED/);
  assert.throws(() => buildCompanyAuthOptions({ ...configuration, issuer: "http://identity.example.test" }, {} as never), /OIDC_ISSUER_HTTPS_REQUIRED/);
  assert.throws(() => buildCompanyAuthOptions({
    ...configuration,
    redirectUri: "https://company.example.test/api/auth/oauth2/callback/wrong-provider",
  }, {} as never), /OIDC_REDIRECT_URI_MISMATCH/);
  assert.throws(() => buildCompanyAuthOptions({ ...configuration, sessionSecret: "short" }, {} as never), /SESSION_SIGNING_KEY_TOO_SHORT/);
});

test("Feishu OAuth reuses the hardened durable session boundary", () => {
  const feishuConfiguration = {
    provider: "FEISHU" as const,
    baseUrl: configuration.baseUrl,
    redirectUri: "https://company.example.test/api/auth/oauth2/callback/feishu",
    appId: "cli_company_os_fixture",
    appSecret: fixtureMaterial("feishu-app"),
    expectedTenantKey: "tenant-company-fixture",
    sessionSecret: configuration.sessionSecret,
    instanceId: "feishu-pilot",
  };
  const options = buildCompanyFeishuAuthOptions(feishuConfiguration, { adapter: "durable-adapter" } as never);

  assert.deepEqual(options.emailAndPassword, { enabled: false });
  assert.equal(options.account?.encryptOAuthTokens, true);
  assert.equal(options.account?.storeStateStrategy, "database");
  assert.deepEqual(options.user?.additionalFields?.assertedEmailHmac, {
    type: "string", required: false, input: true, returned: false, fieldName: "assertedEmailHmac",
  });
  assert.deepEqual(options.rateLimit, { enabled: true, storage: "database" });
  assert.equal(options.advanced?.cookiePrefix, "company-os-feishu-pilot");
  assert.equal(options.plugins?.[0]?.id, "generic-oauth");
  assert.equal(buildConfiguredCompanyAuthOptions(feishuConfiguration,
    { adapter: "durable-adapter" } as never).plugins?.[0]?.id, "generic-oauth");
});
