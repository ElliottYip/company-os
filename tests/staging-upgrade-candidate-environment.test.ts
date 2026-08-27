import assert from "node:assert/strict";
import test from "node:test";

import { renderStagingUpgradeCandidateEnvironment } from
  "../adapters/config/staging-upgrade-candidate-environment.ts";
import { parsePublicStagingEnvironment } from
  "../adapters/config/staging-deployment-doctor.ts";

const image = (name: string, value: string) => `ghcr.io/example/${name}@sha256:${value.repeat(64)}`;

function contract() {
  return { schemaVersion: 1, product: "company-os", environment: "STAGING",
    operationId: "upgrade-rc4-to-rc5", siteId: "company-os-hong-kong",
    active: { releaseId: `0.1.0-rc.4-${"a".repeat(12)}`, composeProject: "company-os-hong-kong",
      productNetwork: "company-os-hong-kong-product",
      ports: { api: 4601, web: 4600, referenceDataNode: 4322 } },
    candidate: { releaseId: `0.1.0-rc.5-${"b".repeat(12)}`,
      composeProject: "company-os-hong-kong-candidate-rc5",
      productNetwork: "company-os-hong-kong-candidate-rc5",
      ports: { api: 14601, web: 14600, referenceDataNode: 14322 },
      serviceIds: { api: "api-candidate-rc5", web: "web-candidate-rc5",
        secretBroker: "broker-candidate-rc5", agentNode: "agent-candidate-rc5",
        dataNode: "data-candidate-rc5" },
      parallelDatabaseReference: "database:upgrade-rc5-empty-target",
      secretProjectionReference: "secret-projection:upgrade-rc5",
      ingressRouteReference: "route:company-os-hong-kong-active",
      resourceBudget: { maximumMemoryBytes: 2_684_354_560, maximumCpu: 2.5,
        maximumPids: 640, requiredHostHeadroomBytes: 1_073_741_824 },
      images: { api: image("api", "1"), web: image("web", "2"), ops: image("ops", "3"),
        codexAgentNode: image("agent", "4"), vaultSecretBroker: image("broker", "5"),
        referenceDataNode: image("data", "6") } } };
}

function activeEnvironment() {
  return [
    `COMPANY_OS_API_IMAGE=${image("api", "a")}`,
    `COMPANY_OS_WEB_IMAGE=${image("web", "a")}`,
    `COMPANY_OS_OPS_IMAGE=${image("ops", "a")}`,
    `COMPANY_OS_REFERENCE_DATA_NODE_IMAGE=${image("data", "a")}`,
    "COMPANY_OS_COMPOSE_PROJECT=company-os-hong-kong",
    "COMPANY_OS_PRODUCT_NETWORK=company-os-hong-kong-product",
    "COMPANY_OS_REFERENCE_DATA_NODE_PORT=4322",
    "COMPANY_OS_WEB_LOOPBACK_PORT=4600",
    "COMPANY_OS_API_LOOPBACK_PORT=4601",
    "COMPANY_OS_PUBLIC_URL=https://api.company-os.example",
    "COMPANY_OS_WEB_ORIGINS=https://company-os.example",
    "COMPANY_OS_OIDC_REDIRECT_URI=https://company-os.example/api/auth/oauth2/callback/enterprise-oidc",
    "COMPANY_OS_INSTANCE_ID=company-os-hong-kong",
    "COMPANY_OS_OIDC_ISSUER=https://identity.company-os.example",
    "COMPANY_OS_OIDC_DISCOVERY_URL=https://identity.company-os.example/.well-known/openid-configuration",
    "COMPANY_OS_OIDC_CLIENT_ID=company-os-staging",
    "COMPANY_OS_TRUSTED_PROXY_CIDRS=127.0.0.1/32,::1/128",
    "COMPANY_OS_RETENTION_POLICY_ID=standard-retention",
    "COMPANY_OS_ACCOUNTABILITY_EXPORT_POLICY_ID=standard-accountability-export",
    "COMPANY_OS_HTTP_AGENT_NODE_ID=agent-active",
    "COMPANY_OS_HTTP_AGENT_NODE_NAME=Active Agent Node",
    "COMPANY_OS_HTTP_AGENT_NODE_BASE_URL=https://agent-active.internal",
    "COMPANY_OS_HTTP_DATA_NODE_ID=data-active",
    "COMPANY_OS_HTTP_DATA_NODE_NAME=Active Data Node",
    "COMPANY_OS_HTTP_DATA_NODE_BASE_URL=https://data-active.internal",
    "COMPANY_OS_HTTP_SECRET_BROKER_ID=broker-active",
    "COMPANY_OS_HTTP_SECRET_BROKER_NAME=Active Broker",
    "COMPANY_OS_HTTP_SECRET_BROKER_BASE_URL=https://broker-active.internal",
    "COMPANY_OS_HTTP_DATA_NODE_SOURCES=acceptance-fixtures",
    "COMPANY_OS_HTTP_DATA_NODE_OPERATIONS=READ",
    "COMPANY_OS_OFF_SITE_BACKUP=DISABLED_PENDING_AUTHORIZATION",
    "COMPANY_OS_PUBLIC_INGRESS=ENABLED",
    "COMPANY_OS_SECRET_DIRECTORY=/etc/company-os/secrets",
    "",
  ].join("\n");
}

test("candidate environment preserves site identity while replacing every parallel runtime coordinate", () => {
  const rendered = renderStagingUpgradeCandidateEnvironment(contract(), activeEnvironment(),
    "/etc/company-os/upgrade-rc5-secrets", "/srv/company-os/upgrade-rc5-public",
    "https://vault.company-os.internal");
  const value = parsePublicStagingEnvironment(rendered);
  assert.equal(value.COMPANY_OS_COMPOSE_PROJECT, "company-os-hong-kong-candidate-rc5");
  assert.equal(value.COMPANY_OS_PRODUCT_NETWORK, "company-os-hong-kong-candidate-rc5");
  assert.equal(value.COMPANY_OS_API_LOOPBACK_PORT, "14601");
  assert.equal(value.COMPANY_OS_WEB_LOOPBACK_PORT, "14600");
  assert.equal(value.COMPANY_OS_REFERENCE_DATA_NODE_PORT, "14322");
  assert.equal(value.COMPANY_OS_API_IMAGE, contract().candidate.images.api);
  assert.equal(value.COMPANY_OS_RELEASE_ID, contract().candidate.releaseId);
  assert.equal(value.COMPANY_OS_HTTP_AGENT_NODE_ID, "agent-candidate-rc5");
  assert.equal(value.COMPANY_OS_HTTP_AGENT_NODE_BASE_URL, "https://agent-candidate-rc5");
  assert.equal(value.COMPANY_OS_HTTP_SECRET_BROKER_BASE_URL, "https://broker-candidate-rc5");
  assert.equal(value.COMPANY_OS_HTTP_DATA_NODE_BASE_URL, "https://data-candidate-rc5");
  assert.equal(value.COMPANY_OS_PUBLIC_URL, "https://api.company-os.example");
  assert.equal(value.COMPANY_OS_OIDC_ISSUER, "https://identity.company-os.example");
  assert.equal(value.COMPANY_OS_PUBLIC_INGRESS, "DISABLED_PRE_CUTOVER");
  assert.equal(value.COMPANY_OS_OFF_SITE_BACKUP, "DISABLED_PENDING_AUTHORIZATION");
  assert.equal(value.COMPANY_OS_SECRET_DIRECTORY, "/etc/company-os/upgrade-rc5-secrets");
  assert.equal(value.COMPANY_OS_CANDIDATE_EXECUTION_COMPOSE_PROJECT,
    "company-os-hong-kong-candidate-rc5-execution");
  assert.equal(value.COMPANY_OS_CANDIDATE_VAULT_ADDRESS, "https://vault.company-os.internal");
  assert.doesNotMatch(rendered, /client.?secret|bearer.?token|database.?url|password/i);
});

test("candidate environment rejects active topology drift and insufficient runtime budget", () => {
  assert.throws(() => renderStagingUpgradeCandidateEnvironment(contract(),
    activeEnvironment().replace("COMPANY_OS_API_LOOPBACK_PORT=4601", "COMPANY_OS_API_LOOPBACK_PORT=9999"),
  "/etc/company-os/upgrade-rc5-secrets", "/srv/company-os/upgrade-rc5-public",
  "https://vault.company-os.internal"), /STAGING_UPGRADE_ACTIVE_ENVIRONMENT_MISMATCH/);
  const low = contract(); low.candidate.resourceBudget.maximumMemoryBytes = 800_000_000;
  assert.throws(() => renderStagingUpgradeCandidateEnvironment(low, activeEnvironment(),
    "/etc/company-os/upgrade-rc5-secrets", "/srv/company-os/upgrade-rc5-public",
    "https://vault.company-os.internal"), /STAGING_UPGRADE_RUNTIME_CONTRACT_INVALID/);
});

test("candidate environment rejects unsafe Secret projection paths and private input", () => {
  assert.throws(() => renderStagingUpgradeCandidateEnvironment(contract(), activeEnvironment(), "relative",
    "/srv/company-os/upgrade-rc5-public", "https://vault.company-os.internal"),
    /STAGING_UPGRADE_SECRET_PROJECTION_PATH_INVALID/);
  assert.throws(() => renderStagingUpgradeCandidateEnvironment(contract(),
    `${activeEnvironment()}COMPANY_OS_DATABASE_URL=postgres://private\n`,
  "/etc/company-os/upgrade-rc5-secrets", "/srv/company-os/upgrade-rc5-public",
  "https://vault.company-os.internal"), /STAGING_PUBLIC_ENV_SECRET_KEY_FORBIDDEN/);
  assert.throws(() => renderStagingUpgradeCandidateEnvironment(contract(), activeEnvironment(),
    "/etc/company-os/upgrade-rc5-secrets", "/srv/company-os/upgrade-rc5-public", "http://vault"),
  /STAGING_UPGRADE_CANDIDATE_VAULT_ADDRESS_INVALID/);
});
