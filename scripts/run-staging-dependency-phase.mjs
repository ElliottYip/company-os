import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { inspectOciImageUsers } from "./inspect-oci-image-users.mjs";
import { materializePostBootstrapDependencyConfiguration, materializeStagingDependencyConfiguration,
  planStagingDependencyInitialization } from "./initialize-staging-dependencies.mjs";

const LOCK = ".staging-lifecycle.lock";
const STATE = "dependency-runtime-state.json";

export async function planStagingDependencyPhase(input) {
  const base = await planStagingDependencyInitialization(input);
  if (input.authorizationReference !== base.authorizationReference) {
    throw new Error("STAGING_DEPENDENCY_INITIALIZATION_AUTHORIZATION_MISMATCH");
  }
  await rejectExistingState(base.rootDirectory);
  const composeFile = join(base.rootDirectory, "releases", base.releaseId,
    "compose.staging-dependencies.yml");
  const preCompose = compose(base.candidateRoot, composeFile);
  const postRoot = join(base.candidateRoot, "post-bootstrap");
  const postCompose = compose(postRoot, composeFile);
  const steps = [
    operation("PULL_DEPENDENCY_IMAGES", "PULL_IMAGES"),
    operation("INSPECT_IMMUTABLE_IMAGE_USERS", "INSPECT_IMAGE_USERS"),
    operation("MATERIALIZE_PRE_BOOTSTRAP", "MATERIALIZE_PRE"),
    command("COMPOSE_CONFIG_PRE_BOOTSTRAP", [...preCompose, "config", "--quiet"]),
    command("CREATE_PRODUCT_NETWORK", ["docker", "network", "create", "--driver", "bridge",
      "--label", "com.company-os.lifecycle=site-owned", "--label", `com.company-os.site=${base.siteId}`,
      "--label", `com.company-os.release=${base.releaseId}`, base.productNetwork]),
    command("START_FOUNDATION_DEPENDENCIES", [...preCompose, "up", "-d", "--wait",
      "postgres", "oidc", "vault"]),
    command("BOOTSTRAP_VAULT_APPROLE", [...preCompose, "--profile", "operations", "run", "--rm",
      "--no-deps", "vault-bootstrap"]),
    operation("MATERIALIZE_POST_BOOTSTRAP", "MATERIALIZE_POST"),
    command("COMPOSE_CONFIG_POST_BOOTSTRAP", [...postCompose, "config", "--quiet"]),
    command("START_BROKER_AGENT_AND_TLS", [...postCompose, "up", "-d", "--wait",
      "vault-secret-broker", "codex-agent-node", "tls-gateway"]),
    command("VERIFY_DEPENDENCY_TLS_AND_HEALTH", [...postCompose, "--profile", "operations", "run", "--rm",
      "--no-deps", "dependency-verifier"]),
  ];
  return { schemaVersion: 1, product: "company-os", status: "PLANNED_NOT_APPLIED",
    phase: "DEPENDENCY_INITIALIZATION", siteId: base.siteId, releaseId: base.releaseId,
    authorizationReference: base.authorizationReference, rootDirectory: base.rootDirectory,
    candidateRoot: base.candidateRoot, dependencyImages: base.dependencyImages,
    imageUsersRequired: base.imageUsersRequired, steps };
}

export async function runStagingDependencyPhase(input, supplied = {}) {
  const plan = await planStagingDependencyPhase(input);
  const dependencies = { now: () => new Date().toISOString(), runCommand: defaultRunCommand,
    inspectImageUsers: inspectOciImageUsers,
    materializePre: (inspections) => materializeStagingDependencyConfiguration(input,
      { imageUserInspections: inspections }),
    materializePost: (inspections) => materializePostBootstrapDependencyConfiguration(input,
      { imageUserInspections: inspections }), ...supplied };
  const lockPath = join(plan.rootDirectory, LOCK);
  try { await writeFile(lockPath, `${plan.releaseId}:DEPENDENCY_INITIALIZATION\n`, { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (isCode(error, "EEXIST")) throw new Error("STAGING_DEPENDENCY_ALREADY_RUNNING");
    throw error;
  }
  const startedAt = dependencies.now(); const completedSteps = []; let attemptedStep = null;
  let inspections = null;
  try {
    await writeState(plan, { status: "DEPENDENCY_INITIALIZATION_RUNNING", startedAt,
      currentStep: plan.steps[0].id, completedSteps, runtimeObjectsMayExist: false,
      vaultInitializationMayHaveRun: false });
    for (const step of plan.steps) {
      attemptedStep = step.id;
      await writeState(plan, { status: "DEPENDENCY_INITIALIZATION_RUNNING", startedAt,
        currentStep: step.id, completedSteps, runtimeObjectsMayExist: mutationMayHaveRun(completedSteps, step.id),
        vaultInitializationMayHaveRun: vaultMayHaveRun(completedSteps, step.id) });
      if (step.operation === "PULL_IMAGES") {
        for (const image of plan.dependencyImages) {
          if (!(await dependencies.runCommand(command(step.id, ["docker", "image", "pull", image]))).ok) {
            throw new DependencyStepError(step.id, "COMMAND_FAILED");
          }
        }
      } else if (step.operation === "INSPECT_IMAGE_USERS") {
        inspections = await dependencies.inspectImageUsers(plan.imageUsersRequired);
      } else if (step.operation === "MATERIALIZE_PRE") {
        if (!inspections) throw new DependencyStepError(step.id, "IMAGE_INSPECTION_MISSING");
        await dependencies.materializePre(inspections);
      } else if (step.operation === "MATERIALIZE_POST") {
        if (!inspections) throw new DependencyStepError(step.id, "IMAGE_INSPECTION_MISSING");
        await dependencies.materializePost(inspections);
      } else if (!(await dependencies.runCommand(step)).ok) {
        throw new DependencyStepError(step.id, "COMMAND_FAILED");
      }
      completedSteps.push(step.id);
    }
    const evidence = await postBootstrapEvidence(plan);
    const state = await writeState(plan, { status: "DEPENDENCIES_READY_NOT_PRODUCT_MIGRATED", startedAt,
      completedAt: dependencies.now(), currentStep: null, completedSteps, runtimeObjectsCreated: true,
      runtimeObjectsMayExist: true, vaultInitializationMayHaveRun: true, tlsAndHealthVerified: true,
      postBootstrapEvidenceDigest: evidence.digest });
    return { schemaVersion: 1, status: state.status, siteId: plan.siteId, releaseId: plan.releaseId,
      authorizationReference: plan.authorizationReference };
  } catch (error) {
    const failedStep = error instanceof DependencyStepError ? error.step : attemptedStep ?? "INITIALIZE";
    await writeState(plan, { status: "DEPENDENCY_INITIALIZATION_FAILED_REQUIRES_REVIEW", startedAt,
      failedAt: dependencies.now(), currentStep: null, completedSteps, failedStep,
      failureCode: error instanceof DependencyStepError ? error.failureCode : "INTERNAL_FAILURE",
      runtimeObjectsMayExist: mutationMayHaveRun(completedSteps, failedStep),
      vaultInitializationMayHaveRun: vaultMayHaveRun(completedSteps, failedStep),
      automaticCleanupAttempted: false, automaticRollbackAttempted: false });
    if (error instanceof DependencyStepError) {
      throw new Error(`STAGING_DEPENDENCY_STEP_FAILED:${error.step}`);
    }
    throw error;
  } finally { await rm(lockPath, { force: true }); }
}

function compose(candidateRoot, composeFile) {
  return ["docker", "compose", "--env-file", join(candidateRoot, "dependencies.env"), "-f", composeFile];
}

async function postBootstrapEvidence(plan) {
  const path = join(plan.candidateRoot, "post-bootstrap", "materialization-evidence.json");
  const raw = await safeFile(path); let value;
  try { value = JSON.parse(raw.toString("utf8")); } catch {
    throw new Error("STAGING_DEPENDENCY_POST_BOOTSTRAP_EVIDENCE_INVALID");
  }
  if (value?.status !== "POST_BOOTSTRAP_CONFIGURATION_MATERIALIZED_NOT_STARTED" ||
      value?.siteId !== plan.siteId || value?.releaseId !== plan.releaseId ||
      value?.authorizationReference !== plan.authorizationReference || value?.runtimeObjectsCreated !== false ||
      JSON.stringify(value?.pendingConsumers) !== "[]") {
    throw new Error("STAGING_DEPENDENCY_POST_BOOTSTRAP_EVIDENCE_INVALID");
  }
  return { digest: sha256(raw) };
}

async function rejectExistingState(rootDirectory) {
  try { await safeFile(join(rootDirectory, STATE)); throw new Error("STAGING_DEPENDENCY_REVIEW_REQUIRED"); }
  catch (error) { if (!isCode(error, "ENOENT")) throw error; }
}

async function safeFile(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o077) !== 0 || metadata.size < 2 || metadata.size > 1_048_576) {
    throw new Error("STAGING_DEPENDENCY_STATE_FILE_UNSAFE");
  }
  return readFile(path);
}

async function writeState(plan, details) {
  const value = { schemaVersion: 1, product: "company-os", phase: plan.phase, siteId: plan.siteId,
    releaseId: plan.releaseId, authorizationReference: plan.authorizationReference,
    automaticRollbackAttempted: false, ...details };
  const final = join(plan.rootDirectory, STATE);
  const partial = join(plan.rootDirectory, `.${STATE}.partial-${process.pid}-${Date.now()}`);
  try { await writeFile(partial, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(partial, final); } finally { await rm(partial, { force: true }); }
  return value;
}

function mutationMayHaveRun(completedSteps, current) {
  return [...completedSteps, current].some((id) => ["CREATE_PRODUCT_NETWORK", "START_FOUNDATION_DEPENDENCIES",
    "BOOTSTRAP_VAULT_APPROLE", "START_BROKER_AGENT_AND_TLS"].includes(id));
}
function vaultMayHaveRun(completedSteps, current) {
  return [...completedSteps, current].includes("BOOTSTRAP_VAULT_APPROLE");
}
function command(id, argv) { return { id, kind: "COMMAND", argv }; }
function operation(id, operation) { return { id, kind: "OPERATION", operation }; }
function sha256(value) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function isCode(error, code) { return error instanceof Error && "code" in error && error.code === code; }
function defaultRunCommand(step) {
  const result = spawnSync(step.argv[0], step.argv.slice(1), { stdio: "inherit", timeout: 600_000 });
  return Promise.resolve({ ok: result.status === 0 });
}

class DependencyStepError extends Error {
  constructor(step, failureCode) { super(failureCode); this.step = step; this.failureCode = failureCode; }
}

function argumentsFrom(values) {
  const result = { rootDirectory: "/srv/company-os/staging", releaseId: undefined,
    authorizationReference: undefined, apply: false };
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (flag === "--apply") result.apply = true;
    else if (flag === "--root") result.rootDirectory = values[++index];
    else if (flag === "--release") result.releaseId = values[++index];
    else if (flag === "--authorization") result.authorizationReference = values[++index];
    else throw new Error("STAGING_DEPENDENCY_ARGUMENT_INVALID");
  }
  return result;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const options = argumentsFrom(process.argv.slice(2));
  const result = options.apply ? await runStagingDependencyPhase(options) : await planStagingDependencyPhase(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
