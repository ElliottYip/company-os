import assert from "node:assert/strict";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseStagingDependencyManifest } from
  "../adapters/config/staging-dependency-manifest.ts";
import { validateStagingDependencies } from "../scripts/validate-staging-dependencies.ts";

const expected = {
  deploymentId: "company-os-staging-raft-xin", webOrigin: "https://company-os.raft.xin",
  apiOrigin: "https://company-os-api.raft.xin", deploymentRoot: "/srv/company-os/staging",
  composeProject: "company-os-staging", network: "company-os-staging_internal",
  webLoopbackPort: 4600, apiLoopbackPort: 4601,
} as const;

function manifest() {
  return {
    schemaVersion: 1, environment: "STAGING", deploymentId: expected.deploymentId,
    ingress: { webOrigin: expected.webOrigin, apiOrigin: expected.apiOrigin,
      ownerReference: "team:infrastructure", dnsEvidenceReference: "evidence:dns-01",
      tlsEvidenceReference: "evidence:tls-01" },
    isolation: { deploymentRoot: expected.deploymentRoot, composeProject: expected.composeProject,
      network: expected.network, webLoopbackPort: 4600, apiLoopbackPort: 4601 },
    postgres: { majorVersion: 16, ownership: "DEDICATED", tlsMode: "VERIFY_FULL",
      coordinateSource: "SECRET_FILES", ownerReference: "team:database",
      evidenceReference: "evidence:postgres-01" },
    oidc: { issuer: "https://identity.staging.example", clientId: "company-os-staging",
      discoveryUrl: "https://identity.staging.example/.well-known/openid-configuration",
      ownership: "PRODUCT_SCOPED_CLIENT", pkce: "S256", ownerReference: "team:identity",
      evidenceReference: "evidence:oidc-01" },
    vaultBroker: { baseUrl: "https://vault-broker.staging.example", ownership: "DEDICATED",
      ownerReference: "team:secrets", evidenceReference: "evidence:vault-01" },
    agentNode: { baseUrl: "https://agent-node.staging.example", ownership: "DEDICATED",
      ownerReference: "team:agent-runtime", evidenceReference: "evidence:agent-node-01" },
    dataNode: { baseUrl: "https://data-node.staging.example", ownership: "DEDICATED",
      ownerReference: "team:data-runtime", evidenceReference: "evidence:data-node-01" },
    backup: { provider: "ZOS_S3_COMPATIBLE", endpoint: "https://hangzhou7.zos.ctyun.cn",
      region: "us-east-1", bucket: "company-os-staging-backup", ownership: "DEDICATED",
      versioning: true, objectLock: "DISABLED", credentialSource: "VAULT_RENDERED_FILES",
      ownerReference: "team:backup", evidenceReference: "evidence:backup-01" },
  };
}

test("staging dependency contract binds every external capability to a dedicated owner and evidence", () => {
  const result = parseStagingDependencyManifest(manifest(), expected);
  assert.equal(result.postgres.majorVersion, 16);
  assert.equal(result.oidc.pkce, "S256");
  assert.equal(result.backup.versioning, true);
  assert.equal(result.agentNode.baseUrl, "https://agent-node.staging.example");
});
test("staging dependency contract rejects production reuse, credentials, weak transport and drift", () => {
  for (const mutate of [
    (value: ReturnType<typeof manifest>) => { value.backup.bucket = "generator001y"; },
    (value: ReturnType<typeof manifest>) => { value.agentNode.baseUrl = "http://agent.example"; },
    (value: ReturnType<typeof manifest>) => { value.vaultBroker.baseUrl = "https://user:password@vault.example"; },
    (value: ReturnType<typeof manifest>) => { value.isolation.composeProject = "buzz-prod"; },
    (value: ReturnType<typeof manifest>) => { value.ingress.webOrigin = "https://other.example"; },
  ]) {
    const value = manifest(); mutate(value);
    assert.throws(() => parseStagingDependencyManifest(value, expected),
      /STAGING_DEPENDENCY_(?:MANIFEST_INVALID|EXPECTATION_MISMATCH)/);
  }
});

test("staging dependency file produces a stable secret-free deployment admission digest", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-staging-dependencies-"));
  const path = join(directory, "dependencies.json");
  await writeFile(path, `${JSON.stringify(manifest())}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
  const result = await validateStagingDependencies(path);
  assert.equal(result.status, "READY_FOR_STAGING_DEPLOYMENT");
  assert.match(result.manifestDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.secretsPresent, false);
  assert.doesNotMatch(JSON.stringify(result), /identity\.staging|agent-node|bucket|token|password/i);
});
