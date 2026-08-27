import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { planStagingReleaseStart } from "./start-staging-release.mjs";

const LOCK = ".staging-lifecycle.lock";
const STATE = "migration-provision-state.json";

export async function planStagingMigrationProvision(input) {
  const base = await planStagingReleaseStart(input);
  const phase = base.firstStartAuthorization.phases.find(
    ({ authorizationKind }) => authorizationKind === "MIGRATION_PROVISION");
  if (!phase?.authorizationReference || input.authorizationReference !== phase.authorizationReference) {
    throw new Error("STAGING_MIGRATION_AUTHORIZATION_MISMATCH");
  }
  const dependency = await verifiedDependencyState(base.rootDirectory, base.releaseId,
    base.firstStartAuthorization);
  await rejectExistingState(base.rootDirectory);
  const compose = ["docker", "compose", "--env-file", input.environmentFile,
    "-f", join(base.rootDirectory, "releases", base.releaseId, "compose.staging.yml")];
  const steps = [
    command("DOCTOR_PRODUCT", ["node", "--experimental-strip-types",
      "scripts/staging-deployment-doctor.ts", "--root", base.rootDirectory,
      "--secret-directory", input.secretDirectory, "--public-env-file", input.environmentFile]),
    command("COMPOSE_CONFIG", [...compose, "config", "--quiet"]),
    command("PULL_MIGRATION_IMAGE", [...compose, "pull", "api"]),
    command("MIGRATE_DATABASE", [...compose, "run", "--rm", "--no-deps", "migrate"]),
    command("PROVISION_RUNTIME_ROLE", [...compose, "run", "--rm", "--no-deps", "provision-runtime"]),
  ];
  return { schemaVersion: 1, product: "company-os", status: "PLANNED_NOT_APPLIED",
    phase: "MIGRATION_PROVISION", releaseId: base.releaseId, releaseVersion: base.releaseVersion,
    sourceRevision: base.sourceRevision, dependencyManifestDigest: base.dependencyManifestDigest,
    dependencyStateDigest: dependency.stateDigest,
    postBootstrapEvidenceDigest: dependency.postBootstrapEvidenceDigest,
    authorizationReference: phase.authorizationReference, rootDirectory: base.rootDirectory, steps };
}

export async function runStagingMigrationProvision(input, supplied = {}) {
  const plan = await planStagingMigrationProvision(input);
  const runCommand = supplied.runCommand ?? defaultRunCommand;
  const now = supplied.now ?? (() => new Date().toISOString());
  const lockPath = join(plan.rootDirectory, LOCK);
  try { await writeFile(lockPath, `${plan.releaseId}:MIGRATION_PROVISION\n`, { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (isCode(error, "EEXIST")) throw new Error("STAGING_MIGRATION_ALREADY_RUNNING");
    throw error;
  }
  const startedAt = now(); const completedSteps = []; let attemptedStep = null;
  try {
    await writeState(plan, { status: "MIGRATION_PROVISION_RUNNING", startedAt,
      currentStep: plan.steps[0].id, completedSteps, databaseMigrationMayHaveRun: false });
    for (const step of plan.steps) {
      attemptedStep = step.id;
      await writeState(plan, { status: "MIGRATION_PROVISION_RUNNING", startedAt,
        currentStep: step.id, completedSteps, databaseMigrationMayHaveRun:
          completedSteps.includes("MIGRATE_DATABASE") });
      if (!(await runCommand(step)).ok) throw new MigrationStepError(step.id);
      completedSteps.push(step.id);
    }
    const state = await writeState(plan, { status: "MIGRATION_PROVISION_COMPLETE_NOT_STARTED",
      startedAt, completedAt: now(), currentStep: null, completedSteps,
      databaseMigrationMayHaveRun: true });
    return { schemaVersion: 1, status: state.status, releaseId: plan.releaseId,
      authorizationReference: plan.authorizationReference };
  } catch (error) {
    const failedStep = error instanceof MigrationStepError ? error.step : attemptedStep ?? "INITIALIZE";
    await writeState(plan, { status: "MIGRATION_PROVISION_FAILED_REQUIRES_REVIEW", startedAt,
      failedAt: now(), currentStep: null, completedSteps, failedStep,
      failureCode: error instanceof MigrationStepError ? "COMMAND_FAILED" : "INTERNAL_FAILURE",
      databaseMigrationMayHaveRun: completedSteps.includes("MIGRATE_DATABASE") ||
        attemptedStep === "MIGRATE_DATABASE" });
    if (error instanceof MigrationStepError) throw new Error(`STAGING_MIGRATION_STEP_FAILED:${error.step}`);
    throw error;
  } finally { await rm(lockPath, { force: true }); }
}

async function verifiedDependencyState(rootDirectory, releaseId, firstStartAuthorization) {
  const dependencyAuthorization = firstStartAuthorization.phases.find(
    ({ authorizationKind }) => authorizationKind === "DEPENDENCY_INITIALIZATION")?.authorizationReference;
  const evidencePath = join(rootDirectory, "dependency-runtime", "candidates", releaseId,
    "post-bootstrap", "materialization-evidence.json");
  const evidenceRaw = await safeFile(evidencePath); const evidence = parseJson(evidenceRaw,
    "STAGING_MIGRATION_DEPENDENCY_EVIDENCE_INVALID");
  if (evidence?.status !== "POST_BOOTSTRAP_CONFIGURATION_MATERIALIZED_NOT_STARTED" ||
      evidence?.releaseId !== releaseId || evidence?.runtimeObjectsCreated !== false ||
      JSON.stringify(evidence?.pendingConsumers) !== "[]") {
    throw new Error("STAGING_MIGRATION_DEPENDENCY_EVIDENCE_INVALID");
  }
  const postBootstrapEvidenceDigest = sha256(evidenceRaw);
  const stateRaw = await safeFile(join(rootDirectory, "dependency-runtime-state.json"));
  const state = parseJson(stateRaw, "STAGING_MIGRATION_DEPENDENCY_STATE_INVALID");
  if (state?.schemaVersion !== 1 || state?.product !== "company-os" ||
      state?.status !== "DEPENDENCIES_READY_NOT_PRODUCT_MIGRATED" || state?.releaseId !== releaseId ||
      state?.siteId !== evidence.siteId || state?.authorizationReference !== dependencyAuthorization ||
      state?.postBootstrapEvidenceDigest !== postBootstrapEvidenceDigest ||
      state?.runtimeObjectsCreated !== true || state?.tlsAndHealthVerified !== true) {
    throw new Error("STAGING_MIGRATION_DEPENDENCY_STATE_INVALID");
  }
  return { stateDigest: sha256(stateRaw), postBootstrapEvidenceDigest };
}

async function safeFile(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o077) !== 0 || metadata.size < 2 || metadata.size > 1_048_576) {
    throw new Error("STAGING_MIGRATION_EVIDENCE_FILE_UNSAFE");
  }
  return readFile(path);
}

function parseJson(value, code) { try { return JSON.parse(value.toString("utf8")); } catch { throw new Error(code); } }
function command(id, argv) { return { id, kind: "COMMAND", argv }; }
function sha256(value) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function isCode(error, code) { return error instanceof Error && "code" in error && error.code === code; }

async function rejectExistingState(rootDirectory) {
  try { await safeFile(join(rootDirectory, STATE)); throw new Error("STAGING_MIGRATION_REVIEW_REQUIRED"); }
  catch (error) { if (!isCode(error, "ENOENT")) throw error; }
}

async function writeState(plan, details) {
  const value = { schemaVersion: 1, product: "company-os", phase: plan.phase,
    releaseId: plan.releaseId, releaseVersion: plan.releaseVersion, sourceRevision: plan.sourceRevision,
    dependencyManifestDigest: plan.dependencyManifestDigest,
    dependencyStateDigest: plan.dependencyStateDigest,
    postBootstrapEvidenceDigest: plan.postBootstrapEvidenceDigest,
    authorizationReference: plan.authorizationReference, automaticRollbackAttempted: false, ...details };
  const final = join(plan.rootDirectory, STATE);
  const partial = join(plan.rootDirectory, `.${STATE}.partial-${process.pid}-${Date.now()}`);
  try { await writeFile(partial, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(partial, final); }
  finally { await rm(partial, { force: true }); }
  return value;
}

function defaultRunCommand(step) {
  const result = spawnSync(step.argv[0], step.argv.slice(1), { stdio: "inherit", timeout: 600_000 });
  return Promise.resolve({ ok: result.status === 0 });
}

class MigrationStepError extends Error {
  constructor(step) { super(step); this.step = step; }
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
    else throw new Error("STAGING_MIGRATION_ARGUMENT_INVALID");
  }
  return result;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const options = argumentsFrom(process.argv.slice(2));
  const result = options.apply ? await runStagingMigrationProvision(options) :
    await planStagingMigrationProvision(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
