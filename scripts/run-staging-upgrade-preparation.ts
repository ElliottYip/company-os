import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const OPERATION = /^upgrade-[a-z0-9][a-z0-9-]{2,87}$/;
const ALLOWED_STEPS = new Set(["capacity-admission", "freeze-dispatch", "reconcile-attempts", "encrypted-backup",
  "parallel-restore-rehearsal", "forward-migrate", "start-candidate-secret-broker",
  "start-candidate-data-node", "start-candidate-agent-node", "start-candidate-api",
  "candidate-readiness", "customer-smoke", "state-comparison", "start-candidate-web"]);
const ORDER_WITHOUT_MIGRATION = ["capacity-admission", "freeze-dispatch", "reconcile-attempts", "encrypted-backup",
  "parallel-restore-rehearsal", "start-candidate-secret-broker", "start-candidate-data-node",
  "start-candidate-agent-node", "start-candidate-api", "candidate-readiness",
  "customer-smoke", "state-comparison", "start-candidate-web"];
const MUTATING_STEPS = new Set(["freeze-dispatch", "encrypted-backup", "parallel-restore-rehearsal",
  "forward-migrate", "start-candidate-api", "start-candidate-secret-broker",
  "start-candidate-agent-node", "start-candidate-data-node", "start-candidate-web"]);
const LOCK = ".staging-lifecycle.lock";
const STATE = "upgrade-preparation-state.json";
const RECORDS = "upgrade-preparation-records";

interface UpgradePreparationPlan {
  readonly schemaVersion: 1;
  readonly product: "company-os";
  readonly status: "PLANNED_NOT_APPLIED";
  readonly phase: "UPGRADE_PREPARATION";
  readonly operationId: string;
  readonly siteId: string;
  readonly accountableOperatorReference: string;
  readonly expiresAt: string;
  readonly active: Readonly<Record<string, string>>;
  readonly candidate: Readonly<Record<string, string>>;
  readonly cutover: Readonly<Record<string, string>>;
  readonly authorizationReference: string;
  readonly steps: readonly string[];
  readonly trafficMoved: false;
  readonly automaticRollbackAttempted: false;
  readonly nextPhase: Readonly<Record<string, string>>;
  readonly rollback: Readonly<Record<string, unknown>>;
  readonly rootDirectory: string;
}

interface StepEvidence {
  readonly status: "PASS" | "FAIL";
  readonly evidenceDigest: string;
}

export async function runStagingUpgradePreparation(planValue: UpgradePreparationPlan, supplied: {
  readonly executeStep: (step: string) => Promise<StepEvidence>;
  readonly now?: () => string;
}) {
  const plan = await validatePlan(planValue);
  const now = supplied.now ?? (() => new Date().toISOString());
  await rejectExistingRecord(plan);
  const lockPath = join(plan.rootDirectory, LOCK);
  try { await writeFile(lockPath, `${plan.operationId}:UPGRADE_PREPARATION\n`, { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (isCode(error, "EEXIST")) throw new Error("STAGING_UPGRADE_PREPARATION_ALREADY_RUNNING");
    throw error;
  }
  const startedAt = now(); const completedEvidence: Array<{ step: string; evidenceDigest: string }> = [];
  let attemptedStep = "INITIALIZE";
  try {
    await writeState(plan, { status: "UPGRADE_PREPARATION_RUNNING", startedAt,
      currentStep: plan.steps[0], completedEvidence, runtimeMutationMayHaveRun: false });
    for (const step of plan.steps) {
      attemptedStep = step;
      await writeState(plan, { status: "UPGRADE_PREPARATION_RUNNING", startedAt,
        currentStep: step, completedEvidence,
        runtimeMutationMayHaveRun: completedEvidence.some(({ step: completed }) => MUTATING_STEPS.has(completed)) });
      const evidence = await supplied.executeStep(step);
      if (!evidence || !DIGEST.test(evidence.evidenceDigest) ||
          (evidence.status !== "PASS" && evidence.status !== "FAIL")) {
        throw new UpgradeEvidenceError(step);
      }
      if (evidence.status !== "PASS") throw new UpgradeStepError(step);
      completedEvidence.push({ step, evidenceDigest: evidence.evidenceDigest });
    }
    const result = baseState(plan, { status: "UPGRADE_PREPARATION_COMPLETE_NOT_ROUTED", startedAt,
      completedAt: now(), currentStep: null, completedEvidence, runtimeMutationMayHaveRun: true });
    await writeStateValue(plan, result); await retainRecord(plan, result);
    return result;
  } catch (error) {
    const failedStep = error instanceof UpgradeStepError || error instanceof UpgradeEvidenceError
      ? error.step : attemptedStep;
    const result = baseState(plan, { status: "UPGRADE_PREPARATION_FAILED_REQUIRES_REVIEW", startedAt,
      failedAt: now(), currentStep: null, completedEvidence, failedStep,
      failureCode: error instanceof UpgradeEvidenceError ? "EVIDENCE_INVALID" :
        error instanceof UpgradeStepError ? "STEP_FAILED" : "INTERNAL_FAILURE",
      runtimeMutationMayHaveRun: completedEvidence.some(({ step }) => MUTATING_STEPS.has(step)) ||
        MUTATING_STEPS.has(failedStep) });
    await writeStateValue(plan, result); await retainRecord(plan, result);
    if (error instanceof UpgradeEvidenceError) {
      throw new Error("STAGING_UPGRADE_PREPARATION_EVIDENCE_INVALID");
    }
    if (error instanceof UpgradeStepError) {
      throw new Error(`STAGING_UPGRADE_PREPARATION_STEP_FAILED:${error.step}`);
    }
    throw error;
  } finally { await rm(lockPath, { force: true }); }
}

async function validatePlan(value: UpgradePreparationPlan): Promise<UpgradePreparationPlan> {
  if (!value || value.schemaVersion !== 1 || value.product !== "company-os" ||
      value.status !== "PLANNED_NOT_APPLIED" || value.phase !== "UPGRADE_PREPARATION" ||
      !OPERATION.test(value.operationId ?? "") || value.trafficMoved !== false ||
      value.automaticRollbackAttempted !== false || !Array.isArray(value.steps) ||
      !validStepOrder(value.steps) ||
      value.nextPhase?.id !== "TRAFFIC_CUTOVER" ||
      value.nextPhase?.prerequisiteStatus !== "UPGRADE_PREPARATION_COMPLETE_NOT_ROUTED") {
    throw new Error("STAGING_UPGRADE_PREPARATION_PLAN_INVALID");
  }
  if (!isAbsolute(value.rootDirectory)) throw new Error("STAGING_UPGRADE_PREPARATION_ROOT_INVALID");
  const root = resolve(value.rootDirectory);
  if (root === "/" || root === resolve(homedir())) throw new Error("STAGING_UPGRADE_PREPARATION_ROOT_INVALID");
  const metadata = await lstat(root);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o027) !== 0) {
    throw new Error("STAGING_UPGRADE_PREPARATION_ROOT_UNSAFE");
  }
  return { ...value, rootDirectory: root };
}

function validStepOrder(steps: readonly string[]): boolean {
  if (steps.some((step) => !ALLOWED_STEPS.has(step))) return false;
  const expected = steps.includes("forward-migrate")
    ? [...ORDER_WITHOUT_MIGRATION.slice(0, 5), "forward-migrate", ...ORDER_WITHOUT_MIGRATION.slice(5)]
    : ORDER_WITHOUT_MIGRATION;
  return JSON.stringify(steps) === JSON.stringify(expected);
}

function baseState(plan: UpgradePreparationPlan, details: Record<string, unknown>) {
  return { schemaVersion: 1, product: "company-os", phase: plan.phase,
    operationId: plan.operationId, siteId: plan.siteId,
    accountableOperatorReference: plan.accountableOperatorReference,
    active: plan.active, candidate: plan.candidate, cutover: plan.cutover,
    authorizationReference: plan.authorizationReference,
    trafficMoved: false, automaticRollbackAttempted: false,
    nextPhase: plan.nextPhase, rollback: plan.rollback, ...details };
}

async function writeState(plan: UpgradePreparationPlan, details: Record<string, unknown>) {
  return writeStateValue(plan, baseState(plan, details));
}
async function writeStateValue(plan: UpgradePreparationPlan, value: Record<string, unknown>) {
  await writeAtomic(join(plan.rootDirectory, STATE), value); return value;
}
async function retainRecord(plan: UpgradePreparationPlan, value: Record<string, unknown>) {
  const directory = join(plan.rootDirectory, RECORDS);
  try { await mkdir(directory, { mode: 0o700 }); }
  catch (error) { if (!isCode(error, "EEXIST")) throw error; }
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) {
    throw new Error("STAGING_UPGRADE_PREPARATION_RECORDS_UNSAFE");
  }
  await writeFile(join(directory, `${plan.operationId}.json`), `${JSON.stringify(value, null, 2)}\n`,
    { flag: "wx", mode: 0o600 });
}
async function rejectExistingRecord(plan: UpgradePreparationPlan) {
  try { await readFile(join(plan.rootDirectory, RECORDS, `${plan.operationId}.json`));
    throw new Error("STAGING_UPGRADE_PREPARATION_OPERATION_ALREADY_RECORDED"); }
  catch (error) { if (!isCode(error, "ENOENT")) throw error; }
}
async function writeAtomic(path: string, value: Record<string, unknown>) {
  const partial = `${path}.partial-${process.pid}-${Date.now()}`;
  try { await writeFile(partial, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(partial, path); }
  finally { await rm(partial, { force: true }); }
}
function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
class UpgradeStepError extends Error {
  readonly step: string;
  constructor(step: string) { super(step); this.step = step; }
}
class UpgradeEvidenceError extends Error {
  readonly step: string;
  constructor(step: string) { super(step); this.step = step; }
}
