import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { admitStagingUpgradeCapacity, readCurrentStagingUpgradeCapacityAdmission } from
  "../scripts/admit-staging-upgrade-capacity.ts";
import { siteRuntimeFixture } from "./fixtures/site-runtime-fixture.ts";

const image = (name: string, value: string) => `ghcr.io/example/${name}@sha256:${value.repeat(64)}`;
const images = { api: image("api", "1"), web: image("web", "2"), ops: image("ops", "3"),
  codexAgentNode: image("agent", "4"), vaultSecretBroker: image("broker", "5"),
  referenceDataNode: image("data", "6") };
const now = "2026-08-27T12:00:00.000Z";

async function fixture(context: test.TestContext) {
  const temporary = await mkdtemp(join(tmpdir(), "company-os-upgrade-capacity-evidence-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const root = join(temporary, "target"); await mkdir(root, { mode: 0o750 });
  const releaseId = `0.1.0-rc.4-${"a".repeat(12)}`;
  const site = siteRuntimeFixture({ root, releaseId, images }).site;
  const runtime = { schemaVersion: 1, product: "company-os", environment: "STAGING",
    operationId: "upgrade-rc4-to-rc5", siteId: site.site.id,
    active: { releaseId, composeProject: site.site.composeProject,
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
        maximumPids: 640, requiredHostHeadroomBytes: 1_073_741_824 }, images } };
  const runtimeFile = join(temporary, "runtime.json"); const siteFile = join(temporary, "site.json");
  await Promise.all([writeFile(runtimeFile, `${JSON.stringify(runtime)}\n`, { mode: 0o600 }),
    writeFile(siteFile, `${JSON.stringify(site)}\n`, { mode: 0o600 })]);
  return { root, runtimeFile, siteFile };
}

test("capacity evidence is short-lived, digest-bound and retained append-only", async (context) => {
  const value = await fixture(context);
  const capture = async () => ({ schemaVersion: 1 as const, capturedAt: now, logicalCpuCount: 8,
    totalMemoryBytes: 12_000_000_000, availableMemoryBytes: 8_000_000_000, pidMaximum: 4096 });
  const admitted = await admitStagingUpgradeCapacity({ rootDirectory: value.root,
    runtimeContractFile: value.runtimeFile, activeSiteManifestFile: value.siteFile },
  { now: () => now, capture });
  assert.equal(admitted.status, "READY_FOR_CANDIDATE_CREATION");
  assert.equal(admitted.expiresAt, "2026-08-27T12:05:00.000Z");
  assert.equal(admitted.runtimeObjectsCreated, false);
  const current = await readCurrentStagingUpgradeCapacityAdmission({ rootDirectory: value.root,
    operationId: admitted.operationId, runtimeContractDigest: admitted.bindings.runtimeContractDigest,
    activeSiteManifestDigest: admitted.bindings.activeSiteManifestDigest,
    now: "2026-08-27T12:04:59.000Z" });
  assert.equal(current.evidenceDigest, admitted.evidenceDigest);
  assert.equal(JSON.parse(await readFile(admitted.evidenceFile, "utf8")).swapAdmitted, false);
  await assert.rejects(readCurrentStagingUpgradeCapacityAdmission({ rootDirectory: value.root,
    operationId: admitted.operationId, runtimeContractDigest: admitted.bindings.runtimeContractDigest,
    activeSiteManifestDigest: admitted.bindings.activeSiteManifestDigest,
    now: "2026-08-27T12:05:00.001Z" }), /STAGING_UPGRADE_CAPACITY_EVIDENCE_NOT_ADMISSIBLE/);
});

test("failed capacity is retained but cannot authorize candidate creation", async (context) => {
  const value = await fixture(context);
  const denied = await admitStagingUpgradeCapacity({ rootDirectory: value.root,
    runtimeContractFile: value.runtimeFile, activeSiteManifestFile: value.siteFile }, { now: () => now,
    capture: async () => ({ schemaVersion: 1, capturedAt: now, logicalCpuCount: 4,
      totalMemoryBytes: 8_000_000_000, availableMemoryBytes: 6_300_000_000, pidMaximum: 4096 }) });
  assert.equal(denied.status, "NOT_READY");
  await assert.rejects(readCurrentStagingUpgradeCapacityAdmission({ rootDirectory: value.root,
    operationId: denied.operationId, runtimeContractDigest: denied.bindings.runtimeContractDigest,
    activeSiteManifestDigest: denied.bindings.activeSiteManifestDigest,
    now }), /STAGING_UPGRADE_CAPACITY_EVIDENCE_NOT_ADMISSIBLE/);
});

test("capacity evidence rejects stale capture and unsafe inputs", async (context) => {
  const value = await fixture(context);
  await assert.rejects(admitStagingUpgradeCapacity({ rootDirectory: value.root,
    runtimeContractFile: value.runtimeFile, activeSiteManifestFile: value.siteFile }, { now: () => now,
    capture: async () => ({ schemaVersion: 1, capturedAt: "2026-08-27T11:54:59.000Z",
      logicalCpuCount: 8, totalMemoryBytes: 12_000_000_000,
      availableMemoryBytes: 8_000_000_000, pidMaximum: 4096 }) }),
  /STAGING_UPGRADE_CAPACITY_SNAPSHOT_STALE/);
  await chmod(value.runtimeFile, 0o644);
  await assert.rejects(admitStagingUpgradeCapacity({ rootDirectory: value.root,
    runtimeContractFile: value.runtimeFile, activeSiteManifestFile: value.siteFile }),
  /STAGING_UPGRADE_CAPACITY_RUNTIME_FILE_UNSAFE/);
});
