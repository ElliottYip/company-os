import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { parseStagingUpgradeAuthorization } from
  "../adapters/config/staging-upgrade-authorization.ts";

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const LOCK = ".staging-lifecycle.lock";
const STATE = "upgrade-traffic-state.json";
const RECORDS = "upgrade-traffic-records";

export function createStagingUpgradeTrafficPlan(authorizationValue: unknown,
  preparationStateRaw: string, options: { readonly now: string; readonly authorizationReference: string }) {
  const authorization = parseStagingUpgradeAuthorization(authorizationValue);
  if (!instant(options.now) || Date.parse(options.now) >= Date.parse(authorization.operation.expiresAt)) {
    throw new Error("STAGING_UPGRADE_TRAFFIC_AUTHORIZATION_EXPIRED");
  }
  if (options.authorizationReference !== authorization.authorization.trafficCutover) {
    throw new Error("STAGING_UPGRADE_TRAFFIC_AUTHORIZATION_MISMATCH");
  }
  const preparation = json(preparationStateRaw, "STAGING_UPGRADE_TRAFFIC_PREPARATION_INVALID");
  if (preparation?.schemaVersion !== 1 || preparation.product !== "company-os" ||
      preparation.phase !== "UPGRADE_PREPARATION" ||
      preparation.status !== "UPGRADE_PREPARATION_COMPLETE_NOT_ROUTED" ||
      preparation.operationId !== authorization.operation.id ||
      preparation.siteId !== authorization.operation.siteId || preparation.trafficMoved !== false ||
      preparation.automaticRollbackAttempted !== false ||
      preparation.authorizationReference !== authorization.authorization.preparation ||
      preparation.nextPhase?.authorizationReference !== authorization.authorization.trafficCutover ||
      preparation.active?.releaseId !== authorization.active.releaseId ||
      preparation.candidate?.releaseId !== authorization.candidate.releaseId ||
      preparation.cutover?.planId !== authorization.cutover.planId) {
    throw new Error("STAGING_UPGRADE_TRAFFIC_PREPARATION_INVALID");
  }
  return { schemaVersion: 1, product: "company-os", status: "PLANNED_NOT_APPLIED",
    phase: "TRAFFIC_CUTOVER", operationId: authorization.operation.id,
    siteId: authorization.operation.siteId,
    accountableOperatorReference: authorization.operation.accountableOperatorReference,
    expiresAt: authorization.operation.expiresAt,
    active: preparation.active, candidate: preparation.candidate, cutover: preparation.cutover,
    preparationStateDigest: sha256(preparationStateRaw),
    authorizationReference: authorization.authorization.trafficCutover,
    steps: ["route-traffic", "observe"] as const,
    rollback: { authorizationReference: authorization.authorization.rollback,
      automatic: false, strategy: preparation.rollback?.strategy },
    automaticRollbackAttempted: false } as const;
}

export async function runStagingUpgradeTraffic(planValue: ReturnType<typeof createStagingUpgradeTrafficPlan> &
  { readonly rootDirectory: string }, supplied: {
    readonly executeStep: (step: "route-traffic" | "observe") => Promise<{
      readonly status: "PASS" | "FAIL"; readonly evidenceDigest: string }>;
    readonly now?: () => string;
  }) {
  const plan = await validatePlan(planValue);
  const now = supplied.now ?? (() => new Date().toISOString());
  await verifyPreparationState(plan);
  await rejectExistingRecord(plan);
  const lockPath = join(plan.rootDirectory, LOCK);
  try { await writeFile(lockPath, `${plan.operationId}:TRAFFIC_CUTOVER\n`, { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (isCode(error, "EEXIST")) throw new Error("STAGING_UPGRADE_TRAFFIC_ALREADY_RUNNING");
    throw error;
  }
  const startedAt = now(); const completedEvidence: Array<{ step: string; evidenceDigest: string }> = [];
  let attemptedStep: "route-traffic" | "observe" = "route-traffic";
  try {
    for (const step of plan.steps) {
      attemptedStep = step;
      await writeState(plan, { status: "TRAFFIC_CUTOVER_RUNNING", startedAt, currentStep: step,
        completedEvidence, trafficMoved: completedEvidence.some(({ step }) => step === "route-traffic") });
      const evidence = await supplied.executeStep(step);
      if (!evidence || !DIGEST.test(evidence.evidenceDigest) ||
          (evidence.status !== "PASS" && evidence.status !== "FAIL")) throw new TrafficEvidenceError(step);
      if (evidence.status === "FAIL") throw new TrafficStepError(step);
      completedEvidence.push({ step, evidenceDigest: evidence.evidenceDigest });
    }
    const result = state(plan, { status: "UPGRADE_OBSERVATION_COMPLETE_PENDING_ACCEPTANCE",
      startedAt, completedAt: now(), currentStep: null, completedEvidence, trafficMoved: true });
    await writeStateValue(plan, result); await retainRecord(plan, result); return result;
  } catch (error) {
    const failedStep = error instanceof TrafficEvidenceError || error instanceof TrafficStepError
      ? error.step : attemptedStep;
    const trafficMoved = completedEvidence.some(({ step }) => step === "route-traffic") ||
      failedStep === "route-traffic";
    const result = state(plan, { status: "TRAFFIC_CUTOVER_FAILED_REQUIRES_EXPLICIT_DECISION",
      startedAt, failedAt: now(), currentStep: null, completedEvidence, failedStep,
      failureCode: error instanceof TrafficEvidenceError ? "EVIDENCE_INVALID" :
        error instanceof TrafficStepError ? "STEP_FAILED" : "INTERNAL_FAILURE", trafficMoved });
    await writeStateValue(plan, result); await retainRecord(plan, result);
    if (error instanceof TrafficEvidenceError) throw new Error("STAGING_UPGRADE_TRAFFIC_EVIDENCE_INVALID");
    if (error instanceof TrafficStepError) throw new Error(`STAGING_UPGRADE_TRAFFIC_STEP_FAILED:${error.step}`);
    throw error;
  } finally { await rm(lockPath, { force: true }); }
}

async function validatePlan<T extends { readonly rootDirectory: string }>(value: T) {
  if (!value || value.schemaVersion !== 1 || value.product !== "company-os" ||
      value.status !== "PLANNED_NOT_APPLIED" || value.phase !== "TRAFFIC_CUTOVER" ||
      JSON.stringify(value.steps) !== JSON.stringify(["route-traffic", "observe"]) ||
      value.automaticRollbackAttempted !== false || !DIGEST.test(value.preparationStateDigest)) {
    throw new Error("STAGING_UPGRADE_TRAFFIC_PLAN_INVALID");
  }
  if (!isAbsolute(value.rootDirectory)) throw new Error("STAGING_UPGRADE_TRAFFIC_ROOT_INVALID");
  const root = resolve(value.rootDirectory);
  if (root === "/" || root === resolve(homedir())) throw new Error("STAGING_UPGRADE_TRAFFIC_ROOT_INVALID");
  const metadata = await lstat(root);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o027) !== 0) {
    throw new Error("STAGING_UPGRADE_TRAFFIC_ROOT_UNSAFE");
  }
  return { ...value, rootDirectory: root };
}
async function verifyPreparationState(plan: any) {
  const raw = await privateFile(join(plan.rootDirectory, "upgrade-preparation-state.json"));
  if (sha256(raw) !== plan.preparationStateDigest) throw new Error("STAGING_UPGRADE_TRAFFIC_PREPARATION_CHANGED");
  const value = json(raw, "STAGING_UPGRADE_TRAFFIC_PREPARATION_INVALID");
  if (value.status !== "UPGRADE_PREPARATION_COMPLETE_NOT_ROUTED" || value.operationId !== plan.operationId ||
      value.siteId !== plan.siteId || value.trafficMoved !== false) {
    throw new Error("STAGING_UPGRADE_TRAFFIC_PREPARATION_INVALID");
  }
}
function state(plan: any, details: Record<string, unknown>) {
  return { schemaVersion: 1, product: "company-os", phase: "TRAFFIC_CUTOVER",
    operationId: plan.operationId, siteId: plan.siteId,
    accountableOperatorReference: plan.accountableOperatorReference,
    active: plan.active, candidate: plan.candidate, cutover: plan.cutover,
    preparationStateDigest: plan.preparationStateDigest,
    authorizationReference: plan.authorizationReference, rollback: plan.rollback,
    automaticRollbackAttempted: false, ...details };
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
    throw new Error("STAGING_UPGRADE_TRAFFIC_RECORDS_UNSAFE");
  }
  await writeFile(join(directory, `${plan.operationId}.json`), `${JSON.stringify(value, null, 2)}\n`,
    { flag: "wx", mode: 0o600 });
}
async function rejectExistingRecord(plan: any) {
  try { await readFile(join(plan.rootDirectory, RECORDS, `${plan.operationId}.json`));
    throw new Error("STAGING_UPGRADE_TRAFFIC_OPERATION_ALREADY_RECORDED"); }
  catch (error) { if (!isCode(error, "ENOENT")) throw error; }
}
async function privateFile(path: string) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o077) !== 0 || metadata.size < 2 || metadata.size > 1_048_576) {
    throw new Error("STAGING_UPGRADE_TRAFFIC_FILE_UNSAFE");
  }
  return readFile(path, "utf8");
}
function json(value: string, code: string): any { try { return JSON.parse(value); } catch { throw new Error(code); } }
function instant(value: string) { try { return new Date(value).toISOString() === value; } catch { return false; } }
function sha256(value: string) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
class TrafficStepError extends Error {
  readonly step: "route-traffic" | "observe";
  constructor(step: "route-traffic" | "observe") { super(step); this.step = step; }
}
class TrafficEvidenceError extends Error {
  readonly step: "route-traffic" | "observe";
  constructor(step: "route-traffic" | "observe") { super(step); this.step = step; }
}
