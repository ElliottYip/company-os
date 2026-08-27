import assert from "node:assert/strict";
import test from "node:test";

import { parseStagingUpgradeRuntimeContract } from
  "../adapters/config/staging-upgrade-runtime-contract.ts";

const image = (name: string, value: string) => `ghcr.io/example/${name}@sha256:${value.repeat(64)}`;

function contract() {
  return {
    schemaVersion: 1,
    product: "company-os",
    environment: "STAGING",
    operationId: "upgrade-rc4-to-rc5",
    siteId: "company-os-hong-kong",
    active: {
      releaseId: `0.1.0-rc.4-${"a".repeat(12)}`,
      composeProject: "company-os-hong-kong",
      productNetwork: "company-os-hong-kong-product",
      ports: { api: 4601, web: 4600, referenceDataNode: 4322 },
    },
    candidate: {
      releaseId: `0.1.0-rc.5-${"b".repeat(12)}`,
      composeProject: "company-os-hong-kong-candidate-rc5",
      productNetwork: "company-os-hong-kong-candidate-rc5",
      ports: { api: 14601, web: 14600, referenceDataNode: 14322 },
      serviceIds: { api: "api-candidate-rc5", web: "web-candidate-rc5",
        secretBroker: "broker-candidate-rc5", agentNode: "agent-candidate-rc5",
        dataNode: "data-candidate-rc5" },
      parallelDatabaseReference: "database:upgrade-rc5-empty-target",
      secretProjectionReference: "secret-projection:upgrade-rc5",
      ingressRouteReference: "route:company-os-hong-kong-active",
      resourceBudget: { maximumMemoryBytes: 2_147_483_648, maximumCpu: 2.0,
        maximumPids: 512, requiredHostHeadroomBytes: 536_870_912 },
      images: { api: image("api", "1"), web: image("web", "2"), ops: image("ops", "3"),
        codexAgentNode: image("agent", "4"), vaultSecretBroker: image("broker", "5"),
        referenceDataNode: image("data", "6") },
    },
  };
}

test("candidate runtime contract keeps active and candidate topology disjoint", () => {
  const result = parseStagingUpgradeRuntimeContract(contract());
  assert.notEqual(result.active.composeProject, result.candidate.composeProject);
  assert.notEqual(result.active.productNetwork, result.candidate.productNetwork);
  assert.deepEqual(Object.values(result.candidate.ports), [14601, 14600, 14322]);
  assert.equal(new Set(Object.values(result.candidate.serviceIds)).size, 5);
  assert.doesNotMatch(JSON.stringify(result), /password|client.?secret|bearer.?token|database.?url|issuer/i);
});

test("candidate runtime contract rejects project, network, port, service, and release collisions", () => {
  for (const mutate of [
    (value: ReturnType<typeof contract>) => { value.candidate.composeProject = value.active.composeProject; },
    (value: ReturnType<typeof contract>) => { value.candidate.productNetwork = value.active.productNetwork; },
    (value: ReturnType<typeof contract>) => { value.candidate.ports.api = value.active.ports.api; },
    (value: ReturnType<typeof contract>) => { value.candidate.serviceIds.api = value.candidate.serviceIds.web; },
    (value: ReturnType<typeof contract>) => { value.candidate.releaseId = value.active.releaseId; },
  ]) {
    const value = contract(); mutate(value);
    assert.throws(() => parseStagingUpgradeRuntimeContract(value),
      /STAGING_UPGRADE_RUNTIME_CONTRACT_INVALID/);
  }
});

test("candidate runtime contract rejects mutable images, unknown fields, and customer coordinates", () => {
  const mutable = contract(); mutable.candidate.images.api = "ghcr.io/example/api:latest";
  assert.throws(() => parseStagingUpgradeRuntimeContract(mutable),
    /STAGING_UPGRADE_RUNTIME_CONTRACT_INVALID/);
  assert.throws(() => parseStagingUpgradeRuntimeContract({ ...contract(), unknown: true }),
    /STAGING_UPGRADE_RUNTIME_CONTRACT_INVALID/);
  const coordinate = contract(); coordinate.candidate.ingressRouteReference = "https://customer.example";
  assert.throws(() => parseStagingUpgradeRuntimeContract(coordinate),
    /STAGING_UPGRADE_RUNTIME_CONTRACT_INVALID/);
});
