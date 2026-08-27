import assert from "node:assert/strict";
import test from "node:test";

import { createStagingUpgradePreparationStepAdapter,
  type ConcreteStagingUpgradePreparationStep } from
  "../scripts/create-staging-upgrade-preparation-adapter.ts";
import { runStagingUpgradePreparation } from "../scripts/run-staging-upgrade-preparation.ts";

const digest = (value: string) => `sha256:${value.repeat(64)}`;
const operationId = "upgrade-rc4-to-rc5";
const siteId = "company-os-hong-kong";
const candidateReleaseId = `0.1.0-rc.5-${"b".repeat(12)}`;
const ordered = ["capacity-admission", "freeze-dispatch", "reconcile-attempts", "encrypted-backup",
  "parallel-restore-rehearsal", "forward-migrate", "start-candidate-secret-broker",
  "start-candidate-data-node", "start-candidate-agent-node", "start-candidate-api", "candidate-readiness",
  "customer-smoke", "state-comparison", "start-candidate-web"] as const;
const outcomes: Record<ConcreteStagingUpgradePreparationStep, string> = {
  "freeze-dispatch": "NEW_DISPATCH_DISABLED",
  "reconcile-attempts": "EVERY_IN_FLIGHT_ATTEMPT_DRAINED_CANCELLED_OR_DURABLY_RECOVERABLE",
  "encrypted-backup": "PAIRED_BACKUP_AND_MANIFEST_RETAINED",
  "parallel-restore-rehearsal": "PREVIOUS_RELEASE_STATE_RESTORED_TO_EMPTY_PARALLEL_TARGET",
  "forward-migrate": "CURRENT_MIGRATIONS_APPLIED_ONCE",
  "start-candidate-api": "CURRENT_DIGEST_STARTED_WITH_INGRESS_CLOSED",
  "candidate-readiness": "DEPENDENCY_AWARE_READY",
  "start-candidate-secret-broker": "CURRENT_VAULT_SECRET_BROKER_DIGEST_READY",
  "start-candidate-agent-node": "CURRENT_CODEX_AGENT_NODE_DIGEST_READY",
  "start-candidate-data-node": "CURRENT_REFERENCE_DATA_NODE_DIGEST_READY_AND_FIXTURE_ONLY",
  "customer-smoke": "IDENTITY_COMPANY_WORK_APPROVAL_EVIDENCE_PATH_PASSED",
  "state-comparison": "CONTROL_TOTALS_AND_RESPONSIBILITY_EVIDENCE_MATCHED",
  "start-candidate-web": "CURRENT_WEB_DIGEST_SERVED",
};

function adapter(overrides: Partial<Record<ConcreteStagingUpgradePreparationStep,
  () => Promise<any>>> = {}, called: string[] = []) {
  const operations = Object.fromEntries(Object.entries(outcomes).map(([step, outcome]) => [step,
    async () => { called.push(step); return { schemaVersion: 1, product: "company-os", operationId,
      siteId, candidateReleaseId, step, outcome, evidenceDigest: digest("a"),
      secretMaterialIncluded: false }; }])) as any;
  return createStagingUpgradePreparationStepAdapter({ operationId, siteId, candidateReleaseId,
    readCapacityAdmission: async () => ({ operationId, siteId,
      status: "READY_FOR_CANDIDATE_CREATION", evidenceDigest: digest("c") }),
    operations: { ...operations, ...overrides } });
}

test("concrete adapter requires capacity before invoking exact named operations", async () => {
  const called: string[] = []; const execute = adapter({}, called);
  await assert.rejects(execute("freeze-dispatch"), /CAPACITY_ADMISSION_REQUIRED/);
  assert.deepEqual(called, []);
  assert.equal((await execute("capacity-admission")).evidenceDigest, digest("c"));
  for (const step of ordered.slice(1)) await execute(step);
  assert.deepEqual(called, ordered.slice(1));
  await assert.rejects(execute("freeze-dispatch"), /STEP_REPLAY_FORBIDDEN/);
});

test("concrete adapter rejects outcome or binding drift before reporting PASS", async () => {
  const execute = adapter({ "freeze-dispatch": async () => ({ schemaVersion: 1,
    product: "company-os", operationId, siteId, candidateReleaseId, step: "freeze-dispatch",
    outcome: "SOMETHING_ELSE", evidenceDigest: digest("a"), secretMaterialIncluded: false }) });
  await execute("capacity-admission");
  await assert.rejects(execute("freeze-dispatch"), /STEP_EVIDENCE_INVALID/);
});

test("preparation state retains a capacity failure before any runtime mutation", async (context) => {
  const root = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(`${process.env.TMPDIR ?? "/tmp"}/company-os-capacity-step-`));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true, force: true })));
  const execute = createStagingUpgradePreparationStepAdapter({ operationId, siteId, candidateReleaseId,
    readCapacityAdmission: async () => { throw new Error("CAPACITY_NOT_READY"); },
    operations: Object.fromEntries(Object.keys(outcomes).map((step) => [step,
      async () => { throw new Error("MUST_NOT_RUN"); }])) as any });
  await assert.rejects(runStagingUpgradePreparation({ schemaVersion: 1, product: "company-os",
    status: "PLANNED_NOT_APPLIED", phase: "UPGRADE_PREPARATION", operationId, siteId,
    accountableOperatorReference: "human:release-owner", expiresAt: "2026-08-28T00:00:00.000Z",
    active: {}, candidate: {}, cutover: {}, authorizationReference: "change:prepare", steps: ordered,
    trafficMoved: false, automaticRollbackAttempted: false,
    nextPhase: { id: "TRAFFIC_CUTOVER", prerequisiteStatus: "UPGRADE_PREPARATION_COMPLETE_NOT_ROUTED" },
    rollback: {}, rootDirectory: root }, { executeStep: execute }), /CAPACITY_NOT_READY/);
  const state = JSON.parse(await import("node:fs/promises").then(({ readFile }) =>
    readFile(`${root}/upgrade-preparation-state.json`, "utf8")));
  assert.equal(state.failedStep, "capacity-admission");
  assert.equal(state.runtimeMutationMayHaveRun, false);
});
