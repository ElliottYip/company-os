import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { parsePublicStagingEnvironment } from "../adapters/config/staging-deployment-doctor.ts";
import { planStagingReleaseStart } from "./start-staging-release.mjs";

const LOCK = ".staging-lifecycle.lock";
const PRODUCT_STATE = "product-start-state.json";
const STARTUP_STATE = "startup-state.json";

export async function planStagingProductStart(input) {
  const base = await planStagingReleaseStart(input);
  const phase = base.firstStartAuthorization.phases.find(
    ({ authorizationKind }) => authorizationKind === "PRODUCT_START");
  if (!phase?.authorizationReference || input.authorizationReference !== phase.authorizationReference) {
    throw new Error("STAGING_PRODUCT_START_AUTHORIZATION_MISMATCH");
  }
  const migration = await verifiedMigrationState(base);
  await rejectExistingProductState(base.rootDirectory);
  const environment = parsePublicStagingEnvironment(await readFile(input.environmentFile, "utf8"));
  const apiPort = exactPort(environment.COMPANY_OS_API_LOOPBACK_PORT);
  const webPort = exactPort(environment.COMPANY_OS_WEB_LOOPBACK_PORT);
  const compose = ["docker", "compose", "--env-file", input.environmentFile,
    "-f", join(base.rootDirectory, "releases", base.releaseId, "compose.staging.yml")];
  const steps = [
    command("PULL_PRODUCT_IMAGES", [...compose, "pull", "reference-data-node", "api", "web"]),
    command("START_REFERENCE_DATA_NODE", [...compose, "up", "-d", "--wait", "--no-deps",
      "reference-data-node"]),
    command("START_API", [...compose, "up", "-d", "--no-deps", "api"]),
    probe("API_READY", `http://127.0.0.1:${apiPort}/ready`),
    command("START_WEB", [...compose, "up", "-d", "--no-deps", "web"]),
    probe("WEB_SMOKE", `http://127.0.0.1:${webPort}/`),
    probe("API_SMOKE", `http://127.0.0.1:${apiPort}/ready`),
  ];
  return { schemaVersion: 1, product: "company-os", status: "PLANNED_NOT_APPLIED",
    phase: "PRODUCT_START", releaseId: base.releaseId, releaseVersion: base.releaseVersion,
    sourceRevision: base.sourceRevision, dependencyManifestDigest: base.dependencyManifestDigest,
    migrationStateDigest: migration.stateDigest,
    authorizationReference: phase.authorizationReference, rootDirectory: base.rootDirectory, steps };
}

export async function runStagingProductStart(input, supplied = {}) {
  const plan = await planStagingProductStart(input);
  const dependencies = { now: () => new Date().toISOString(), runCommand: defaultRunCommand,
    probe: defaultProbe, wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    ...supplied };
  const lockPath = join(plan.rootDirectory, LOCK);
  try { await writeFile(lockPath, `${plan.releaseId}:PRODUCT_START\n`, { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (isCode(error, "EEXIST")) throw new Error("STAGING_PRODUCT_START_ALREADY_RUNNING");
    throw error;
  }
  const startedAt = dependencies.now(); const completedSteps = []; let attemptedStep = null;
  try {
    await writeProductState(plan, { status: "PRODUCT_START_RUNNING", startedAt,
      currentStep: plan.steps[0].id, completedSteps, serviceMutationMayHaveRun: false });
    for (const step of plan.steps) {
      attemptedStep = step.id;
      await writeProductState(plan, { status: "PRODUCT_START_RUNNING", startedAt,
        currentStep: step.id, completedSteps,
        serviceMutationMayHaveRun: completedSteps.some(isServiceMutation) });
      const ok = step.kind === "COMMAND" ? (await dependencies.runCommand(step)).ok :
        await waitForProbe(step, dependencies);
      if (!ok) throw new ProductStartStepError(step.id, step.kind === "PROBE" ? "PROBE_FAILED" : "COMMAND_FAILED");
      completedSteps.push(step.id);
    }
    const completedAt = dependencies.now();
    const state = await writeProductState(plan, { status: "STARTED_NOT_ACCEPTED", startedAt,
      completedAt, currentStep: null, completedSteps, serviceMutationMayHaveRun: true });
    await writeLegacyStartupState(plan, { state: "STARTED_NOT_ACCEPTED", startedAt, completedAt,
      currentStep: null, completedSteps, acceptanceClaimed: false, automaticRollbackAttempted: false });
    return { schemaVersion: 1, status: state.status, releaseId: plan.releaseId,
      authorizationReference: plan.authorizationReference };
  } catch (error) {
    const failedStep = error instanceof ProductStartStepError ? error.step : attemptedStep ?? "INITIALIZE";
    const failedAt = dependencies.now(); const serviceMutationMayHaveRun = completedSteps.some(isServiceMutation) ||
      isServiceMutation(failedStep);
    await writeProductState(plan, { status: "PRODUCT_START_FAILED_REQUIRES_REVIEW", startedAt,
      failedAt, currentStep: null, completedSteps, failedStep,
      failureCode: error instanceof ProductStartStepError ? error.failureCode : "INTERNAL_FAILURE",
      serviceMutationMayHaveRun });
    await writeLegacyStartupState(plan, { state: "START_FAILED_REQUIRES_REVIEW", startedAt,
      failedAt, currentStep: null, completedSteps, failedStep,
      failureCode: error instanceof ProductStartStepError ? error.failureCode : "INTERNAL_FAILURE",
      databaseMigrationMayHaveRun: true, acceptanceClaimed: false, automaticRollbackAttempted: false });
    if (error instanceof ProductStartStepError) throw new Error(`STAGING_PRODUCT_START_STEP_FAILED:${error.step}`);
    throw error;
  } finally { await rm(lockPath, { force: true }); }
}

async function verifiedMigrationState(base) {
  const path = join(base.rootDirectory, "migration-provision-state.json"); const raw = await safeFile(path);
  const value = parseJson(raw, "STAGING_PRODUCT_START_MIGRATION_STATE_INVALID");
  const expectedAuthorization = base.firstStartAuthorization.phases.find(
    ({ authorizationKind }) => authorizationKind === "MIGRATION_PROVISION")?.authorizationReference;
  if (value?.schemaVersion !== 1 || value?.product !== "company-os" ||
      value?.phase !== "MIGRATION_PROVISION" || value?.status !== "MIGRATION_PROVISION_COMPLETE_NOT_STARTED" ||
      value?.releaseId !== base.releaseId || value?.sourceRevision !== base.sourceRevision ||
      value?.dependencyManifestDigest !== base.dependencyManifestDigest ||
      value?.authorizationReference !== expectedAuthorization || value?.databaseMigrationMayHaveRun !== true ||
      value?.automaticRollbackAttempted !== false) {
    throw new Error("STAGING_PRODUCT_START_MIGRATION_STATE_INVALID");
  }
  return { stateDigest: sha256(raw) };
}

async function rejectExistingProductState(rootDirectory) {
  try { await safeFile(join(rootDirectory, PRODUCT_STATE)); throw new Error("STAGING_PRODUCT_START_REVIEW_REQUIRED"); }
  catch (error) { if (!isCode(error, "ENOENT")) throw error; }
}

async function safeFile(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o077) !== 0 || metadata.size < 2 || metadata.size > 1_048_576) {
    throw new Error("STAGING_PRODUCT_START_STATE_FILE_UNSAFE");
  }
  return readFile(path);
}

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
    return response.ok; } catch { return false; }
}

async function writeProductState(plan, details) {
  return writeAtomic(join(plan.rootDirectory, PRODUCT_STATE), { schemaVersion: 1, product: "company-os",
    phase: plan.phase, releaseId: plan.releaseId, releaseVersion: plan.releaseVersion,
    sourceRevision: plan.sourceRevision, dependencyManifestDigest: plan.dependencyManifestDigest,
    migrationStateDigest: plan.migrationStateDigest, authorizationReference: plan.authorizationReference,
    acceptanceClaimed: false, automaticRollbackAttempted: false, ...details });
}

async function writeLegacyStartupState(plan, details) {
  return writeAtomic(join(plan.rootDirectory, STARTUP_STATE), { schemaVersion: 1, product: "company-os",
    releaseId: plan.releaseId, releaseVersion: plan.releaseVersion, sourceRevision: plan.sourceRevision,
    dependencyManifestDigest: plan.dependencyManifestDigest,
    authorizationReference: plan.authorizationReference, ...details });
}

async function writeAtomic(final, value) {
  const partial = `${final}.partial-${process.pid}-${Date.now()}`;
  try { await writeFile(partial, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(partial, final); } finally { await rm(partial, { force: true }); }
  return value;
}

function exactPort(value) {
  const port = Number(value); if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error("STAGING_PRODUCT_START_LOOPBACK_PORT_INVALID");
  }
  return port;
}
function command(id, argv) { return { id, kind: "COMMAND", argv }; }
function probe(id, url) { return { id, kind: "PROBE", url }; }
function isServiceMutation(value) { return ["START_REFERENCE_DATA_NODE", "START_API", "START_WEB"].includes(value); }
function parseJson(value, code) { try { return JSON.parse(value.toString("utf8")); } catch { throw new Error(code); } }
function sha256(value) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function isCode(error, code) { return error instanceof Error && "code" in error && error.code === code; }

class ProductStartStepError extends Error {
  constructor(step, failureCode) { super(failureCode); this.step = step; this.failureCode = failureCode; }
}

function argumentsFrom(values) {
  const result = { rootDirectory: "/srv/company-os/staging",
    environmentFile: "/srv/company-os/staging/staging.env",
    dependencyManifestFile: "/srv/company-os/staging/staging-dependencies.json",
    secretDirectory: "/etc/company-os/secrets", releaseId: undefined,
    authorizationReference: undefined, apply: false };
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (flag === "--apply") result.apply = true;
    else if (flag === "--root") result.rootDirectory = values[++index];
    else if (flag === "--release") result.releaseId = values[++index];
    else if (flag === "--authorization") result.authorizationReference = values[++index];
    else if (flag === "--public-env-file") result.environmentFile = values[++index];
    else if (flag === "--dependency-manifest") result.dependencyManifestFile = values[++index];
    else if (flag === "--secret-directory") result.secretDirectory = values[++index];
    else throw new Error("STAGING_PRODUCT_START_ARGUMENT_INVALID");
  }
  return result;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const options = argumentsFrom(process.argv.slice(2));
  const result = options.apply ? await runStagingProductStart(options) : await planStagingProductStart(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
