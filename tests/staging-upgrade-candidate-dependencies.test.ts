import assert from "node:assert/strict";
import test from "node:test";

import { renderStagingUpgradeCandidateDependencies } from
  "../adapters/config/staging-upgrade-candidate-dependencies.ts";
import { parseStagingDependencyManifest } from
  "../adapters/config/staging-dependency-manifest.ts";

const image = (name: string, value: string) => `ghcr.io/example/${name}@sha256:${value.repeat(64)}`;
const runtime = { schemaVersion: 1, product: "company-os", environment: "STAGING",
  operationId: "upgrade-rc4-to-rc5", siteId: "company-os-hong-kong",
  active: { releaseId: `0.1.0-rc.4-${"a".repeat(12)}`, composeProject: "company-os-active",
    productNetwork: "company-os-active", ports: { api: 4601, web: 4600, referenceDataNode: 4322 } },
  candidate: { releaseId: `0.1.0-rc.5-${"b".repeat(12)}`, composeProject: "company-os-candidate",
    productNetwork: "company-os-candidate", ports: { api: 14601, web: 14600, referenceDataNode: 14322 },
    serviceIds: { api: "api-candidate", web: "web-candidate", secretBroker: "broker-candidate",
      agentNode: "agent-candidate", dataNode: "data-candidate" }, parallelDatabaseReference: "database:candidate",
    secretProjectionReference: "secret:candidate", ingressRouteReference: "route:active",
    resourceBudget: { maximumMemoryBytes: 2_684_354_560, maximumCpu: 2.5, maximumPids: 640,
      requiredHostHeadroomBytes: 1_073_741_824 }, images: { api: image("api", "1"), web: image("web", "2"),
      ops: image("ops", "3"), codexAgentNode: image("agent", "4"), vaultSecretBroker: image("broker", "5"),
      referenceDataNode: image("data", "6") } } } as const;
function manifest() { return { schemaVersion: 1, environment: "STAGING", deploymentId: "company-os-hong-kong",
  ingress: { webOrigin: "https://company-os.example", apiOrigin: "https://api.company-os.example",
    ownerReference: "team:infra", dnsEvidenceReference: "evidence:dns", tlsEvidenceReference: "evidence:tls" },
  isolation: { deploymentRoot: "/srv/company-os/staging", composeProject: "company-os-active",
    network: "company-os-active", webLoopbackPort: 4600, apiLoopbackPort: 4601 },
  postgres: { majorVersion: 16, ownership: "DEDICATED", tlsMode: "VERIFY_FULL",
    coordinateSource: "SECRET_FILES", ownerReference: "team:db", evidenceReference: "evidence:db" },
  oidc: { issuer: "https://identity.example", discoveryUrl: "https://identity.example/.well-known/openid-configuration",
    clientId: "company-os-staging", ownership: "PRODUCT_SCOPED_CLIENT", pkce: "S256",
    ownerReference: "team:identity", evidenceReference: "evidence:identity" },
  vaultBroker: { baseUrl: "https://vault.example", ownership: "DEDICATED", ownerReference: "team:vault",
    evidenceReference: "evidence:vault" }, agentNode: { baseUrl: "https://agent.example", ownership: "DEDICATED",
    ownerReference: "team:agent", evidenceReference: "evidence:agent" },
  dataNode: { baseUrl: "https://data.example", ownership: "DEDICATED", ownerReference: "team:data",
    evidenceReference: "evidence:data" }, backup: { provider: "ZOS_S3_COMPATIBLE",
    endpoint: "https://zos.example", region: "us-east-1", bucket: "company-os-backup",
    ownership: "DEDICATED", versioning: true, objectLock: "DISABLED",
    credentialSource: "VAULT_RENDERED_FILES", ownerReference: "team:backup",
    evidenceReference: "evidence:backup" } } as const; }

test("candidate dependency manifest preserves ownership while replacing only runtime isolation", () => {
  const rendered = renderStagingUpgradeCandidateDependencies(runtime, JSON.stringify(manifest()));
  const parsed = parseStagingDependencyManifest(JSON.parse(rendered));
  assert.equal(parsed.isolation.composeProject, runtime.candidate.composeProject);
  assert.equal(parsed.isolation.network, runtime.candidate.productNetwork);
  assert.equal(parsed.isolation.apiLoopbackPort, runtime.candidate.ports.api);
  assert.equal(parsed.isolation.webLoopbackPort, runtime.candidate.ports.web);
  assert.deepEqual(parsed.postgres, manifest().postgres);
  assert.deepEqual(parsed.oidc, manifest().oidc);
});

test("candidate dependency manifest rejects a source that is not the active topology", () => {
  const value: any = structuredClone(manifest()); value.isolation.apiLoopbackPort = 9999;
  assert.throws(() => renderStagingUpgradeCandidateDependencies(runtime, JSON.stringify(value)),
    /STAGING_UPGRADE_DEPENDENCY_ACTIVE_TOPOLOGY_MISMATCH/);
});
