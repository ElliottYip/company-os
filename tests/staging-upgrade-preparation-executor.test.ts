import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runStagingUpgradePreparation } from
  "../scripts/run-staging-upgrade-preparation.ts";

const digest = (value: string) => `sha256:${value.repeat(64)}`;
const steps = ["capacity-admission", "freeze-dispatch", "reconcile-attempts", "encrypted-backup",
  "parallel-restore-rehearsal", "forward-migrate", "start-candidate-secret-broker",
  "start-candidate-data-node", "start-candidate-agent-node", "start-candidate-api",
  "candidate-readiness", "customer-smoke", "state-comparison", "start-candidate-web"];

function plan(rootDirectory: string) {
  return { schemaVersion: 1 as const, product: "company-os" as const,
    status: "PLANNED_NOT_APPLIED" as const, phase: "UPGRADE_PREPARATION" as const,
    operationId: "upgrade-rc4-to-rc5", siteId: "company-os-hong-kong",
    accountableOperatorReference: "human:release-owner", expiresAt: "2026-08-28T00:00:00.000Z",
    active: { releaseId: `0.1.0-rc.4-${"a".repeat(12)}`, sourceRevision: "a".repeat(40),
      releaseManifestDigest: digest("1"), startupStateDigest: digest("2") },
    candidate: { releaseId: `0.1.0-rc.5-${"b".repeat(12)}`, sourceRevision: "b".repeat(40),
      releaseManifestDigest: digest("3"), siteContractDigest: digest("4"),
      runtimeContractDigest: digest("5") },
    cutover: { planId: "cutover-0123456789abcdef01234567", planDigest: digest("6") },
    authorizationReference: "change:upgrade-preparation-01",
    steps, trafficMoved: false, automaticRollbackAttempted: false,
    nextPhase: { id: "TRAFFIC_CUTOVER", authorizationReference: "change:traffic-cutover-01",
      prerequisiteStatus: "UPGRADE_PREPARATION_COMPLETE_NOT_ROUTED" },
    rollback: { authorizationReference: "change:upgrade-rollback-01", automatic: false,
      strategy: "RESTORE_PAIRED_BACKUP_TO_EMPTY_PARALLEL_DATABASE" }, rootDirectory };
}

test("upgrade preparation retains evidence for every step without moving traffic", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "company-os-upgrade-preparation-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const called: string[] = [];
  const result = await runStagingUpgradePreparation(plan(root), {
    now: () => "2026-08-27T12:00:00.000Z",
    executeStep: async (step) => { called.push(step); return { status: "PASS", evidenceDigest: digest("a") }; },
  });
  assert.equal(result.status, "UPGRADE_PREPARATION_COMPLETE_NOT_ROUTED");
  assert.deepEqual(called, steps);
  assert.equal(result.trafficMoved, false);
  const state = JSON.parse(await readFile(join(root, "upgrade-preparation-state.json"), "utf8"));
  assert.equal(state.completedEvidence.length, steps.length);
  assert.equal(state.automaticRollbackAttempted, false);
  assert.equal(state.nextPhase.authorizationReference, "change:traffic-cutover-01");
});

test("upgrade preparation retains partial mutation and never rolls back or continues", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "company-os-upgrade-preparation-failure-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const called: string[] = [];
  await assert.rejects(runStagingUpgradePreparation(plan(root), {
    now: () => "2026-08-27T12:00:00.000Z",
    executeStep: async (step) => {
      called.push(step);
      if (step === "start-candidate-api") return { status: "FAIL", evidenceDigest: digest("f") };
      return { status: "PASS", evidenceDigest: digest("a") };
    },
  }), /STAGING_UPGRADE_PREPARATION_STEP_FAILED:start-candidate-api/);
  assert.equal(called.at(-1), "start-candidate-api");
  assert.equal(called.includes("candidate-readiness"), false);
  const state = JSON.parse(await readFile(join(root, "upgrade-preparation-state.json"), "utf8"));
  assert.equal(state.status, "UPGRADE_PREPARATION_FAILED_REQUIRES_REVIEW");
  assert.equal(state.failedStep, "start-candidate-api");
  assert.equal(state.runtimeMutationMayHaveRun, true);
  assert.equal(state.trafficMoved, false);
  assert.equal(state.automaticRollbackAttempted, false);
});

test("upgrade preparation rejects traffic steps and malformed evidence before execution", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "company-os-upgrade-preparation-invalid-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(runStagingUpgradePreparation({ ...plan(root), steps: [...steps, "route-traffic"] }, {
    executeStep: async () => ({ status: "PASS", evidenceDigest: digest("a") }),
  }), /STAGING_UPGRADE_PREPARATION_PLAN_INVALID/);
  await assert.rejects(runStagingUpgradePreparation({ ...plan(root),
    steps: [steps[1], steps[0], ...steps.slice(2)] }, {
    executeStep: async () => ({ status: "PASS", evidenceDigest: digest("a") }),
  }), /STAGING_UPGRADE_PREPARATION_PLAN_INVALID/);
  await assert.rejects(runStagingUpgradePreparation(plan(root), {
    executeStep: async () => ({ status: "PASS", evidenceDigest: "not-a-digest" }),
  }), /STAGING_UPGRADE_PREPARATION_EVIDENCE_INVALID/);
});
