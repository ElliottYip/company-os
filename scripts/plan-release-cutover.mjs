import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const digestImage = /@sha256:[a-f0-9]{64}$/;
const digest = /^sha256:[a-f0-9]{64}$/;
const revision = /^[a-f0-9]{40}$/;
const version = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([a-z0-9.-]+))?$/;

const fail = (code) => {
  throw new Error(code);
};

const object = (value, code) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
};

const text = (value, pattern, code) => {
  if (typeof value !== "string" || !pattern.test(value)) fail(code);
  return value;
};

const compareVersions = (left, right) => {
  const a = text(left, version, "PREVIOUS_RELEASE_VERSION_INVALID").match(version);
  const b = text(right, version, "CURRENT_RELEASE_VERSION_INVALID").match(version);
  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(a[index]) - Number(b[index]);
    if (difference !== 0) return difference;
  }
  if (a[4] === b[4]) return 0;
  if (!a[4]) return 1;
  if (!b[4]) return -1;
  return a[4].localeCompare(b[4]);
};

const validateManifest = (value, side) => {
  const manifest = object(value, `${side}_MANIFEST_INVALID`);
  if (manifest.schemaVersion !== 1 || manifest.product !== "company-os") {
    fail(`${side}_MANIFEST_CONTRACT_UNSUPPORTED`);
  }
  text(manifest.releaseVersion, version, `${side}_RELEASE_VERSION_INVALID`);
  text(manifest.sourceRevision, revision, `${side}_SOURCE_REVISION_INVALID`);
  const images = object(manifest.images, `${side}_IMAGES_INVALID`);
  for (const image of ["api", "web", "ops", "codexAgentNode", "vaultSecretBroker", "referenceDataNode"]) {
    text(images[image], digestImage, `${side}_${image.toUpperCase()}_IMAGE_INVALID`);
  }
  const runtime = object(manifest.runtime, `${side}_RUNTIME_INVALID`);
  text(runtime.node, version, `${side}_NODE_RUNTIME_INVALID`);
  text(runtime.codexCli, version, `${side}_CODEX_CLI_RUNTIME_INVALID`);
  if (!Number.isSafeInteger(runtime.postgresqlMajor) || runtime.postgresqlMajor < 1) {
    fail(`${side}_POSTGRESQL_MAJOR_INVALID`);
  }
  const database = object(manifest.database, `${side}_DATABASE_INVALID`);
  if (database.engine !== "postgresql" || !Array.isArray(database.migrations)) {
    fail(`${side}_DATABASE_CONTRACT_INVALID`);
  }
  const migrationNames = new Set();
  for (const migration of database.migrations) {
    object(migration, `${side}_MIGRATION_INVALID`);
    text(migration.name, /^[0-9]{4}_[a-z0-9_]+\.sql$/, `${side}_MIGRATION_NAME_INVALID`);
    text(migration.digest, digest, `${side}_MIGRATION_DIGEST_INVALID`);
    if (migrationNames.has(migration.name)) fail(`${side}_MIGRATION_DUPLICATE`);
    migrationNames.add(migration.name);
  }
  if (database.migrations.some((item, index, all) => index > 0 && all[index - 1].name >= item.name)) {
    fail(`${side}_MIGRATIONS_NOT_ORDERED`);
  }
  object(manifest.contracts, `${side}_CONTRACTS_INVALID`);
  return manifest;
};

const stableHash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createReleaseCutoverPlan(previousValue, currentValue) {
  const previous = validateManifest(previousValue, "PREVIOUS");
  const current = validateManifest(currentValue, "CURRENT");
  if (compareVersions(previous.releaseVersion, current.releaseVersion) >= 0) {
    fail("CURRENT_RELEASE_MUST_BE_NEWER");
  }
  if (previous.sourceRevision === current.sourceRevision) fail("SOURCE_REVISION_NOT_CHANGED");
  if (previous.images.api === current.images.api) fail("API_IMAGE_NOT_CHANGED");
  if (previous.runtime.postgresqlMajor !== current.runtime.postgresqlMajor) {
    fail("POSTGRESQL_MAJOR_UPGRADE_REQUIRES_SEPARATE_ADR");
  }
  if (JSON.stringify(previous.contracts) !== JSON.stringify(current.contracts)) {
    fail("PUBLIC_CONTRACT_CHANGE_REQUIRES_COMPATIBILITY_ADMISSION");
  }
  for (let index = 0; index < previous.database.migrations.length; index += 1) {
    const before = previous.database.migrations[index];
    const after = current.database.migrations[index];
    if (!after || before.name !== after.name || before.digest !== after.digest) {
      fail("MIGRATION_HISTORY_IS_NOT_AN_EXACT_PREFIX");
    }
  }

  const migrationAdded = current.database.migrations.length > previous.database.migrations.length;
  const cutoverId = `cutover-${stableHash({
    previous: previous.sourceRevision,
    current: current.sourceRevision,
    previousApi: previous.images.api,
    currentApi: current.images.api,
    migrations: current.database.migrations,
  }).slice(0, 24)}`;
  const evidencePrefix = `${cutoverId}/evidence`;

  return {
    schemaVersion: 1,
    status: "PLANNED_NOT_EXECUTED",
    cutoverId,
    releases: {
      previous: { version: previous.releaseVersion, sourceRevision: previous.sourceRevision, images: previous.images },
      current: { version: current.releaseVersion, sourceRevision: current.sourceRevision, images: current.images },
    },
    compatibility: {
      postgresqlMajor: current.runtime.postgresqlMajor,
      codexCli: {
        previous: previous.runtime.codexCli,
        current: current.runtime.codexCli,
      },
      migrationHistory: "EXACT_PREFIX",
      migrationAdded,
      publicContracts: "UNCHANGED",
      previousBinaryOnCurrentSchema: "NOT_ASSUMED",
    },
    orderedSteps: [
      { id: "freeze-dispatch", evidenceId: `${evidencePrefix}/01-freeze-dispatch`, outcome: "NEW_DISPATCH_DISABLED" },
      { id: "reconcile-attempts", evidenceId: `${evidencePrefix}/02-attempt-reconciliation`, outcome: "EVERY_IN_FLIGHT_ATTEMPT_DRAINED_CANCELLED_OR_DURABLY_RECOVERABLE" },
      { id: "encrypted-backup", evidenceId: `${evidencePrefix}/03-encrypted-backup`, outcome: "PAIRED_BACKUP_AND_MANIFEST_RETAINED" },
      { id: "parallel-restore-rehearsal", evidenceId: `${evidencePrefix}/04-restore-rehearsal`, outcome: "PREVIOUS_RELEASE_STATE_RESTORED_TO_EMPTY_PARALLEL_TARGET" },
      ...(migrationAdded ? [{ id: "forward-migrate", evidenceId: `${evidencePrefix}/05-forward-migration`, outcome: "CURRENT_MIGRATIONS_APPLIED_ONCE" }] : []),
      { id: "start-candidate-api", evidenceId: `${evidencePrefix}/06-candidate-api`, outcome: "CURRENT_DIGEST_STARTED_WITH_INGRESS_CLOSED" },
      { id: "candidate-readiness", evidenceId: `${evidencePrefix}/07-readiness`, outcome: "DEPENDENCY_AWARE_READY" },
      { id: "start-candidate-secret-broker", evidenceId: `${evidencePrefix}/07a-candidate-secret-broker`, outcome: "CURRENT_VAULT_SECRET_BROKER_DIGEST_READY" },
      { id: "start-candidate-agent-node", evidenceId: `${evidencePrefix}/07b-candidate-agent-node`, outcome: "CURRENT_CODEX_AGENT_NODE_DIGEST_READY" },
      { id: "start-candidate-data-node", evidenceId: `${evidencePrefix}/07c-candidate-data-node`, outcome: "CURRENT_REFERENCE_DATA_NODE_DIGEST_READY_AND_FIXTURE_ONLY" },
      { id: "customer-smoke", evidenceId: `${evidencePrefix}/08-customer-smoke`, outcome: "IDENTITY_COMPANY_WORK_APPROVAL_EVIDENCE_PATH_PASSED" },
      { id: "state-comparison", evidenceId: `${evidencePrefix}/09-state-comparison`, outcome: "CONTROL_TOTALS_AND_RESPONSIBILITY_EVIDENCE_MATCHED" },
      { id: "start-candidate-web", evidenceId: `${evidencePrefix}/10-candidate-web`, outcome: "CURRENT_WEB_DIGEST_SERVED" },
      { id: "route-traffic", evidenceId: `${evidencePrefix}/11-route-traffic`, outcome: "INGRESS_MOVED_TO_CURRENT_RELEASE" },
      { id: "observe", evidenceId: `${evidencePrefix}/12-observation-window`, outcome: "ERROR_LATENCY_AND_INTEGRITY_THRESHOLDS_PASSED" },
    ],
    rollback: {
      automaticDownMigration: false,
      reusePreviousBinaryOnCurrentDatabase: false,
      strategy: "RESTORE_PAIRED_BACKUP_TO_EMPTY_PARALLEL_DATABASE",
      orderedSteps: [
        "close-current-ingress",
        "retain-failed-database-for-incident-evidence",
        "restore-paired-backup-to-empty-parallel-database",
        "validate-previous-release-state-digest",
        "start-previous-digest-images-against-restored-target",
        "run-previous-release-smoke",
        "move-ingress-by-explicit-operator-decision",
      ],
    },
    completion: {
      executable: false,
      reason: "PLAN_REQUIRES_OPERATOR_EXECUTION_AND_RETAINED_EVIDENCE",
      requiredEvidenceIds: [
        ...new Set([
          `${evidencePrefix}/01-freeze-dispatch`,
          `${evidencePrefix}/02-attempt-reconciliation`,
          `${evidencePrefix}/03-encrypted-backup`,
          `${evidencePrefix}/04-restore-rehearsal`,
          ...(migrationAdded ? [`${evidencePrefix}/05-forward-migration`] : []),
          `${evidencePrefix}/06-candidate-api`,
          `${evidencePrefix}/07-readiness`,
          `${evidencePrefix}/07a-candidate-secret-broker`,
          `${evidencePrefix}/07b-candidate-agent-node`,
          `${evidencePrefix}/07c-candidate-data-node`,
          `${evidencePrefix}/08-customer-smoke`,
          `${evidencePrefix}/09-state-comparison`,
          `${evidencePrefix}/10-candidate-web`,
          `${evidencePrefix}/11-route-traffic`,
          `${evidencePrefix}/12-observation-window`,
        ]),
      ],
    },
  };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const [previousPath, currentPath] = process.argv.slice(2);
  if (!previousPath || !currentPath) fail("USAGE_PREVIOUS_AND_CURRENT_MANIFEST_PATHS_REQUIRED");
  const [previous, current] = await Promise.all([
    readFile(previousPath, "utf8").then(JSON.parse),
    readFile(currentPath, "utf8").then(JSON.parse),
  ]);
  process.stdout.write(`${JSON.stringify(createReleaseCutoverPlan(previous, current), null, 2)}\n`);
}
