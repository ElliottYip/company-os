import assert from "node:assert/strict";
import test from "node:test";
import { getFormalAccessStatus } from "../application/get-formal-access-status.ts";

function fixtureMaterial(label: string, minimumLength = 16): string {
  return `${label}-fixture-material-`.padEnd(minimumLength, "x");
}

test("formal access is fail-closed until every OIDC server setting exists", () => {
  const status = getFormalAccessStatus({
    deploymentProfile: "self-hosted",
    configuration: { issuer: "https://identity.example.test" },
  });

  assert.equal(status.entryState, "BLOCKED");
  assert.deepEqual(status.blockers, [{
    code: "FORMAL_OIDC_NOT_CONFIGURED",
    parameters: { missing: ["publicBaseUrl", "discoveryUrl", "clientId", "clientSecret", "redirectUri", "sessionSigningKey", "databaseUrl"] },
  }]);
  assert.equal(status.capabilities.diagnostics, true);
  assert.equal(status.capabilities.identitySettings, true);
  assert.equal(status.capabilities.companyData, false);
  assert.equal(status.capabilities.execution, false);
  assert.equal(status.capabilities.approval, false);
});

test("configured OIDC still requires a formal session before company access", () => {
  const configuration = {
    publicBaseUrl: "https://company.example.test",
    issuer: "https://identity.example.test",
    discoveryUrl: "https://identity.example.test/.well-known/openid-configuration",
    clientId: "company-os",
    clientSecret: fixtureMaterial("oidc-client"),
    redirectUri: "https://company.example.test/auth/callback",
    sessionSigningKey: fixtureMaterial("session-signing", 40),
    databaseUrl: "postgres://fixture.invalid/company_os",
  };
  const signedOut = getFormalAccessStatus({ deploymentProfile: "managed-cloud", configuration });
  const signedIn = getFormalAccessStatus({
    deploymentProfile: "managed-cloud",
    configuration,
    authenticated: true,
  });

  assert.equal(signedOut.entryState, "AUTHENTICATION_REQUIRED");
  assert.deepEqual(signedOut.blockers, [{ code: "FORMAL_IDENTITY_REQUIRED", parameters: {} }]);
  assert.equal(signedOut.capabilities.companyData, false);
  assert.equal(signedIn.entryState, "READY");
  assert.deepEqual(signedIn.blockers, []);
  assert.equal(signedIn.capabilities.companyData, true);
  assert.equal(signedIn.capabilities.governance, true);
});

test("configured OIDC fails closed when its durable session runtime is unavailable", () => {
  const status = getFormalAccessStatus({
    deploymentProfile: "self-hosted",
    configuration: {
      publicBaseUrl: "https://company.example.test",
      issuer: "https://identity.example.test",
      discoveryUrl: "https://identity.example.test/.well-known/openid-configuration",
      clientId: "company-os",
      clientSecret: fixtureMaterial("oidc-client"),
      redirectUri: "https://company.example.test/api/auth/oauth2/callback/enterprise-oidc",
      sessionSigningKey: fixtureMaterial("session-signing", 40),
      databaseUrl: "postgres://fixture.invalid/company_os",
    },
    identityRuntimeHealthy: false,
  });
  assert.equal(status.entryState, "BLOCKED");
  assert.deepEqual(status.blockers, [{ code: "FORMAL_IDENTITY_RUNTIME_UNAVAILABLE", parameters: {} }]);
  assert.equal(status.capabilities.companyData, false);
});

test("configured Feishu OAuth exposes the exact provider without requiring OIDC discovery", () => {
  const status = getFormalAccessStatus({
    deploymentProfile: "self-hosted",
    configuration: {
      provider: "FEISHU",
      publicBaseUrl: "https://company.example.test",
      feishuAppId: "cli_company_os_fixture",
      feishuAppSecret: fixtureMaterial("feishu-app"),
      feishuTenantKey: "tenant-company-fixture",
      redirectUri: "https://company.example.test/api/auth/oauth2/callback/feishu",
      sessionSigningKey: fixtureMaterial("session-signing", 40),
      databaseUrl: "postgres://fixture.invalid/company_os",
    },
  });

  assert.equal(status.entryState, "AUTHENTICATION_REQUIRED");
  assert.deepEqual(status.identityProvider, {
    protocol: "OAUTH2",
    providerId: "feishu",
    configured: true,
  });
});
