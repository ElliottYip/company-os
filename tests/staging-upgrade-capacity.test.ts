import assert from "node:assert/strict";
import test from "node:test";

import { evaluateStagingUpgradeCapacity } from
  "../adapters/config/staging-upgrade-capacity.ts";
import { siteRuntimeFixture } from "./fixtures/site-runtime-fixture.ts";

const image = (name: string, value: string) => `ghcr.io/example/${name}@sha256:${value.repeat(64)}`;
const images = { api: image("api", "1"), web: image("web", "2"), ops: image("ops", "3"),
  codexAgentNode: image("agent", "4"), vaultSecretBroker: image("broker", "5"),
  referenceDataNode: image("data", "6") };

function inputs() {
  const site = siteRuntimeFixture({ root: "/srv/company-os/staging",
    releaseId: `0.1.0-rc.4-${"a".repeat(12)}`, images }).site;
  const runtime = {
    schemaVersion: 1, product: "company-os", environment: "STAGING",
    operationId: "upgrade-rc4-to-rc5", siteId: site.site.id,
    active: { releaseId: site.product.releaseId, composeProject: site.site.composeProject,
      productNetwork: site.site.productNetwork, ports: site.site.ports },
    candidate: { releaseId: `0.1.0-rc.5-${"b".repeat(12)}`,
      composeProject: "company-os-test-site-candidate", productNetwork: "company-os-test-site-candidate",
      ports: { api: 14601, web: 14600, referenceDataNode: 14322 },
      serviceIds: { api: "api-candidate", web: "web-candidate", secretBroker: "broker-candidate",
        agentNode: "agent-candidate", dataNode: "data-candidate" },
      parallelDatabaseReference: "database:parallel-target",
      secretProjectionReference: "secret-projection:candidate",
      ingressRouteReference: "route:active",
      resourceBudget: { maximumMemoryBytes: 2_684_354_560, maximumCpu: 2.5,
        maximumPids: 640, requiredHostHeadroomBytes: 1_073_741_824 }, images },
  };
  const snapshot = { schemaVersion: 1, capturedAt: "2026-08-27T12:00:00.000Z",
    logicalCpuCount: 8, totalMemoryBytes: 12_000_000_000,
    availableMemoryBytes: 8_000_000_000, pidMaximum: 4096 };
  return { site, runtime, snapshot };
}

test("capacity admission accounts for active, candidate and host reserve before creation", () => {
  const { site, runtime, snapshot } = inputs();
  const result = evaluateStagingUpgradeCapacity(runtime, site, snapshot);
  assert.equal(result.status, "READY_FOR_CANDIDATE_CREATION");
  assert.equal(result.requirements.totalMemoryBytes, 6_958_096_384);
  assert.equal(result.requirements.availableMemoryBytes, 3_758_096_384);
  assert.equal(result.requirements.logicalCpuCount, 5.55);
  assert.equal(result.requirements.pidMaximum, 1568);
  assert.equal(result.swapAdmitted, false);
  assert.equal(result.runtimeObjectsCreated, false);
});

test("a 4 CPU host fails closed even when its 8 GB memory appears sufficient", () => {
  const { site, runtime, snapshot } = inputs();
  const result = evaluateStagingUpgradeCapacity(runtime, site, {
    ...snapshot, logicalCpuCount: 4, totalMemoryBytes: 8_000_000_000,
    availableMemoryBytes: 6_300_000_000,
  });
  assert.equal(result.status, "NOT_READY");
  assert.deepEqual(result.findings, [
    { code: "UPGRADE_CPU_CAPACITY_INSUFFICIENT", subject: "host-cpu" },
  ]);
});

test("capacity admission rejects stale active binding and malformed observations", () => {
  const { site, runtime, snapshot } = inputs();
  assert.throws(() => evaluateStagingUpgradeCapacity({ ...runtime,
    active: { ...runtime.active, composeProject: "some-other-active" } }, site, snapshot),
  /STAGING_UPGRADE_CAPACITY_ACTIVE_BINDING_MISMATCH/);
  assert.throws(() => evaluateStagingUpgradeCapacity(runtime, site,
    { ...snapshot, availableMemoryBytes: snapshot.totalMemoryBytes + 1 }),
  /STAGING_UPGRADE_CAPACITY_SNAPSHOT_INVALID/);
  assert.throws(() => evaluateStagingUpgradeCapacity(runtime, site,
    { ...snapshot, swapBytes: 10_000_000_000 }), /STAGING_UPGRADE_CAPACITY_SNAPSHOT_INVALID/);
});
