import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createStagingUpgradeTrafficPlan, runStagingUpgradeTraffic } from
  "../scripts/run-staging-upgrade-traffic.ts";

const digest = (value: string) => `sha256:${value.repeat(64)}`;
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const operationId = "upgrade-rc4-to-rc5";
const siteId = "company-os-hong-kong";
const activeId = `0.1.0-rc.4-${"a".repeat(12)}`;
const candidateId = `0.1.0-rc.5-${"b".repeat(12)}`;

function values() {
  const preparation = { schemaVersion: 1, product: "company-os", phase: "UPGRADE_PREPARATION",
    status: "UPGRADE_PREPARATION_COMPLETE_NOT_ROUTED", operationId, siteId,
    authorizationReference: "change:prepare", trafficMoved: false, automaticRollbackAttempted: false,
    active: { releaseId: activeId }, candidate: { releaseId: candidateId },
    cutover: { planId: "cutover-0123456789abcdef01234567" },
    nextPhase: { authorizationReference: "change:traffic" },
    rollback: { strategy: "RESTORE_PAIRED_BACKUP_TO_EMPTY_PARALLEL_DATABASE" } };
  const authorization = { schemaVersion: 1, product: "company-os", environment: "STAGING",
    operation: { id: operationId, siteId, accountableOperatorReference: "human:release-owner",
      expiresAt: "2026-08-28T00:00:00.000Z" },
    active: { releaseId: activeId, sourceRevision: "a".repeat(40),
      releaseManifestDigest: digest("1"), startupStateDigest: digest("2") },
    candidate: { releaseId: candidateId, sourceRevision: "b".repeat(40),
      releaseManifestDigest: digest("3"), siteContractDigest: digest("4"), runtimeContractDigest: digest("5") },
    cutover: { planId: preparation.cutover.planId, planDigest: digest("6") },
    authorization: { preparation: "change:prepare", trafficCutover: "change:traffic",
      rollback: "change:rollback" } };
  return { preparation, authorization };
}

async function prepared(context: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), "company-os-upgrade-traffic-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const { preparation, authorization } = values(); const raw = stable(preparation);
  await writeFile(join(root, "upgrade-preparation-state.json"), raw, { mode: 0o600 });
  const plan = { ...createStagingUpgradeTrafficPlan(authorization, raw,
    { now: "2026-08-27T12:00:00.000Z", authorizationReference: "change:traffic" }),
  rootDirectory: root };
  return { root, plan };
}

test("traffic phase moves ingress only after exact preparation and observes it", async (context) => {
  const { root, plan } = await prepared(context); const called: string[] = [];
  const result = await runStagingUpgradeTraffic(plan, { now: () => "2026-08-27T12:01:00.000Z",
    executeStep: async (step) => { called.push(step); return { status: "PASS", evidenceDigest: digest("a") }; } });
  assert.deepEqual(called, ["route-traffic", "observe", "promote-active"]);
  assert.equal(result.status, "UPGRADE_OBSERVATION_COMPLETE_PENDING_ACCEPTANCE");
  assert.equal(result.trafficMoved, true);
  assert.equal(result.automaticRollbackAttempted, false);
  assert.equal(JSON.parse(await readFile(join(root, "upgrade-traffic-state.json"), "utf8")).completedEvidence.length, 3);
});

test("failed observation retains routed state and requires an explicit decision", async (context) => {
  const { root, plan } = await prepared(context);
  await assert.rejects(runStagingUpgradeTraffic(plan, { executeStep: async (step) => ({
    status: step === "observe" ? "FAIL" : "PASS", evidenceDigest: digest("b") }) }),
  /STAGING_UPGRADE_TRAFFIC_STEP_FAILED:observe/);
  const state = JSON.parse(await readFile(join(root, "upgrade-traffic-state.json"), "utf8"));
  assert.equal(state.status, "TRAFFIC_CUTOVER_FAILED_REQUIRES_EXPLICIT_DECISION");
  assert.equal(state.trafficMoved, true);
  assert.equal(state.automaticRollbackAttempted, false);
  assert.equal(state.rollback.authorizationReference, "change:rollback");
});

test("failed active promotion retains routed state and requires explicit recovery", async (context) => {
  const { root, plan } = await prepared(context);
  await assert.rejects(runStagingUpgradeTraffic(plan, { executeStep: async (step) => ({
    status: step === "promote-active" ? "FAIL" : "PASS", evidenceDigest: digest("c") }) }),
  /STAGING_UPGRADE_TRAFFIC_STEP_FAILED:promote-active/);
  const state = JSON.parse(await readFile(join(root, "upgrade-traffic-state.json"), "utf8"));
  assert.equal(state.status, "TRAFFIC_CUTOVER_FAILED_REQUIRES_EXPLICIT_DECISION");
  assert.equal(state.failedStep, "promote-active"); assert.equal(state.trafficMoved, true);
  assert.equal(state.completedEvidence.length, 2);
});

test("traffic planning rejects wrong authority and preparation drift", async (context) => {
  const { preparation, authorization } = values(); const raw = stable(preparation);
  assert.throws(() => createStagingUpgradeTrafficPlan(authorization, raw,
    { now: "2026-08-27T12:00:00.000Z", authorizationReference: "change:rollback" }),
  /STAGING_UPGRADE_TRAFFIC_AUTHORIZATION_MISMATCH/);
  const { plan, root } = await prepared(context);
  await writeFile(join(root, "upgrade-preparation-state.json"), `${raw} `, { mode: 0o600 });
  await assert.rejects(runStagingUpgradeTraffic(plan,
    { executeStep: async () => ({ status: "PASS", evidenceDigest: digest("a") }) }),
  /STAGING_UPGRADE_TRAFFIC_PREPARATION_CHANGED/);
});
