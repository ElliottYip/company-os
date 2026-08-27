import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createStagingUpgradeRollbackPlan, runStagingUpgradeRollback } from
  "../scripts/run-staging-upgrade-rollback.ts";

const digest = (value: string) => `sha256:${value.repeat(64)}`;
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const operationId = "upgrade-rc4-to-rc5"; const siteId = "company-os-hong-kong";
const activeId = `0.1.0-rc.4-${"a".repeat(12)}`; const candidateId = `0.1.0-rc.5-${"b".repeat(12)}`;
const rollbackSteps = ["close-current-ingress", "retain-failed-database-for-incident-evidence",
  "restore-paired-backup-to-empty-parallel-database", "validate-previous-release-state-digest",
  "start-previous-digest-images-against-restored-target", "run-previous-release-smoke",
  "move-ingress-by-explicit-operator-decision"];

function values() {
  const traffic = { schemaVersion: 1, product: "company-os", phase: "TRAFFIC_CUTOVER",
    status: "TRAFFIC_CUTOVER_FAILED_REQUIRES_EXPLICIT_DECISION", operationId, siteId,
    authorizationReference: "change:traffic", trafficMoved: true, automaticRollbackAttempted: false,
    active: { releaseId: activeId }, candidate: { releaseId: candidateId },
    cutover: { planId: "cutover-0123456789abcdef01234567" },
    rollback: { authorizationReference: "change:rollback" } };
  const authorization = { schemaVersion: 1, product: "company-os", environment: "STAGING",
    operation: { id: operationId, siteId, accountableOperatorReference: "human:release-owner",
      expiresAt: "2026-08-28T00:00:00.000Z" },
    active: { releaseId: activeId, sourceRevision: "a".repeat(40),
      releaseManifestDigest: digest("1"), startupStateDigest: digest("2") },
    candidate: { releaseId: candidateId, sourceRevision: "b".repeat(40),
      releaseManifestDigest: digest("3"), siteContractDigest: digest("4"), runtimeContractDigest: digest("5") },
    cutover: { planId: traffic.cutover.planId, planDigest: digest("6") },
    authorization: { preparation: "change:prepare", trafficCutover: "change:traffic",
      rollback: "change:rollback" } };
  return { traffic, authorization };
}
async function failedTraffic(context: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), "company-os-upgrade-rollback-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const { traffic, authorization } = values(); const raw = stable(traffic);
  await writeFile(join(root, "upgrade-traffic-state.json"), raw, { mode: 0o600 });
  const plan = { ...createStagingUpgradeRollbackPlan(authorization, raw,
    { now: "2026-08-27T12:00:00.000Z", authorizationReference: "change:rollback" }),
  rootDirectory: root };
  return { root, plan };
}

test("explicit rollback restores the previous immutable release without reopening dispatch", async (context) => {
  const { root, plan } = await failedTraffic(context); const called: string[] = [];
  const result = await runStagingUpgradeRollback(plan, { now: () => "2026-08-27T12:03:00.000Z",
    executeStep: async (step) => { called.push(step); return { status: "PASS", evidenceDigest: digest("a") }; } });
  assert.deepEqual(called, rollbackSteps);
  assert.equal(result.status, "ROLLBACK_COMPLETE_PREVIOUS_RELEASE_PENDING_ACCEPTANCE");
  assert.equal(result.previousIngressRestored, true);
  assert.equal(result.dispatchReopened, false);
  assert.equal(result.acceptanceClaimed, false);
  assert.equal(result.automaticRollbackAttempted, false);
  assert.equal(JSON.parse(await readFile(join(root, "upgrade-rollback-state.json"), "utf8")).completedEvidence.length, 7);
});

test("rollback failure retains review state and never tries a forbidden shortcut", async (context) => {
  const { root, plan } = await failedTraffic(context);
  await assert.rejects(runStagingUpgradeRollback(plan, { executeStep: async (step) => ({
    status: step === "validate-previous-release-state-digest" ? "FAIL" : "PASS",
    evidenceDigest: digest("b") }) }), /STAGING_UPGRADE_ROLLBACK_STEP_FAILED/);
  const state = JSON.parse(await readFile(join(root, "upgrade-rollback-state.json"), "utf8"));
  assert.equal(state.status, "UPGRADE_ROLLBACK_FAILED_REQUIRES_REVIEW");
  assert.equal(state.automaticRollbackAttempted, false);
  assert.equal(state.downMigrationAttempted, false);
  assert.equal(state.previousBinaryOnCandidateDatabaseAttempted, false);
  assert.equal(state.previousIngressRestored, false);
});

test("rollback rejects success traffic, wrong authority and changed failure evidence", async (context) => {
  const { traffic, authorization } = values(); const raw = stable(traffic);
  assert.throws(() => createStagingUpgradeRollbackPlan(authorization,
    stable({ ...traffic, status: "UPGRADE_OBSERVATION_COMPLETE_PENDING_ACCEPTANCE" }),
    { now: "2026-08-27T12:00:00.000Z", authorizationReference: "change:rollback" }),
  /STAGING_UPGRADE_ROLLBACK_TRAFFIC_STATE_INVALID/);
  assert.throws(() => createStagingUpgradeRollbackPlan(authorization, raw,
    { now: "2026-08-27T12:00:00.000Z", authorizationReference: "change:traffic" }),
  /STAGING_UPGRADE_ROLLBACK_AUTHORIZATION_MISMATCH/);
  const { root, plan } = await failedTraffic(context);
  await writeFile(join(root, "upgrade-traffic-state.json"), `${raw} `, { mode: 0o600 });
  await assert.rejects(runStagingUpgradeRollback(plan,
    { executeStep: async () => ({ status: "PASS", evidenceDigest: digest("a") }) }),
  /STAGING_UPGRADE_ROLLBACK_TRAFFIC_STATE_CHANGED/);
});
