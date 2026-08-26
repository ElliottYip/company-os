import { spawnSync } from "node:child_process";
import { lstat, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { parsePublicStagingEnvironment } from "../adapters/config/staging-deployment-doctor.ts";
import { verifyStagingReleaseBundle } from "./create-staging-release-bundle.mjs";

const RELEASE_ID = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?-[a-f0-9]{12}$/;
const AUTHORIZATION_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,255}$/;
const STORE_MARKER = "company-os staging release store v1\n";
const STARTUP_STATE = "startup-state.json";
const START_LOCK = ".staging-start.lock";

export async function planStagingReleaseStart(input) {
  const paths = await validatedPaths(input);
  const prepared = await preparedRelease(paths.rootDirectory, input.releaseId);
  await verifyStagingReleaseBundle(prepared.releaseDirectory);
  const environment = await publicEnvironment(paths.environmentFile);
  if (resolve(environment.COMPANY_OS_SECRET_DIRECTORY ?? "") !== paths.secretDirectory) {
    throw new Error("STAGING_START_SECRET_DIRECTORY_MISMATCH");
  }
  const release = JSON.parse(await readFile(join(prepared.releaseDirectory, "release-manifest.json"), "utf8"));
  for (const [key, expected] of [["COMPANY_OS_API_IMAGE", release.images?.api],
    ["COMPANY_OS_WEB_IMAGE", release.images?.web], ["COMPANY_OS_OPS_IMAGE", release.images?.ops]]) {
    if (environment[key] !== expected) throw new Error(`STAGING_START_RELEASE_IMAGE_MISMATCH:${key}`);
  }
  await rejectExistingStartupState(paths.rootDirectory);

  const compose = ["docker", "compose", "--env-file", paths.environmentFile,
    "-f", join(prepared.releaseDirectory, "compose.staging.yml")];
  const steps = [
    commandStep("DOCTOR", ["node", "--experimental-strip-types", "scripts/staging-deployment-doctor.ts",
      "--root", paths.rootDirectory, "--secret-directory", paths.secretDirectory,
      "--public-env-file", paths.environmentFile]),
    commandStep("COMPOSE_CONFIG", [...compose, "config", "--quiet"]),
    commandStep("PULL_IMAGES", [...compose, "pull", "api", "web"]),
    commandStep("MIGRATE", [...compose, "run", "--rm", "--no-deps", "migrate"]),
    commandStep("PROVISION_RUNTIME_ROLE", [...compose, "run", "--rm", "--no-deps", "provision-runtime"]),
    commandStep("START_API", [...compose, "up", "-d", "--no-deps", "api"]),
    probeStep("API_READY", "http://127.0.0.1:4601/ready"),
    commandStep("START_WEB", [...compose, "up", "-d", "--no-deps", "web"]),
    probeStep("WEB_SMOKE", "http://127.0.0.1:4600/"),
    probeStep("API_SMOKE", "http://127.0.0.1:4601/ready"),
  ];
  return { schemaVersion: 1, status: "PLANNED_NOT_APPLIED", releaseId: prepared.releaseId,
    releaseVersion: prepared.releaseVersion, sourceRevision: prepared.sourceRevision,
    authorizationReference: input.authorizationReference, rootDirectory: paths.rootDirectory, steps };
}

export async function startStagingRelease(input, supplied = {}) {
  const plan = await planStagingReleaseStart(input);
  const dependencies = { now: () => new Date().toISOString(), runCommand: defaultRunCommand,
    probe: defaultProbe, wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    ...supplied };
  const lockPath = join(plan.rootDirectory, START_LOCK);
  try {
    await writeFile(lockPath, `${plan.releaseId}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (isCode(error, "EEXIST")) throw new Error("STAGING_START_ALREADY_RUNNING");
    throw error;
  }

  const startedAt = dependencies.now(); const completedSteps = []; let attemptedStep = null;
  try {
    await writeStartupState(plan.rootDirectory, state(plan, { state: "STARTING", startedAt,
      currentStep: plan.steps[0].id, completedSteps, acceptanceClaimed: false,
      automaticRollbackAttempted: false }));
    for (const step of plan.steps) {
      attemptedStep = step.id;
      await writeStartupState(plan.rootDirectory, state(plan, { state: "STARTING", startedAt,
        currentStep: step.id, completedSteps, acceptanceClaimed: false,
        automaticRollbackAttempted: false }));
      const ok = step.kind === "COMMAND"
        ? (await dependencies.runCommand(step)).ok
        : await waitForProbe(step, dependencies);
      if (!ok) throw new StagingStepError(step.id, step.kind === "COMMAND" ? "COMMAND_FAILED" : "PROBE_FAILED");
      completedSteps.push(step.id);
    }
    const result = state(plan, { state: "STARTED_NOT_ACCEPTED", startedAt,
      completedAt: dependencies.now(), currentStep: null, completedSteps,
      acceptanceClaimed: false, automaticRollbackAttempted: false });
    await writeStartupState(plan.rootDirectory, result);
    return { schemaVersion: 1, status: result.state, releaseId: plan.releaseId,
      authorizationReference: plan.authorizationReference };
  } catch (error) {
    const failedStep = error instanceof StagingStepError ? error.step : attemptedStep ?? "START_INITIALIZATION";
    const failureCode = error instanceof StagingStepError ? error.failureCode : "START_INTERNAL_FAILURE";
    await writeStartupState(plan.rootDirectory, state(plan, { state: "START_FAILED_REQUIRES_REVIEW",
      startedAt, failedAt: dependencies.now(), currentStep: null, completedSteps, failedStep, failureCode,
      databaseMigrationMayHaveRun: completedSteps.includes("MIGRATE") || attemptedStep === "MIGRATE",
      acceptanceClaimed: false, automaticRollbackAttempted: false }));
    if (error instanceof StagingStepError) throw new Error(`STAGING_START_STEP_FAILED:${error.step}`);
    throw error;
  } finally {
    await rm(lockPath, { force: true });
  }
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
  const result = spawnSync(step.argv[0], step.argv.slice(1), { stdio: "inherit", timeout: 600_000 });
  return Promise.resolve({ ok: result.status === 0 });
}

async function defaultProbe(step) {
  try { const response = await fetch(step.url, { redirect: "error", signal: AbortSignal.timeout(3_000) });
    return response.ok; }
  catch { return false; }
}

async function validatedPaths(input) {
  const rootDirectory = safeAbsolutePath(input.rootDirectory, "STAGING_START_ROOT_ABSOLUTE_PATH_REQUIRED");
  const environmentFile = safeAbsolutePath(input.environmentFile, "STAGING_START_ENV_ABSOLUTE_PATH_REQUIRED");
  const secretDirectory = safeAbsolutePath(input.secretDirectory, "STAGING_START_SECRET_DIRECTORY_ABSOLUTE_PATH_REQUIRED");
  if (rootDirectory === "/" || rootDirectory === resolve(homedir())) throw new Error("STAGING_START_ROOT_TOO_BROAD");
  if (!RELEASE_ID.test(input.releaseId ?? "")) throw new Error("STAGING_START_RELEASE_ID_INVALID");
  if (!AUTHORIZATION_REFERENCE.test(input.authorizationReference ?? "")) {
    throw new Error("STAGING_START_AUTHORIZATION_REFERENCE_INVALID");
  }
  const rootStat = await lstat(rootDirectory);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || (rootStat.mode & 0o027) !== 0) {
    throw new Error("STAGING_START_ROOT_UNSAFE");
  }
  const marker = join(rootDirectory, ".company-os-release-store");
  const markerStat = await lstat(marker);
  if (!markerStat.isFile() || markerStat.isSymbolicLink() || markerStat.nlink !== 1 ||
      (markerStat.mode & 0o077) !== 0 || await readFile(marker, "utf8") !== STORE_MARKER) {
    throw new Error("STAGING_START_STORE_MARKER_UNSAFE");
  }
  return { rootDirectory, environmentFile, secretDirectory };
}

async function preparedRelease(rootDirectory, releaseId) {
  const storePath = join(rootDirectory, "release-store.json"); const valueStat = await lstat(storePath);
  if (!valueStat.isFile() || valueStat.isSymbolicLink() || valueStat.nlink !== 1 || (valueStat.mode & 0o077) !== 0) {
    throw new Error("STAGING_START_RELEASE_STORE_UNSAFE");
  }
  const store = JSON.parse(await readFile(storePath, "utf8"));
  if (store?.schemaVersion !== 1 || store.product !== "company-os" || store.state !== "PREPARED_NOT_STARTED" ||
      store.prepared?.releaseId !== releaseId || !Array.isArray(store.previous)) {
    throw new Error("STAGING_START_PREPARED_RELEASE_MISMATCH");
  }
  const expected = join(rootDirectory, "releases", releaseId);
  if (resolve(store.prepared.releaseDirectory ?? "") !== expected) throw new Error("STAGING_START_RELEASE_PATH_INVALID");
  return store.prepared;
}

async function publicEnvironment(path) {
  const valueStat = await lstat(path);
  if (!valueStat.isFile() || valueStat.isSymbolicLink() || valueStat.nlink !== 1 || (valueStat.mode & 0o077) !== 0) {
    throw new Error("STAGING_START_PUBLIC_ENV_UNSAFE");
  }
  return parsePublicStagingEnvironment(await readFile(path, "utf8"));
}

async function rejectExistingStartupState(rootDirectory) {
  try {
    const valueStat = await lstat(join(rootDirectory, STARTUP_STATE));
    if (!valueStat.isFile() || valueStat.isSymbolicLink() || valueStat.nlink !== 1 || (valueStat.mode & 0o077) !== 0) {
      throw new Error("STAGING_START_STATE_UNSAFE");
    }
    throw new Error("STAGING_START_REVIEW_REQUIRED");
  } catch (error) {
    if (isCode(error, "ENOENT")) return;
    throw error;
  }
}

function state(plan, details) {
  return { schemaVersion: 1, product: "company-os", releaseId: plan.releaseId,
    releaseVersion: plan.releaseVersion, sourceRevision: plan.sourceRevision,
    authorizationReference: plan.authorizationReference, ...details };
}

async function writeStartupState(rootDirectory, value) {
  const finalPath = join(rootDirectory, STARTUP_STATE);
  try {
    const current = await lstat(finalPath);
    if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1 || (current.mode & 0o077) !== 0) {
      throw new Error("STAGING_START_STATE_UNSAFE");
    }
  } catch (error) {
    if (!isCode(error, "ENOENT")) throw error;
  }
  const temporary = join(rootDirectory, `.startup-state.json.partial-${process.pid}-${Date.now()}`);
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(temporary, finalPath);
  } finally { await rm(temporary, { force: true }); }
}

function safeAbsolutePath(value, code) {
  if (typeof value !== "string" || !isAbsolute(value)) throw new Error(code);
  return resolve(value);
}

function isCode(error, code) { return error instanceof Error && "code" in error && error.code === code; }

class StagingStepError extends Error {
  constructor(step, failureCode) { super(failureCode); this.step = step; this.failureCode = failureCode; }
}

function argumentsFrom(values) {
  const result = { rootDirectory: "/srv/company-os/staging", environmentFile: "/srv/company-os/staging/staging.env",
    secretDirectory: "/etc/company-os/secrets", releaseId: undefined, authorizationReference: undefined, apply: false };
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (flag === "--apply") result.apply = true;
    else if (flag === "--root") result.rootDirectory = values[++index];
    else if (flag === "--release") result.releaseId = values[++index];
    else if (flag === "--authorization") result.authorizationReference = values[++index];
    else if (flag === "--public-env-file") result.environmentFile = values[++index];
    else if (flag === "--secret-directory") result.secretDirectory = values[++index];
    else throw new Error("STAGING_START_ARGUMENT_INVALID");
  }
  return result;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const options = argumentsFrom(process.argv.slice(2));
  const result = options.apply ? await startStagingRelease(options) : await planStagingReleaseStart(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
