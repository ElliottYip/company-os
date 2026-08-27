import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { parseStagingUpgradeAuthorization } from
  "../adapters/config/staging-upgrade-authorization.ts";

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const LOCK = ".staging-lifecycle.lock";
const STATE = "upgrade-rollback-state.json";
const RECORDS = "upgrade-rollback-records";
const STEPS = ["close-current-ingress", "retain-failed-database-for-incident-evidence",
  "restore-paired-backup-to-empty-parallel-database", "validate-previous-release-state-digest",
  "start-previous-digest-images-against-restored-target", "run-previous-release-smoke",
  "move-ingress-by-explicit-operator-decision"] as const;
type RollbackStep = (typeof STEPS)[number];

export function createStagingUpgradeRollbackPlan(authorizationValue: unknown,
  trafficStateRaw: string, options: { readonly now: string; readonly authorizationReference: string }) {
  const authorization = parseStagingUpgradeAuthorization(authorizationValue);
  if (!instant(options.now) || Date.parse(options.now) >= Date.parse(authorization.operation.expiresAt)) {
    throw new Error("STAGING_UPGRADE_ROLLBACK_AUTHORIZATION_EXPIRED");
  }
  if (options.authorizationReference !== authorization.authorization.rollback) {
    throw new Error("STAGING_UPGRADE_ROLLBACK_AUTHORIZATION_MISMATCH");
  }
  const traffic = json(trafficStateRaw, "STAGING_UPGRADE_ROLLBACK_TRAFFIC_STATE_INVALID");
  if (traffic?.schemaVersion !== 1 || traffic.product !== "company-os" ||
      traffic.phase !== "TRAFFIC_CUTOVER" ||
      traffic.status !== "TRAFFIC_CUTOVER_FAILED_REQUIRES_EXPLICIT_DECISION" ||
      traffic.operationId !== authorization.operation.id || traffic.siteId !== authorization.operation.siteId ||
      traffic.trafficMoved !== true || traffic.automaticRollbackAttempted !== false ||
      traffic.authorizationReference !== authorization.authorization.trafficCutover ||
      traffic.rollback?.authorizationReference !== authorization.authorization.rollback ||
      traffic.active?.releaseId !== authorization.active.releaseId ||
      traffic.candidate?.releaseId !== authorization.candidate.releaseId ||
      traffic.cutover?.planId !== authorization.cutover.planId) {
    throw new Error("STAGING_UPGRADE_ROLLBACK_TRAFFIC_STATE_INVALID");
  }
  return { schemaVersion: 1, product: "company-os", status: "PLANNED_NOT_APPLIED",
    phase: "UPGRADE_ROLLBACK", operationId: authorization.operation.id,
    siteId: authorization.operation.siteId,
    accountableOperatorReference: authorization.operation.accountableOperatorReference,
    expiresAt: authorization.operation.expiresAt,
    active: traffic.active, failedCandidate: traffic.candidate, cutover: traffic.cutover,
    trafficStateDigest: sha256(trafficStateRaw),
    authorizationReference: authorization.authorization.rollback,
    strategy: "RESTORE_PAIRED_BACKUP_TO_EMPTY_PARALLEL_DATABASE" as const,
    steps: STEPS, destructiveTargetReuseAllowed: false, downMigrationAllowed: false,
    previousBinaryOnCandidateDatabaseAllowed: false, automatic: false } as const;
}

export async function runStagingUpgradeRollback(planValue: ReturnType<typeof createStagingUpgradeRollbackPlan> &
  { readonly rootDirectory: string }, supplied: {
    readonly executeStep: (step: RollbackStep) => Promise<{
      readonly status: "PASS" | "FAIL"; readonly evidenceDigest: string }>;
    readonly now?: () => string;
  }) {
  const plan = await validatePlan(planValue); const now = supplied.now ?? (() => new Date().toISOString());
  await verifyTrafficState(plan); await rejectExistingRecord(plan);
  const lockPath = join(plan.rootDirectory, LOCK);
  try { await writeFile(lockPath, `${plan.operationId}:UPGRADE_ROLLBACK\n`, { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (isCode(error, "EEXIST")) throw new Error("STAGING_UPGRADE_ROLLBACK_ALREADY_RUNNING");
    throw error;
  }
  const startedAt = now(); const completedEvidence: Array<{ step: string; evidenceDigest: string }> = [];
  let attemptedStep: RollbackStep = STEPS[0];
  try {
    for (const step of STEPS) {
      attemptedStep = step;
      await writeState(plan, { status: "UPGRADE_ROLLBACK_RUNNING", startedAt, currentStep: step,
        completedEvidence, previousIngressRestored: false });
      const evidence = await supplied.executeStep(step);
      if (!evidence || !DIGEST.test(evidence.evidenceDigest) ||
          (evidence.status !== "PASS" && evidence.status !== "FAIL")) throw new RollbackEvidenceError(step);
      if (evidence.status === "FAIL") throw new RollbackStepError(step);
      completedEvidence.push({ step, evidenceDigest: evidence.evidenceDigest });
    }
    const result = state(plan, { status: "ROLLBACK_COMPLETE_PREVIOUS_RELEASE_PENDING_ACCEPTANCE",
      startedAt, completedAt: now(), currentStep: null, completedEvidence,
      previousIngressRestored: true, dispatchReopened: false, acceptanceClaimed: false });
    await writeStateValue(plan, result); await retainRecord(plan, result); return result;
  } catch (error) {
    const failedStep = error instanceof RollbackEvidenceError || error instanceof RollbackStepError
      ? error.step : attemptedStep;
    const result = state(plan, { status: "UPGRADE_ROLLBACK_FAILED_REQUIRES_REVIEW",
      startedAt, failedAt: now(), currentStep: null, completedEvidence, failedStep,
      failureCode: error instanceof RollbackEvidenceError ? "EVIDENCE_INVALID" :
        error instanceof RollbackStepError ? "STEP_FAILED" : "INTERNAL_FAILURE",
      previousIngressRestored: false, dispatchReopened: false, acceptanceClaimed: false });
    await writeStateValue(plan, result); await retainRecord(plan, result);
    if (error instanceof RollbackEvidenceError) throw new Error("STAGING_UPGRADE_ROLLBACK_EVIDENCE_INVALID");
    if (error instanceof RollbackStepError) throw new Error(`STAGING_UPGRADE_ROLLBACK_STEP_FAILED:${error.step}`);
    throw error;
  } finally { await rm(lockPath, { force: true }); }
}

async function validatePlan<T extends { readonly rootDirectory: string }>(value: T) {
  if (!value || value.schemaVersion !== 1 || value.product !== "company-os" ||
      value.status !== "PLANNED_NOT_APPLIED" || value.phase !== "UPGRADE_ROLLBACK" ||
      JSON.stringify(value.steps) !== JSON.stringify(STEPS) || value.automatic !== false ||
      value.destructiveTargetReuseAllowed !== false || value.downMigrationAllowed !== false ||
      value.previousBinaryOnCandidateDatabaseAllowed !== false || !DIGEST.test(value.trafficStateDigest)) {
    throw new Error("STAGING_UPGRADE_ROLLBACK_PLAN_INVALID");
  }
  if (!isAbsolute(value.rootDirectory)) throw new Error("STAGING_UPGRADE_ROLLBACK_ROOT_INVALID");
  const root = resolve(value.rootDirectory);
  if (root === "/" || root === resolve(homedir())) throw new Error("STAGING_UPGRADE_ROLLBACK_ROOT_INVALID");
  const metadata = await lstat(root);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o027) !== 0) {
    throw new Error("STAGING_UPGRADE_ROLLBACK_ROOT_UNSAFE");
  }
  return { ...value, rootDirectory: root };
}
async function verifyTrafficState(plan: any) {
  const raw = await privateFile(join(plan.rootDirectory, "upgrade-traffic-state.json"));
  if (sha256(raw) !== plan.trafficStateDigest) throw new Error("STAGING_UPGRADE_ROLLBACK_TRAFFIC_STATE_CHANGED");
  const value = json(raw, "STAGING_UPGRADE_ROLLBACK_TRAFFIC_STATE_INVALID");
  if (value.status !== "TRAFFIC_CUTOVER_FAILED_REQUIRES_EXPLICIT_DECISION" ||
      value.operationId !== plan.operationId || value.siteId !== plan.siteId || value.trafficMoved !== true) {
    throw new Error("STAGING_UPGRADE_ROLLBACK_TRAFFIC_STATE_INVALID");
  }
}
function state(plan: any, details: Record<string, unknown>) {
  return { schemaVersion: 1, product: "company-os", phase: "UPGRADE_ROLLBACK",
    operationId: plan.operationId, siteId: plan.siteId,
    accountableOperatorReference: plan.accountableOperatorReference,
    active: plan.active, failedCandidate: plan.failedCandidate, cutover: plan.cutover,
    trafficStateDigest: plan.trafficStateDigest, authorizationReference: plan.authorizationReference,
    strategy: plan.strategy, automaticRollbackAttempted: false, downMigrationAttempted: false,
    previousBinaryOnCandidateDatabaseAttempted: false, ...details };
}
async function writeState(plan: any, details: Record<string, unknown>) {
  return writeStateValue(plan, state(plan, details));
}
async function writeStateValue(plan: any, value: Record<string, unknown>) {
  const path = join(plan.rootDirectory, STATE); const partial = `${path}.partial-${process.pid}-${Date.now()}`;
  try { await writeFile(partial, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(partial, path); }
  finally { await rm(partial, { force: true }); }
}
async function retainRecord(plan: any, value: Record<string, unknown>) {
  const directory = join(plan.rootDirectory, RECORDS);
  try { await mkdir(directory, { mode: 0o700 }); }
  catch (error) { if (!isCode(error, "EEXIST")) throw error; }
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) {
    throw new Error("STAGING_UPGRADE_ROLLBACK_RECORDS_UNSAFE");
  }
  await writeFile(join(directory, `${plan.operationId}.json`), `${JSON.stringify(value, null, 2)}\n`,
    { flag: "wx", mode: 0o600 });
}
async function rejectExistingRecord(plan: any) {
  try { await readFile(join(plan.rootDirectory, RECORDS, `${plan.operationId}.json`));
    throw new Error("STAGING_UPGRADE_ROLLBACK_OPERATION_ALREADY_RECORDED"); }
  catch (error) { if (!isCode(error, "ENOENT")) throw error; }
}
async function privateFile(path: string) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o077) !== 0 || metadata.size < 2 || metadata.size > 1_048_576) {
    throw new Error("STAGING_UPGRADE_ROLLBACK_FILE_UNSAFE");
  }
  return readFile(path, "utf8");
}
function json(value: string, code: string): any { try { return JSON.parse(value); } catch { throw new Error(code); } }
function instant(value: string) { try { return new Date(value).toISOString() === value; } catch { return false; } }
function sha256(value: string) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
class RollbackStepError extends Error {
  readonly step: RollbackStep; constructor(step: RollbackStep) { super(step); this.step = step; }
}
class RollbackEvidenceError extends Error {
  readonly step: RollbackStep; constructor(step: RollbackStep) { super(step); this.step = step; }
}
