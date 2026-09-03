import assert from "node:assert/strict";
import test from "node:test";
import { generateIndependentDeploymentHandoff } from
  "../application/generate-independent-deployment-handoff.ts";

test("independent handoff binds release, domain, callback, migration, acceptance and rollback without secrets", () => {
  const handoff = generateIndependentDeploymentHandoff({
    companyName: "Beta Company",
    slug: "beta-company",
    domain: "os.beta.example",
    appId: "cli_beta",
    releaseId: "0.2.0-abcdef123456",
  });
  assert.equal(handoff.mode, "INDEPENDENT");
  assert.equal(handoff.endpoint.identityCallbackUrl,
    "https://os.beta.example/api/auth/oauth2/callback/feishu");
  assert.equal(handoff.identity.secretSource, "CUSTOMER_ENVIRONMENT_ONLY");
  assert.equal(handoff.release.migration, "0009_tenant_signup_invites");
  assert.ok(handoff.acceptance.length >= 3);
  assert.ok(handoff.rollback.length >= 2);
  assert.doesNotMatch(JSON.stringify(handoff), /(?:appSecret|clientSecretValue|password)\s*[":=]/i);
});

test("independent handoff supports standard OIDC and a customer-owned identity adapter", () => {
  const base = {
    companyName: "Beta Company", slug: "beta-company", domain: "os.beta.example",
    releaseId: "0.2.0-abcdef123456",
  };
  const oidc = generateIndependentDeploymentHandoff({
    ...base, appId: "company-os-client", identityProvider: "OIDC",
  });
  assert.equal(oidc.endpoint.identityCallbackUrl,
    "https://os.beta.example/api/auth/oauth2/callback/enterprise-oidc");
  const custom = generateIndependentDeploymentHandoff({
    ...base, appId: "@customer/company-os-identity", identityProvider: "CUSTOM_ADAPTER",
  });
  assert.equal(custom.endpoint.identityCallbackUrl, null);
  assert.equal(custom.identity.configurationReference, "@customer/company-os-identity");
});

test("independent handoff rejects unsafe domains and malformed identifiers", () => {
  const base = {
    companyName: "Beta Company", slug: "beta-company", domain: "os.beta.example",
    appId: "cli_beta", releaseId: "0.2.0-abcdef123456",
  };
  for (const input of [
    { ...base, domain: "localhost" },
    { ...base, domain: "user:pass@beta.example" },
    { ...base, slug: "../beta" },
    { ...base, releaseId: "latest" },
  ]) assert.throws(() => generateIndependentDeploymentHandoff(input));
});
