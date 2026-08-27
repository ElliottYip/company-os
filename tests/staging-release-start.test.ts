import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createStagingReleaseBundle } from "../scripts/create-staging-release-bundle.mjs";
import { adoptStagingSiteContract, installStagingReleaseBundle } from
  "../scripts/install-staging-release-bundle.mjs";
import {
  planStagingReleaseStart,
  startStagingRelease,
} from "../scripts/start-staging-release.mjs";
import { planStagingMigrationProvision, runStagingMigrationProvision } from
  "../scripts/run-staging-migration-phase.mjs";
import { planStagingProductStart, runStagingProductStart } from
  "../scripts/run-staging-product-start-phase.mjs";
import { bindStagingAcceptanceHandoff, planStagingAcceptanceHandoff } from
  "../scripts/run-staging-acceptance-phase.mjs";
import { siteRuntimeFixture } from "./fixtures/site-runtime-fixture.ts";

const image = (name: string, digest = "a") => `ghcr.io/example/${name}@sha256:${digest.repeat(64)}`;
const release = { schemaVersion: 1, product: "company-os", releaseVersion: "0.1.0-rc.1",
  sourceRevision: "b".repeat(40), images: { api: image("api"), web: image("web", "c"),
    ops: image("ops", "d"), codexAgentNode: image("codex", "e"), vaultSecretBroker: image("vault", "f"),
    referenceDataNode: image("data", "1") } };

async function fixture(prefix: string, authorized = true) {
  const temporary = await mkdtemp(join(tmpdir(), prefix));
  const source = join(temporary, "source"); const root = join(temporary, "target");
  const releasePath = join(temporary, "release.json");
  await writeFile(releasePath, `${JSON.stringify(release)}\n`);
  await createStagingReleaseBundle({ root: new URL("../", import.meta.url).pathname,
    releaseManifestPath: releasePath, outputDirectory: source });
  await import("node:fs/promises").then(({ mkdir }) => mkdir(root, { mode: 0o750 }));
  const installed = await installStagingReleaseBundle({ bundleDirectory: source, rootDirectory: root });
  const environmentFile = join(root, "staging.env"); const secretDirectory = join(root, "synthetic-secrets");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(secretDirectory, { mode: 0o700 }));
  const artifacts = siteRuntimeFixture({ root, releaseId: installed.releaseId, images: release.images,
    authorization: authorized ? {
      dependencyInitialization: "change:dependency-init-test-01",
      migrationProvision: "change:migration-test-01",
      productStart: "change:product-start-test-01",
      acceptance: "change:acceptance-test-01",
    } : undefined });
  const publicEnvironment = artifacts.publicEnvironment.replace(
    `COMPANY_OS_SECRET_DIRECTORY=${artifacts.productSecretDirectory}`,
    `COMPANY_OS_SECRET_DIRECTORY=${secretDirectory}`);
  await writeFile(environmentFile, publicEnvironment, { mode: 0o600 });
  const dependencyManifestFile = join(root, "staging-dependencies.json");
  const siteRuntimeFile = join(root, "site-runtime.input.json");
  const dependencySecretMetadataFile = join(root, "dependency-secrets.input.json");
  await writeFile(dependencyManifestFile, `${JSON.stringify(artifacts.dependencyManifest)}\n`, { mode: 0o600 });
  await writeFile(siteRuntimeFile, `${JSON.stringify(artifacts.site)}\n`, { mode: 0o600 });
  await writeFile(dependencySecretMetadataFile,
    `${JSON.stringify(artifacts.dependencySecretMetadata)}\n`, { mode: 0o600 });
  const adopted = await adoptStagingSiteContract({ rootDirectory: root, releaseId: installed.releaseId,
    productSecretDirectory: secretDirectory, siteRuntimeFile, publicEnvironmentFile: environmentFile,
    dependencyManifestFile, dependencySecretMetadataFile });
  return { temporary, root,
    environmentFile: join(adopted.contractDirectory, "staging.env"),
    dependencyManifestFile: join(adopted.contractDirectory, "staging-dependencies.json"), secretDirectory,
    releaseId: installed.releaseId };
}

const input = (value: Awaited<ReturnType<typeof fixture>>) => ({
  rootDirectory: value.root,
  releaseId: value.releaseId,
  authorizationReference: "change:staging-acceptance-2026-08-26",
  environmentFile: value.environmentFile,
  dependencyManifestFile: value.dependencyManifestFile,
  secretDirectory: value.secretDirectory,
});

const migrationInput = (value: Awaited<ReturnType<typeof fixture>>) => ({ ...input(value),
  authorizationReference: "change:migration-test-01" });

async function writeDependencyReadyEvidence(value: Awaited<ReturnType<typeof fixture>>) {
  const directory = join(value.root, "dependency-runtime", "candidates", value.releaseId, "post-bootstrap");
  await mkdir(directory, { recursive: true, mode: 0o750 });
  const evidence = { schemaVersion: 1, product: "company-os",
    status: "POST_BOOTSTRAP_CONFIGURATION_MATERIALIZED_NOT_STARTED",
    siteId: "company-os-test-site", releaseId: value.releaseId,
    authorizationReference: "change:dependency-init-test-01", pendingConsumers: [],
    runtimeObjectsCreated: false };
  const raw = `${JSON.stringify(evidence, null, 2)}\n`;
  await writeFile(join(directory, "materialization-evidence.json"), raw, { mode: 0o600 });
  const digest = `sha256:${createHash("sha256").update(raw).digest("hex")}`;
  const state = { schemaVersion: 1, product: "company-os",
    status: "DEPENDENCIES_READY_NOT_PRODUCT_MIGRATED", siteId: "company-os-test-site",
    releaseId: value.releaseId, authorizationReference: "change:dependency-init-test-01",
    postBootstrapEvidenceDigest: digest, runtimeObjectsCreated: true, tlsAndHealthVerified: true };
  await writeFile(join(value.root, "dependency-runtime-state.json"),
    `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

async function completeMigration(value: Awaited<ReturnType<typeof fixture>>) {
  await writeDependencyReadyEvidence(value);
  await runStagingMigrationProvision(migrationInput(value), {
    now: () => "2026-08-27T12:00:00.000Z", runCommand: async () => ({ ok: true }),
  });
}

test("staging start defaults to a non-mutating plan bound to one prepared release and authorization", async (context) => {
  const value = await fixture("company-os-staging-start-plan-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  const plan = await planStagingReleaseStart(input(value));
  assert.equal(plan.status, "PLANNED_NOT_APPLIED");
  assert.equal(plan.releaseId, value.releaseId);
  assert.equal(plan.authorizationReference, "change:staging-acceptance-2026-08-26");
  assert.equal(plan.firstStartAuthorization.status, "READY_TO_APPLY_BY_PHASE");
  assert.equal(plan.firstStartAuthorization.phases.length, 11);
  assert.deepEqual(plan.steps.map(({ id }) => id), [
    "VALIDATE_DEPENDENCIES", "DOCTOR", "COMPOSE_CONFIG", "PULL_IMAGES", "MIGRATE", "PROVISION_RUNTIME_ROLE",
    "START_DATA_NODE", "START_API", "API_READY", "START_WEB", "WEB_SMOKE", "API_SMOKE",
  ]);
  await assert.rejects(readFile(join(value.root, "startup-state.json")), /ENOENT/);
});

test("staging start cannot use one operation ticket to replace missing phase authority", async (context) => {
  const value = await fixture("company-os-staging-start-phase-auth-", false);
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  await assert.rejects(planStagingReleaseStart(input(value)),
    /STAGING_START_PHASE_AUTHORIZATION_MISSING:DEPENDENCY_INITIALIZATION,MIGRATION_PROVISION,PRODUCT_START,ACCEPTANCE/);
});

test("authorized staging start runs the ordered path and records started-not-accepted without command output", async (context) => {
  const value = await fixture("company-os-staging-start-success-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  const calls: string[] = [];
  const result = await startStagingRelease(input(value), {
    now: () => "2026-08-26T16:00:00.000Z",
    runCommand: async ({ id }) => { calls.push(id); return { ok: true }; },
    probe: async ({ id }) => { calls.push(id); return true; },
    wait: async () => undefined,
  });
  assert.equal(result.status, "STARTED_NOT_ACCEPTED");
  assert.deepEqual(calls, ["VALIDATE_DEPENDENCIES", "DOCTOR", "COMPOSE_CONFIG", "PULL_IMAGES", "MIGRATE",
    "PROVISION_RUNTIME_ROLE", "START_DATA_NODE", "START_API", "API_READY", "START_WEB", "WEB_SMOKE", "API_SMOKE"]);
  const state = JSON.parse(await readFile(join(value.root, "startup-state.json"), "utf8"));
  assert.equal(state.state, "STARTED_NOT_ACCEPTED");
  assert.equal(state.automaticRollbackAttempted, false);
  assert.equal(state.acceptanceClaimed, false);
  assert.deepEqual(state.phaseAuthorizationReferences, {
    DEPENDENCY_INITIALIZATION: "change:dependency-init-test-01",
    MIGRATION_PROVISION: "change:migration-test-01",
    PRODUCT_START: "change:product-start-test-01",
    ACCEPTANCE: "change:acceptance-test-01",
  });
  assert.doesNotMatch(JSON.stringify(state), /stdout|stderr|client.?secret|bearer.?token|database.?url/i);
});

test("a migration-stage failure is retained for review and never triggers automatic rollback", async (context) => {
  const value = await fixture("company-os-staging-start-failure-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  const calls: string[] = [];
  await assert.rejects(startStagingRelease(input(value), {
    now: () => "2026-08-26T16:00:00.000Z",
    runCommand: async ({ id }) => { calls.push(id); return { ok: id !== "MIGRATE", code: "EXIT_17" }; },
    probe: async () => true,
    wait: async () => undefined,
  }), /STAGING_START_STEP_FAILED:MIGRATE/);
  const state = JSON.parse(await readFile(join(value.root, "startup-state.json"), "utf8"));
  assert.equal(state.state, "START_FAILED_REQUIRES_REVIEW");
  assert.equal(state.failedStep, "MIGRATE");
  assert.equal(state.failureCode, "COMMAND_FAILED");
  assert.equal(state.databaseMigrationMayHaveRun, true);
  assert.equal(state.automaticRollbackAttempted, false);
  assert.deepEqual(calls, ["VALIDATE_DEPENDENCIES", "DOCTOR", "COMPOSE_CONFIG", "PULL_IMAGES", "MIGRATE"]);
  await assert.rejects(startStagingRelease(input(value), {
    runCommand: async () => ({ ok: true }), probe: async () => true, wait: async () => undefined,
  }), /STAGING_START_REVIEW_REQUIRED/);
});

test("staging start refuses concurrent writers and release-image drift", async (context) => {
  const value = await fixture("company-os-staging-start-guard-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  await writeFile(join(value.root, ".staging-lifecycle.lock"), "occupied\n", { mode: 0o600 });
  await assert.rejects(startStagingRelease(input(value), {
    runCommand: async () => ({ ok: true }), probe: async () => true, wait: async () => undefined,
  }), /STAGING_START_ALREADY_RUNNING/);
  await rm(join(value.root, ".staging-lifecycle.lock"));
  const source = await readFile(value.environmentFile, "utf8");
  await writeFile(value.environmentFile, source.replace(release.images.api, image("different", "9")));
  await assert.rejects(planStagingReleaseStart(input(value)), /STAGING_START_SITE_CONTRACT_CHANGED/);
  await writeFile(value.environmentFile, source.replace(
    `COMPANY_OS_SECRET_DIRECTORY=${value.secretDirectory}`,
    `COMPANY_OS_SECRET_DIRECTORY=${join(value.root, "different-secrets")}`,
  ));
  await assert.rejects(planStagingReleaseStart(input(value)), /STAGING_START_SITE_CONTRACT_CHANGED/);
});

test("migration/provision phase is independently authorized and dependency-evidence bound", async (context) => {
  const value = await fixture("company-os-staging-migration-plan-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  await writeDependencyReadyEvidence(value);
  const plan = await planStagingMigrationProvision(migrationInput(value));
  assert.equal(plan.phase, "MIGRATION_PROVISION");
  assert.equal(plan.authorizationReference, "change:migration-test-01");
  assert.deepEqual(plan.steps.map(({ id }) => id), ["DOCTOR_PRODUCT", "COMPOSE_CONFIG",
    "PULL_MIGRATION_IMAGE", "MIGRATE_DATABASE", "PROVISION_RUNTIME_ROLE"]);
  await assert.rejects(planStagingMigrationProvision({ ...migrationInput(value),
    authorizationReference: "change:product-start-test-01" }), /STAGING_MIGRATION_AUTHORIZATION_MISMATCH/);
});

test("migration/provision phase records completion without starting product services", async (context) => {
  const value = await fixture("company-os-staging-migration-run-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  await writeDependencyReadyEvidence(value);
  const calls: string[] = [];
  const result = await runStagingMigrationProvision(migrationInput(value), {
    now: () => "2026-08-27T12:00:00.000Z",
    runCommand: async ({ id }) => { calls.push(id); return { ok: true }; },
  });
  assert.equal(result.status, "MIGRATION_PROVISION_COMPLETE_NOT_STARTED");
  assert.deepEqual(calls, ["DOCTOR_PRODUCT", "COMPOSE_CONFIG", "PULL_MIGRATION_IMAGE",
    "MIGRATE_DATABASE", "PROVISION_RUNTIME_ROLE"]);
  const state = JSON.parse(await readFile(join(value.root, "migration-provision-state.json"), "utf8"));
  assert.equal(state.status, "MIGRATION_PROVISION_COMPLETE_NOT_STARTED");
  assert.equal(state.databaseMigrationMayHaveRun, true);
  assert.equal(state.automaticRollbackAttempted, false);
  assert.doesNotMatch(JSON.stringify(state), /stdout|stderr|password|bearer|database.?url/i);
});

test("migration failure is retained and never automatically retried or rolled back", async (context) => {
  const value = await fixture("company-os-staging-migration-fail-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  await writeDependencyReadyEvidence(value);
  await assert.rejects(runStagingMigrationProvision(migrationInput(value), {
    now: () => "2026-08-27T12:00:00.000Z",
    runCommand: async ({ id }) => ({ ok: id !== "MIGRATE_DATABASE" }),
  }), /STAGING_MIGRATION_STEP_FAILED:MIGRATE_DATABASE/);
  const state = JSON.parse(await readFile(join(value.root, "migration-provision-state.json"), "utf8"));
  assert.equal(state.status, "MIGRATION_PROVISION_FAILED_REQUIRES_REVIEW");
  assert.equal(state.databaseMigrationMayHaveRun, true);
  assert.equal(state.automaticRollbackAttempted, false);
  await assert.rejects(planStagingMigrationProvision(migrationInput(value)),
    /STAGING_MIGRATION_REVIEW_REQUIRED/);
});

test("product start is separately authorized and uses each site's declared loopback ports", async (context) => {
  const value = await fixture("company-os-staging-product-plan-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  await completeMigration(value);
  const plan = await planStagingProductStart({ ...input(value),
    authorizationReference: "change:product-start-test-01" });
  assert.equal(plan.phase, "PRODUCT_START");
  assert.deepEqual(plan.steps.map(({ id }) => id), ["PULL_PRODUCT_IMAGES", "START_REFERENCE_DATA_NODE",
    "START_API", "API_READY", "START_WEB", "WEB_SMOKE", "API_SMOKE"]);
  assert.equal(plan.steps.find(({ id }) => id === "API_READY")?.url, "http://127.0.0.1:4601/ready");
  assert.equal(plan.steps.find(({ id }) => id === "WEB_SMOKE")?.url, "http://127.0.0.1:4600/");
  await assert.rejects(planStagingProductStart({ ...input(value),
    authorizationReference: "change:migration-test-01" }), /STAGING_PRODUCT_START_AUTHORIZATION_MISMATCH/);
});

test("product start records restart-compatible started-not-accepted evidence", async (context) => {
  const value = await fixture("company-os-staging-product-run-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  await completeMigration(value);
  const calls: string[] = [];
  const result = await runStagingProductStart({ ...input(value),
    authorizationReference: "change:product-start-test-01" }, {
    now: () => "2026-08-27T12:05:00.000Z",
    runCommand: async ({ id }) => { calls.push(id); return { ok: true }; },
    probe: async ({ id }) => { calls.push(id); return true; }, wait: async () => undefined,
  });
  assert.equal(result.status, "STARTED_NOT_ACCEPTED");
  assert.deepEqual(calls, ["PULL_PRODUCT_IMAGES", "START_REFERENCE_DATA_NODE", "START_API",
    "API_READY", "START_WEB", "WEB_SMOKE", "API_SMOKE"]);
  const product = JSON.parse(await readFile(join(value.root, "product-start-state.json"), "utf8"));
  const legacy = JSON.parse(await readFile(join(value.root, "startup-state.json"), "utf8"));
  assert.equal(product.status, "STARTED_NOT_ACCEPTED");
  assert.equal(product.acceptanceClaimed, false);
  assert.equal(legacy.state, "STARTED_NOT_ACCEPTED");
  assert.equal(legacy.acceptanceClaimed, false);
  assert.doesNotMatch(JSON.stringify({ product, legacy }), /stdout|stderr|password|bearer|database.?url/i);
});

test("product start failure retains possible service mutation without automatic rollback", async (context) => {
  const value = await fixture("company-os-staging-product-fail-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  await completeMigration(value);
  await assert.rejects(runStagingProductStart({ ...input(value),
    authorizationReference: "change:product-start-test-01" }, {
    now: () => "2026-08-27T12:05:00.000Z",
    runCommand: async ({ id }) => ({ ok: id !== "START_API" }),
    probe: async () => true, wait: async () => undefined,
  }), /STAGING_PRODUCT_START_STEP_FAILED:START_API/);
  const state = JSON.parse(await readFile(join(value.root, "product-start-state.json"), "utf8"));
  const legacy = JSON.parse(await readFile(join(value.root, "startup-state.json"), "utf8"));
  assert.equal(state.status, "PRODUCT_START_FAILED_REQUIRES_REVIEW");
  assert.equal(state.serviceMutationMayHaveRun, true);
  assert.equal(state.automaticRollbackAttempted, false);
  assert.equal(legacy.state, "START_FAILED_REQUIRES_REVIEW");
  await assert.rejects(planStagingProductStart({ ...input(value),
    authorizationReference: "change:product-start-test-01" }), /STAGING_START_REVIEW_REQUIRED/);
});

test("acceptance handoff binds externally owned evidence without claiming customer acceptance",
  async (context) => {
    const value = await fixture("company-os-staging-acceptance-handoff-");
    context.after(() => rm(value.temporary, { recursive: true, force: true }));
    await completeMigration(value);
    await runStagingProductStart({ ...input(value), authorizationReference: "change:product-start-test-01" }, {
      now: () => "2026-08-27T12:05:00.000Z", runCommand: async () => ({ ok: true }),
      probe: async () => true, wait: async () => undefined,
    });
    const manifestRaw = await readFile(join(value.root, "releases", value.releaseId, "release-manifest.json"));
    const manifestDigest = `sha256:${createHash("sha256").update(manifestRaw).digest("hex")}`;
    const digest = (character: string) => `sha256:${character.repeat(64)}`;
    const stagingKeys = ["boundaryPreflight", "browserIdentity", "responsibilityContract", "agentExecution",
      "modelExecution", "dataBoundary", "secretLifecycle", "idempotency", "restartRecovery"];
    const record = { schemaVersion: 2, recordId: "acceptance-handoff-test", scope: "CUSTOMER_STAGING",
      release: { version: release.releaseVersion, sourceRevision: release.sourceRevision, manifestDigest },
      owners: { acceptance: "human-acceptance", identity: "human-identity", agentRuntime: "human-agent",
        modelGovernance: "human-model", dataGovernance: "human-data", secretManagement: "human-secret",
        backupRecovery: "human-backup", incidentResponse: "human-incident" },
      stagingEvidence: Object.fromEntries(stagingKeys.map((key, index) => [key, digest(String(index + 1))])),
      productionEvidence: null, approvedAt: "2026-08-27T12:10:00.000Z", approvalEvidenceDigest: digest("f") };
    const recordFile = join(value.temporary, "acceptance-record.json");
    await writeFile(recordFile, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    const acceptanceInput = { rootDirectory: value.root, releaseId: value.releaseId,
      authorizationReference: "change:acceptance-test-01", recordFile };
    const plan = await planStagingAcceptanceHandoff(acceptanceInput);
    assert.equal(plan.status, "PLANNED_NOT_APPLIED"); assert.equal(plan.completion.acceptanceClaimed, false);
    assert.equal(plan.completion.externalEvidenceRequired, true);
    const result = await bindStagingAcceptanceHandoff(acceptanceInput,
      { now: () => "2026-08-27T12:11:00.000Z" });
    assert.equal(result.status, "ACCEPTANCE_RECORD_BOUND_PENDING_EXTERNAL_VERIFICATION");
    const state = JSON.parse(await readFile(join(value.root, "acceptance-handoff-state.json"), "utf8"));
    assert.equal(state.acceptanceClaimed, false); assert.equal(state.independentlyVerified, false);
    assert.equal(state.externalEvidenceRequired, true);
    assert.doesNotMatch(JSON.stringify(state), /human-identity|browserIdentity|customer\.example/);
  });
