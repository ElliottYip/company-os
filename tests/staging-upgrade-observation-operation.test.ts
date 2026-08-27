import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createStagingUpgradeObservationOperation } from
  "../scripts/staging-upgrade-observation-operation.ts";

const digest = (value: string) => `sha256:${value.repeat(64)}`;
const snapshot = { queuedAttempts: 0, runningAttempts: 0, waitingApprovalAttempts: 0,
  recoverableAttempts: 2, cancelledAttempts: 1, succeededAttempts: 5, failedAttempts: 1,
  approvalRecords: 3, evidenceRecords: 9 };
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "company-os-observe-")); await chmod(root, 0o700);
  const evidence = join(root, "step-evidence"); await mkdir(evidence, { mode: 0o700 });
  await writeFile(join(evidence, "state-comparison.json"), `${JSON.stringify({ schemaVersion: 1,
    product: "company-os", operationId: "upgrade-rc4-to-rc5", siteId: "company-os-hong-kong",
    candidateReleaseId: `0.1.0-rc.5-${"b".repeat(12)}`, step: "state-comparison",
    outcome: "CONTROL_TOTALS_AND_RESPONSIBILITY_EVIDENCE_MATCHED", exactSourceDigest: digest("a"),
    snapshot, customerRecordsIncluded: false, secretMaterialIncluded: false }, null, 2)}\n`, { mode: 0o600 });
  return root;
}
function input(root: string) { return { candidateDirectory: root, operationId: "upgrade-rc4-to-rc5",
  siteId: "company-os-hong-kong", candidateReleaseId: `0.1.0-rc.5-${"b".repeat(12)}`,
  stablePorts: { web: 4700, api: 4701 }, policy: { sampleCount: 3, intervalMilliseconds: 0,
    maximumP95Milliseconds: 100, maximumFailures: 0 } } as const; }

test("bounded observation proves stable release, latency and unchanged responsibility totals", async () => {
  const root = await fixture(); let clock = 0; let waits = 0;
  const operation = await createStagingUpgradeObservationOperation(input(root), {
    fetch: async () => new Response("ok", { status: 200,
      headers: { "x-company-os-release-id": input(root).candidateReleaseId } }),
    inspectCandidate: async () => ({ schemaVersion: 1 as const, status: "DRAINED" as const,
      restartAllowed: true, blockers: [], exactSourceDigest: digest("a"), snapshot }),
    monotonicNow: () => { clock += 10; return clock; }, wait: async () => { waits += 1; },
    now: () => "2026-08-27T00:00:00.000Z",
  });
  const result = await operation(); assert.match(result.evidenceDigest, /^sha256:/); assert.equal(waits, 2);
  const evidence = JSON.parse(await readFile(join(root, "step-evidence", "observe.json"), "utf8"));
  assert.equal(evidence.endpointProbeCount, 6); assert.equal(evidence.p95Milliseconds, 10);
  assert.equal(evidence.failureCount, 0); assert.deepEqual(evidence.snapshot, snapshot);
});

test("observation rejects a healthy response from the wrong release", async () => {
  const root = await fixture(); const operation = await createStagingUpgradeObservationOperation(input(root), {
    fetch: async () => new Response("ok", { status: 200,
      headers: { "x-company-os-release-id": `0.1.0-rc.4-${"a".repeat(12)}` } }),
    inspectCandidate: async () => ({ schemaVersion: 1 as const, status: "DRAINED" as const,
      restartAllowed: true, blockers: [], exactSourceDigest: digest("a"), snapshot }),
    monotonicNow: () => 1, wait: async () => {},
  });
  await assert.rejects(operation(), /STAGING_UPGRADE_OBSERVATION_THRESHOLD_FAILED/);
});

test("observation rejects responsibility state drift even when probes pass", async () => {
  const root = await fixture(); const operation = await createStagingUpgradeObservationOperation(input(root), {
    fetch: async () => new Response("ok", { status: 200,
      headers: { "x-company-os-release-id": input(root).candidateReleaseId } }),
    inspectCandidate: async () => ({ schemaVersion: 1 as const, status: "DRAINED" as const,
      restartAllowed: true, blockers: [], exactSourceDigest: digest("c"), snapshot }),
    monotonicNow: () => 1, wait: async () => {},
  });
  await assert.rejects(operation(), /STAGING_UPGRADE_OBSERVATION_THRESHOLD_FAILED/);
});
