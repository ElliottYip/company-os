import assert from "node:assert/strict";
import test from "node:test";

import { createReleaseCutoverPlan } from "../scripts/plan-release-cutover.mjs";

const image = (name: string, value: string) => `registry.example/${name}@sha256:${value.repeat(64)}`;
const migration = (name: string, value: string) => ({ name, digest: `sha256:${value.repeat(64)}` });
const manifest = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  product: "company-os",
  releaseVersion: "1.0.0",
  sourceRevision: "a".repeat(40),
  images: { api: image("api", "a"), web: image("web", "b"), ops: image("ops", "c"),
    codexAgentNode: image("codex-agent-node", "9"), vaultSecretBroker: image("vault-secret-broker", "7"),
    referenceDataNode: image("reference-data-node", "5") },
  contracts: { formalApi: "v1", connectorEnvelope: "1.0", agentNode: "1.0", dataNode: "1.0", secretBroker: "1.0" },
  runtime: { node: "22.12.0", codexCli: "0.144.1", postgresqlMajor: 16 },
  database: { engine: "postgresql", migrations: [migration("0001_initial.sql", "1")] },
  ...overrides,
});

test("release cutover plan binds two real versions and never claims execution evidence", () => {
  const previous = manifest();
  const current = manifest({
    releaseVersion: "1.1.0",
    sourceRevision: "b".repeat(40),
    images: { api: image("api", "d"), web: image("web", "e"), ops: image("ops", "f"),
      codexAgentNode: image("codex-agent-node", "8"), vaultSecretBroker: image("vault-secret-broker", "6"),
      referenceDataNode: image("reference-data-node", "4") },
    database: {
      engine: "postgresql",
      migrations: [migration("0001_initial.sql", "1"), migration("0002_outbox.sql", "2")],
    },
  });
  const plan = createReleaseCutoverPlan(previous, current);
  assert.equal(plan.status, "PLANNED_NOT_EXECUTED");
  assert.equal(plan.compatibility.migrationHistory, "EXACT_PREFIX");
  assert.equal(plan.compatibility.migrationAdded, true);
  assert.deepEqual(plan.compatibility.codexCli, { previous: "0.144.1", current: "0.144.1" });
  assert.equal(plan.compatibility.previousBinaryOnCurrentSchema, "NOT_ASSUMED");
  assert.equal(plan.rollback.strategy, "RESTORE_PAIRED_BACKUP_TO_EMPTY_PARALLEL_DATABASE");
  assert.equal(plan.completion.executable, false);
  assert.ok(plan.orderedSteps.some((step) => step.id === "forward-migrate"));
  assert.ok(plan.orderedSteps.every((step) => plan.completion.requiredEvidenceIds.includes(step.evidenceId)));
  assert.doesNotMatch(JSON.stringify(plan), /password|clientSecret|bearerToken/i);
});

test("release cutover plan allows an application-only release without inventing a migration", () => {
  const previous = manifest();
  const current = manifest({
    releaseVersion: "1.0.1",
    sourceRevision: "b".repeat(40),
    images: { api: image("api", "d"), web: image("web", "e"), ops: image("ops", "c"),
      codexAgentNode: image("codex-agent-node", "8"), vaultSecretBroker: image("vault-secret-broker", "6"),
      referenceDataNode: image("reference-data-node", "4") },
  });
  const plan = createReleaseCutoverPlan(previous, current);
  assert.equal(plan.compatibility.migrationAdded, false);
  assert.equal(plan.orderedSteps.some((step) => step.id === "forward-migrate"), false);
});

test("release cutover plan admits a legacy five-image release without inventing a previous Data Node", () => {
  const previous = manifest();
  delete (previous.images as Record<string, unknown>).referenceDataNode;
  const current = manifest({
    releaseVersion: "1.0.1",
    sourceRevision: "b".repeat(40),
    images: { api: image("api", "d"), web: image("web", "e"), ops: image("ops", "f"),
      codexAgentNode: image("codex-agent-node", "8"), vaultSecretBroker: image("vault-secret-broker", "6"),
      referenceDataNode: image("reference-data-node", "4") },
  });

  const plan = createReleaseCutoverPlan(previous, current);

  assert.deepEqual(plan.compatibility.referenceDataNode, {
    previous: null,
    current: image("reference-data-node", "4"),
    change: "ADDED_FIXTURE_ONLY",
  });
  assert.equal(plan.rollback.previousReferenceDataNode, "ABSENT_BY_RELEASE_CONTRACT");
  assert.equal("referenceDataNode" in plan.releases.previous.images, false);
  assert.equal(plan.orderedSteps.some(({ id }) => id === "start-candidate-data-node"), true);
});

test("release cutover plan still requires the current release to contain the Data Node image", () => {
  const current = manifest({
    releaseVersion: "1.0.1",
    sourceRevision: "b".repeat(40),
    images: { api: image("api", "d"), web: image("web", "e"), ops: image("ops", "f"),
      codexAgentNode: image("codex-agent-node", "8"), vaultSecretBroker: image("vault-secret-broker", "6") },
  });
  assert.throws(() => createReleaseCutoverPlan(manifest(), current),
    /CURRENT_REFERENCEDATANODE_IMAGE_INVALID/);
});

test("release cutover plan rejects a relabelled API image", () => {
  assert.throws(() => createReleaseCutoverPlan(manifest(), manifest({
    releaseVersion: "1.0.1",
    sourceRevision: "b".repeat(40),
  })), /API_IMAGE_NOT_CHANGED/);
});

test("release cutover plan rejects migration rewrites and removal", () => {
  const previous = manifest({ database: {
    engine: "postgresql",
    migrations: [migration("0001_initial.sql", "1"), migration("0002_outbox.sql", "2")],
  } });
  assert.throws(() => createReleaseCutoverPlan(previous, manifest({
    releaseVersion: "1.1.0",
    sourceRevision: "b".repeat(40),
    images: { api: image("api", "d"), web: image("web", "e"), ops: image("ops", "f"),
      codexAgentNode: image("codex-agent-node", "8"), vaultSecretBroker: image("vault-secret-broker", "6"),
      referenceDataNode: image("reference-data-node", "4") },
    database: { engine: "postgresql", migrations: [migration("0001_initial.sql", "9")] },
  })), /MIGRATION_HISTORY_IS_NOT_AN_EXACT_PREFIX/);
});

test("release cutover plan rejects unproven runtime and public contract changes", () => {
  const next = {
    releaseVersion: "2.0.0",
    sourceRevision: "b".repeat(40),
    images: { api: image("api", "d"), web: image("web", "e"), ops: image("ops", "f"),
      codexAgentNode: image("codex-agent-node", "8"), vaultSecretBroker: image("vault-secret-broker", "6"),
      referenceDataNode: image("reference-data-node", "4") },
  };
  assert.throws(() => createReleaseCutoverPlan(manifest(), manifest({
    ...next,
    runtime: { node: "22.12.0", codexCli: "0.144.1", postgresqlMajor: 17 },
  })), /POSTGRESQL_MAJOR_UPGRADE_REQUIRES_SEPARATE_ADR/);
  assert.throws(() => createReleaseCutoverPlan(manifest(), manifest({
    ...next,
    contracts: { formalApi: "v2" },
  })), /PUBLIC_CONTRACT_CHANGE_REQUIRES_COMPATIBILITY_ADMISSION/);
  assert.throws(() => createReleaseCutoverPlan(manifest(), manifest({
    ...next,
    runtime: { node: "22.12.0", postgresqlMajor: 16 },
  })), /CURRENT_CODEX_CLI_RUNTIME_INVALID/);
});
