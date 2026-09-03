import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateStagingDeploymentReadiness,
  parsePublicStagingEnvironment,
  type StagingDeploymentSnapshot,
} from "../adapters/config/staging-deployment-doctor.ts";

const digest = (name: string) => `ghcr.io/example/${name}@sha256:${"a".repeat(64)}`;

function readySnapshot(): StagingDeploymentSnapshot {
  return {
    root: { path: "/srv/company-os/staging", exists: true, mode: 0o750 },
    secretDirectory: {
      path: "/etc/company-os/secrets",
      exists: true,
      mode: 0o700,
      files: [
        "migration-database-url", "runtime-database-url", "runtime-database-password",
        "oidc-client-secret", "session-signing-key", "agent-node-bearer-token",
        "data-node-bearer-token", "secret-broker-bearer-token", "internal-ca-cert.pem",
        "backup-encryption-key",
        "zos-access-key-id", "zos-secret-access-key",
      ].map((name) => ({ name, kind: "file" as const, mode: 0o400, size: 64 })),
    },
    runtime: { dockerAvailable: true, composeAvailable: true, cpuCount: 2,
      totalMemoryBytes: 3_500_000_000, freeDiskBytes: 12_000_000_000 },
    target: { composeProject: "company-os-hong-kong", network: "company-os-hong-kong-product",
      composeProjectExists: false, targetNetworkExists: false,
      loopbackPorts: [{ port: 4322, status: "FREE" }, { port: 4600, status: "FREE" },
        { port: 4601, status: "FREE" }] },
    publicEnvironment: {
      COMPANY_OS_API_IMAGE: digest("api"), COMPANY_OS_WEB_IMAGE: digest("web"),
      COMPANY_OS_OPS_IMAGE: digest("ops"),
      COMPANY_OS_REFERENCE_DATA_NODE_IMAGE: digest("reference-data-node"),
      COMPANY_OS_OIDC_ISSUER: "https://identity.staging.example",
      COMPANY_OS_OIDC_DISCOVERY_URL: "https://identity.staging.example/.well-known/openid-configuration",
      COMPANY_OS_OIDC_CLIENT_ID: "company-os-staging",
      COMPANY_OS_COMPOSE_PROJECT: "company-os-hong-kong",
      COMPANY_OS_PRODUCT_NETWORK: "company-os-hong-kong-product",
      COMPANY_OS_REFERENCE_DATA_NODE_PORT: "4322",
      COMPANY_OS_WEB_LOOPBACK_PORT: "4600",
      COMPANY_OS_API_LOOPBACK_PORT: "4601",
      COMPANY_OS_HTTP_AGENT_NODE_BASE_URL: "https://agent.staging.example",
      COMPANY_OS_HTTP_DATA_NODE_BASE_URL: "https://data.staging.example",
      COMPANY_OS_HTTP_SECRET_BROKER_BASE_URL: "https://broker.staging.example",
      COMPANY_OS_OFF_SITE_BACKUP: "DISABLED_PENDING_AUTHORIZATION",
    },
  };
}

test("staging doctor admits an isolated immutable install without reading secret values", () => {
  const result = evaluateStagingDeploymentReadiness(readySnapshot());
  assert.deepEqual(result, { schemaVersion: 1, mode: "INSTALL", status: "READY", findings: [] });
  assert.doesNotMatch(JSON.stringify(result), /database-url|client-secret|bearer-token|signing-key/);
});

test("staging doctor admits Feishu with only the provider-specific public coordinates and secret", () => {
  const snapshot = readySnapshot();
  const publicEnvironment = { ...snapshot.publicEnvironment,
    COMPANY_OS_IDENTITY_PROVIDER: "FEISHU",
    COMPANY_OS_FEISHU_APP_ID: "cli_company_os",
    COMPANY_OS_FEISHU_TENANT_KEY: "tenant_company_os",
    COMPANY_OS_FEISHU_REDIRECT_URI: "https://api.company.example/api/auth/oauth2/callback/feishu",
  };
  delete publicEnvironment.COMPANY_OS_OIDC_ISSUER;
  delete publicEnvironment.COMPANY_OS_OIDC_DISCOVERY_URL;
  delete publicEnvironment.COMPANY_OS_OIDC_CLIENT_ID;
  const files = snapshot.secretDirectory.files
    .filter(({ name }) => name !== "oidc-client-secret")
    .concat({ name: "feishu-app-secret", kind: "file" as const, mode: 0o400, size: 64 });
  const result = evaluateStagingDeploymentReadiness({ ...snapshot, publicEnvironment,
    secretDirectory: { ...snapshot.secretDirectory, files } });
  assert.deepEqual(result, { schemaVersion: 1, mode: "INSTALL", status: "READY", findings: [] });
});

test("staging doctor fails closed for an unsupported identity provider", () => {
  const snapshot = readySnapshot();
  const result = evaluateStagingDeploymentReadiness({ ...snapshot, publicEnvironment: {
    ...snapshot.publicEnvironment, COMPANY_OS_IDENTITY_PROVIDER: "SAML",
  } });
  assert.equal(result.findings[0]?.code, "STAGING_IDENTITY_PROVIDER_INVALID");
});

test("off-site backup is capability-gated instead of blocking first start", () => {
  const snapshot = readySnapshot();
  const enabled = evaluateStagingDeploymentReadiness({ ...snapshot, publicEnvironment: {
    ...snapshot.publicEnvironment, COMPANY_OS_OFF_SITE_BACKUP: "ENABLED",
  } });
  assert.deepEqual(enabled.findings, [
    { code: "STAGING_PUBLIC_CONFIG_MISSING", subject: "COMPANY_OS_BACKUP_S3_REGION" },
    { code: "STAGING_PUBLIC_CONFIG_MISSING", subject: "COMPANY_OS_BACKUP_S3_BUCKET" },
    { code: "STAGING_HTTPS_COORDINATE_REQUIRED", subject: "COMPANY_OS_BACKUP_S3_ENDPOINT" },
  ]);
});

test("initial staging start does not require opt-in backup credentials", () => {
  const snapshot = readySnapshot();
  const startupSecrets = snapshot.secretDirectory.files.filter(({ name }) => ![
    "backup-encryption-key", "zos-access-key-id", "zos-secret-access-key",
  ].includes(name));
  const result = evaluateStagingDeploymentReadiness({ ...snapshot,
    secretDirectory: { ...snapshot.secretDirectory, files: startupSecrets } });
  assert.deepEqual(result, { schemaVersion: 1, mode: "INSTALL", status: "READY", findings: [] });
});

test("staging doctor requires the privileged operator image by immutable digest", () => {
  const snapshot = readySnapshot();
  const { COMPANY_OS_OPS_IMAGE: _omitted, ...withoutOpsImage } = snapshot.publicEnvironment;
  const result = evaluateStagingDeploymentReadiness({ ...snapshot, publicEnvironment: withoutOpsImage });
  assert.deepEqual(result.findings, [
    { code: "STAGING_IMAGE_NOT_IMMUTABLE", subject: "COMPANY_OS_OPS_IMAGE" },
  ]);
});

test("staging doctor reports every actionable precondition with stable codes", () => {
  const snapshot = readySnapshot();
  const result = evaluateStagingDeploymentReadiness({
    ...snapshot,
    root: { ...snapshot.root, exists: false },
    secretDirectory: { ...snapshot.secretDirectory, mode: 0o755,
      files: snapshot.secretDirectory.files.map((file, index) => index === 0
        ? { ...file, kind: "symlink" as const, mode: 0o644, size: 0 }
        : file).filter(({ name }) => name !== "secret-broker-bearer-token") },
    runtime: { ...snapshot.runtime, composeAvailable: false, freeDiskBytes: 2_000_000_000 },
    target: { ...snapshot.target, composeProjectExists: true, targetNetworkExists: true,
      loopbackPorts: [{ port: 4600, status: "OCCUPIED" }, { port: 4601, status: "FREE" }] },
    publicEnvironment: { ...snapshot.publicEnvironment, COMPANY_OS_API_IMAGE: "ghcr.io/example/api:latest",
      COMPANY_OS_OIDC_ISSUER: "http://identity.staging.example" },
  });
  assert.equal(result.status, "NOT_READY");
  assert.deepEqual(result.findings.map(({ code }) => code), [
    "STAGING_ROOT_MISSING", "SECRET_DIRECTORY_MODE_UNSAFE", "SECRET_FILE_UNSAFE",
    "SECRET_FILE_MISSING", "COMPOSE_UNAVAILABLE", "HOST_DISK_BUDGET_INSUFFICIENT",
    "STAGING_PROJECT_ALREADY_EXISTS", "STAGING_NETWORK_ALREADY_EXISTS", "STAGING_PORT_OCCUPIED",
    "STAGING_IMAGE_NOT_IMMUTABLE", "STAGING_HTTPS_COORDINATE_REQUIRED",
  ]);
  assert.equal(result.findings.find(({ code }) => code === "STAGING_PROJECT_ALREADY_EXISTS")?.subject,
    "company-os-hong-kong");
  assert.equal(result.findings.find(({ code }) => code === "STAGING_NETWORK_ALREADY_EXISTS")?.subject,
    "company-os-hong-kong-product");
});

test("public staging environment rejects secret-shaped keys before retaining configuration", () => {
  assert.throws(() => parsePublicStagingEnvironment("COMPANY_OS_API_IMAGE=x\nOIDC_CLIENT_SECRET=do-not-retain\n"),
    /STAGING_PUBLIC_ENV_SECRET_KEY_FORBIDDEN/);
  assert.throws(() => parsePublicStagingEnvironment("COMPANY_OS_FEISHU_APP_SECRET=do-not-retain\n"),
    /STAGING_PUBLIC_ENV_SECRET_KEY_FORBIDDEN/);
  assert.deepEqual(parsePublicStagingEnvironment("# public only\nCOMPANY_OS_OIDC_CLIENT_ID=company-os-staging\n"),
    { COMPANY_OS_OIDC_CLIENT_ID: "company-os-staging" });
  assert.deepEqual(parsePublicStagingEnvironment(
    "COMPANY_OS_SECRET_DIRECTORY=/etc/company-os/secrets\n" +
    "COMPANY_OS_HTTP_SECRET_BROKER_BASE_URL=https://broker.staging.example\n"), {
    COMPANY_OS_SECRET_DIRECTORY: "/etc/company-os/secrets",
    COMPANY_OS_HTTP_SECRET_BROKER_BASE_URL: "https://broker.staging.example",
  });
  assert.throws(() => parsePublicStagingEnvironment("COMPANY_OS_OIDC_CLIENT_ID=a\nCOMPANY_OS_OIDC_CLIENT_ID=b\n"),
    /STAGING_PUBLIC_ENV_DUPLICATE_KEY/);
});
