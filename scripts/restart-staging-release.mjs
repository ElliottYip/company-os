import { spawnSync } from "node:child_process";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { parsePublicStagingEnvironment } from "../adapters/config/staging-deployment-doctor.ts";
import { verifyStagingReleaseBundle } from "./create-staging-release-bundle.mjs";
import { inspectDeploymentDrain } from "./inspect-deployment-drain.ts";
import { inspectStagingRuntime } from "./inspect-staging-runtime.mjs";
import { verifyDeploymentStateAdoption } from "./verify-deployment-state-adoption.ts";

const RELEASE_ID = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?-[a-f0-9]{12}$/;
const OPERATION_ID = /^restart-[a-z0-9][a-z0-9-]{2,95}$/;
const AUTHORIZATION_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,255}$/;
const STORE_MARKER = "company-os staging release store v1\n";
const LIFECYCLE_LOCK = ".staging-lifecycle.lock";
const CURRENT_STATE = "restart-state.json";
const RECORDS_DIRECTORY = "restart-records";

export async function planStagingRestart(input, supplied = {}) {
  const paths = await validatedPaths(input);
  const prepared = await preparedRelease(paths.rootDirectory, input.releaseId);
  await verifyStagingReleaseBundle(prepared.releaseDirectory);
  await validateStartedState(paths.rootDirectory, prepared);
  const environment = await publicEnvironment(paths.environmentFile);
  if (resolve(environment.COMPANY_OS_SECRET_DIRECTORY ?? "") !== paths.secretDirectory) {
    throw new Error("STAGING_RESTART_SECRET_DIRECTORY_MISMATCH");
  }
  const release = JSON.parse(await readFile(join(prepared.releaseDirectory, "release-manifest.json"), "utf8"));
  for (const [key, expected] of [["COMPANY_OS_API_IMAGE", release.images?.api],
    ["COMPANY_OS_WEB_IMAGE", release.images?.web]]) {
    if (environment[key] !== expected) throw new Error(`STAGING_RESTART_RELEASE_IMAGE_MISMATCH:${key}`);
  }
  const inspectRuntime = supplied.inspectRuntime ?? (() => inspectStagingRuntime({ rootDirectory: paths.rootDirectory }));
  if ((await inspectRuntime()).status !== "RUNNING_NOT_ACCEPTED") {
    throw new Error("STAGING_RESTART_RUNTIME_REVIEW_REQUIRED");
  }
  const compose = ["docker", "compose", "--env-file", paths.environmentFile,
    "-f", join(prepared.releaseDirectory, "compose.staging.yml")];
  return {
    schemaVersion: 1, status: "PLANNED_NOT_APPLIED", operationId: input.operationId,
    releaseId: prepared.releaseId, releaseVersion: prepared.releaseVersion,
    sourceRevision: prepared.sourceRevision, authorizationReference: input.authorizationReference,
    rootDirectory: paths.rootDirectory,
    steps: [
      { id: "CAPTURE_DRAIN", kind: "DRAIN" },
      commandStep("RESTART_API", [...compose, "restart", "--timeout", "30", "api"]),
      probeStep("API_READY", "http://127.0.0.1:4601/ready"),
      commandStep("RESTART_WEB", [...compose, "restart", "--timeout", "30", "web"]),
      probeStep("WEB_READY", "http://127.0.0.1:4600/"),
      { id: "RUNTIME_RECONCILIATION", kind: "RUNTIME" },
      { id: "STATE_ADOPTION", kind: "ADOPTION" },
    ],
  };
}

export async function restartStagingRelease(input, supplied = {}) {
  const plan = await planStagingRestart(input, supplied);
  const dependencies = {
    now: () => new Date().toISOString(), runCommand: defaultRunCommand, probe: defaultProbe,
    wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    inspectRuntime: () => inspectStagingRuntime({ rootDirectory: plan.rootDirectory }),
    inspectDrain: () => inspectDeploymentDrain(),
    verifyAdoption: (path) => verifyDeploymentStateAdoption(path),
    ...supplied,
  };
  const lockPath = join(plan.rootDirectory, LIFECYCLE_LOCK);
  try { await writeFile(lockPath, `${plan.operationId}\n`, { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (isCode(error, "EEXIST")) throw new Error("STAGING_RESTART_ALREADY_RUNNING");
    throw error;
  }

  try {
  const recordsDirectory = await ensureRecordsDirectory(plan.rootDirectory);
  const retainedPath = join(recordsDirectory, `${plan.operationId}.json`);
  const beforePath = join(recordsDirectory, `${plan.operationId}.pre-drain.json`);
  await rejectExistingRecord(retainedPath);
  await rejectExistingRecord(beforePath);
  const startedAt = dependencies.now(); const completedSteps = []; let attemptedStep = "RESTART_INITIALIZATION";
  let preRestartDigest = null;
  try {
    await writeRestartState(plan.rootDirectory, state(plan, { state: "RESTARTING", startedAt,
      currentStep: "CAPTURE_DRAIN", completedSteps, preRestartDigest,
      acceptanceClaimed: false, automaticRollbackAttempted: false }));
    if ((await dependencies.inspectRuntime()).status !== "RUNNING_NOT_ACCEPTED") {
      throw new RestartStepError("RUNTIME_PRECHECK", "RUNTIME_REVIEW_REQUIRED");
    }
    attemptedStep = "CAPTURE_DRAIN";
    const drain = await dependencies.inspectDrain();
    if (drain.status !== "DRAINED" || drain.restartAllowed !== true) {
      throw new RestartStepError("CAPTURE_DRAIN", "DRAIN_REQUIRED");
    }
    preRestartDigest = drain.exactSourceDigest;
    await retainFinalState(beforePath, drain);
    completedSteps.push("CAPTURE_DRAIN");

    for (const step of plan.steps.filter(({ kind }) => kind === "COMMAND" || kind === "PROBE")) {
      attemptedStep = step.id;
      await writeRestartState(plan.rootDirectory, state(plan, { state: "RESTARTING", startedAt,
        currentStep: step.id, completedSteps, preRestartDigest,
        acceptanceClaimed: false, automaticRollbackAttempted: false }));
      const ok = step.kind === "COMMAND"
        ? (await dependencies.runCommand(step)).ok
        : await waitForProbe(step, dependencies);
      if (!ok) throw new RestartStepError(step.id, step.kind === "COMMAND" ? "COMMAND_FAILED" : "PROBE_FAILED");
      completedSteps.push(step.id);
    }

    attemptedStep = "RUNTIME_RECONCILIATION";
    if ((await dependencies.inspectRuntime()).status !== "RUNNING_NOT_ACCEPTED") {
      throw new RestartStepError(attemptedStep, "RUNTIME_RECONCILIATION_FAILED");
    }
    completedSteps.push(attemptedStep);
    attemptedStep = "STATE_ADOPTION";
    const adoption = await dependencies.verifyAdoption(beforePath);
    if (adoption.status !== "ADOPTION_VERIFIED" || adoption.stateAdopted !== true) {
      throw new RestartStepError(attemptedStep, "ADOPTION_FAILED");
    }
    completedSteps.push(attemptedStep);
    const result = state(plan, { state: "RESTARTED_NOT_ACCEPTED", startedAt,
      completedAt: dependencies.now(), currentStep: null, completedSteps, preRestartDigest,
      acceptanceClaimed: false, automaticRollbackAttempted: false });
    await writeRestartState(plan.rootDirectory, result);
    await retainFinalState(retainedPath, result);
    return { schemaVersion: 1, status: result.state, operationId: plan.operationId,
      releaseId: plan.releaseId, authorizationReference: plan.authorizationReference };
  } catch (error) {
    const failedStep = error instanceof RestartStepError ? error.step : attemptedStep;
    const failureCode = error instanceof RestartStepError ? error.failureCode : "RESTART_INTERNAL_FAILURE";
    const failure = state(plan, { state: "RESTART_FAILED_REQUIRES_REVIEW", startedAt,
      failedAt: dependencies.now(), currentStep: null, completedSteps, failedStep, failureCode,
      preRestartDigest, serviceRestartMayHaveRun: completedSteps.includes("RESTART_API") ||
        attemptedStep === "RESTART_API" || attemptedStep === "RESTART_WEB",
      acceptanceClaimed: false, automaticRollbackAttempted: false });
    await writeRestartState(plan.rootDirectory, failure);
    await retainFinalState(retainedPath, failure);
    if (error instanceof RestartStepError) {
      const publicCode = error.failureCode === "DRAIN_REQUIRED" ? "STAGING_RESTART_DRAIN_REQUIRED"
        : error.failureCode === "ADOPTION_FAILED" ? "STAGING_RESTART_ADOPTION_FAILED"
        : `STAGING_RESTART_STEP_FAILED:${error.step}`;
      throw new Error(publicCode);
    }
    throw error;
  }
  } finally { await rm(lockPath, { force: true }); }
}

function commandStep(id, argv) { return { id, kind: "COMMAND", argv }; }
function probeStep(id, url) { return { id, kind: "PROBE", url }; }

async function waitForProbe(step, dependencies) {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    if (await dependencies.probe(step)) return true;
    if (attempt < 30) await dependencies.wait(2_000);
  }
  return false;
}

function defaultRunCommand(step) {
  const result = spawnSync(step.argv[0], step.argv.slice(1), { stdio: "inherit", timeout: 180_000 });
  return Promise.resolve({ ok: result.status === 0 });
}

async function defaultProbe(step) {
  try { const response = await fetch(step.url, { redirect: "error", signal: AbortSignal.timeout(3_000) });
    return response.ok; }
  catch { return false; }
}

async function validatedPaths(input) {
  const rootDirectory = safeAbsolutePath(input.rootDirectory, "STAGING_RESTART_ROOT_ABSOLUTE_PATH_REQUIRED");
  const environmentFile = safeAbsolutePath(input.environmentFile, "STAGING_RESTART_ENV_ABSOLUTE_PATH_REQUIRED");
  const secretDirectory = safeAbsolutePath(input.secretDirectory, "STAGING_RESTART_SECRET_DIRECTORY_ABSOLUTE_PATH_REQUIRED");
  if (rootDirectory === "/" || rootDirectory === resolve(homedir())) throw new Error("STAGING_RESTART_ROOT_TOO_BROAD");
  if (!RELEASE_ID.test(input.releaseId ?? "")) throw new Error("STAGING_RESTART_RELEASE_ID_INVALID");
  if (!OPERATION_ID.test(input.operationId ?? "")) throw new Error("STAGING_RESTART_OPERATION_ID_INVALID");
  if (!AUTHORIZATION_REFERENCE.test(input.authorizationReference ?? "")) {
    throw new Error("STAGING_RESTART_AUTHORIZATION_REFERENCE_INVALID");
  }
  const rootStat = await lstat(rootDirectory);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || (rootStat.mode & 0o027) !== 0) {
    throw new Error("STAGING_RESTART_ROOT_UNSAFE");
  }
  const marker = join(rootDirectory, ".company-os-release-store"); const markerStat = await lstat(marker);
  if (!markerStat.isFile() || markerStat.isSymbolicLink() || markerStat.nlink !== 1 ||
      (markerStat.mode & 0o077) !== 0 || await readFile(marker, "utf8") !== STORE_MARKER) {
    throw new Error("STAGING_RESTART_STORE_MARKER_UNSAFE");
  }
  const secretStat = await lstat(secretDirectory);
  if (!secretStat.isDirectory() || secretStat.isSymbolicLink() || (secretStat.mode & 0o077) !== 0) {
    throw new Error("STAGING_RESTART_SECRET_DIRECTORY_UNSAFE");
  }
  return { rootDirectory, environmentFile, secretDirectory };
}

async function preparedRelease(rootDirectory, releaseId) {
  const storePath = join(rootDirectory, "release-store.json"); const metadata = await lstat(storePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 || (metadata.mode & 0o077) !== 0) {
    throw new Error("STAGING_RESTART_RELEASE_STORE_UNSAFE");
  }
  const store = JSON.parse(await readFile(storePath, "utf8")); const prepared = store?.prepared;
  if (store?.schemaVersion !== 1 || store.product !== "company-os" || store.state !== "PREPARED_NOT_STARTED" ||
      prepared?.releaseId !== releaseId || !Array.isArray(store.previous) ||
      resolve(prepared.releaseDirectory ?? "") !== join(rootDirectory, "releases", releaseId)) {
    throw new Error("STAGING_RESTART_PREPARED_RELEASE_MISMATCH");
  }
  return prepared;
}

async function validateStartedState(rootDirectory, prepared) {
  const path = join(rootDirectory, "startup-state.json"); const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 || (metadata.mode & 0o077) !== 0) {
    throw new Error("STAGING_RESTART_START_STATE_UNSAFE");
  }
  const value = JSON.parse(await readFile(path, "utf8"));
  if (value?.schemaVersion !== 1 || value.product !== "company-os" || value.state !== "STARTED_NOT_ACCEPTED" ||
      value.releaseId !== prepared.releaseId || value.sourceRevision !== prepared.sourceRevision ||
      value.acceptanceClaimed !== false) throw new Error("STAGING_RESTART_START_STATE_INVALID");
}

async function publicEnvironment(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 || (metadata.mode & 0o077) !== 0) {
    throw new Error("STAGING_RESTART_PUBLIC_ENV_UNSAFE");
  }
  return parsePublicStagingEnvironment(await readFile(path, "utf8"));
}

async function ensureRecordsDirectory(rootDirectory) {
  const path = join(rootDirectory, RECORDS_DIRECTORY);
  try { await mkdir(path, { mode: 0o700 }); }
  catch (error) { if (!isCode(error, "EEXIST")) throw error; }
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) {
    throw new Error("STAGING_RESTART_RECORDS_DIRECTORY_UNSAFE");
  }
  return path;
}

async function rejectExistingRecord(path) {
  try { await lstat(path); throw new Error("STAGING_RESTART_OPERATION_ALREADY_RECORDED"); }
  catch (error) { if (isCode(error, "ENOENT")) return; throw error; }
}

function state(plan, details) {
  return { schemaVersion: 1, product: "company-os", operationId: plan.operationId,
    releaseId: plan.releaseId, releaseVersion: plan.releaseVersion,
    sourceRevision: plan.sourceRevision, authorizationReference: plan.authorizationReference, ...details };
}

async function writeRestartState(rootDirectory, value) {
  await writePrivateAtomic(join(rootDirectory, CURRENT_STATE), value);
}

async function writePrivateAtomic(finalPath, value) {
  try {
    const current = await lstat(finalPath);
    if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1 || (current.mode & 0o077) !== 0) {
      throw new Error("STAGING_RESTART_STATE_UNSAFE");
    }
  } catch (error) { if (!isCode(error, "ENOENT")) throw error; }
  const temporary = `${finalPath}.partial-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(temporary, finalPath);
  } finally { await rm(temporary, { force: true }); }
}

async function retainFinalState(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
}

function safeAbsolutePath(value, code) {
  if (typeof value !== "string" || !isAbsolute(value)) throw new Error(code);
  return resolve(value);
}
function isCode(error, code) { return error instanceof Error && "code" in error && error.code === code; }

class RestartStepError extends Error {
  constructor(step, failureCode) { super(failureCode); this.step = step; this.failureCode = failureCode; }
}

function argumentsFrom(values) {
  const result = { rootDirectory: "/srv/company-os/staging", environmentFile: "/srv/company-os/staging/staging.env",
    secretDirectory: "/etc/company-os/secrets", releaseId: undefined, operationId: undefined,
    authorizationReference: undefined, apply: false };
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (flag === "--apply") result.apply = true;
    else if (flag === "--root") result.rootDirectory = values[++index];
    else if (flag === "--release") result.releaseId = values[++index];
    else if (flag === "--operation") result.operationId = values[++index];
    else if (flag === "--authorization") result.authorizationReference = values[++index];
    else if (flag === "--public-env-file") result.environmentFile = values[++index];
    else if (flag === "--secret-directory") result.secretDirectory = values[++index];
    else throw new Error("STAGING_RESTART_ARGUMENT_INVALID");
  }
  return result;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const options = argumentsFrom(process.argv.slice(2));
  const result = options.apply ? await restartStagingRelease(options) : await planStagingRestart(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
