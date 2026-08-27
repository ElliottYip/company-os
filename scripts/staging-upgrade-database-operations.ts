import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createCompanyDatabase } from "../adapters/persistence/postgres/company-database.ts";
import type { StagingUpgradePreparationStepRecord } from
  "./create-staging-upgrade-preparation-adapter.ts";
import { backupEncryptionKey, createEncryptedPostgresBackup } from "./postgres-encrypted-backup.ts";
import { runEncryptedPostgresRestoreDrill } from "./postgres-encrypted-restore-drill.ts";

const DIGEST = /^sha256:[a-f0-9]{64}$/;

export async function createStagingUpgradeDatabaseOperations(input: {
  readonly candidateDirectory: string;
  readonly operationId: string;
  readonly siteId: string;
  readonly candidateReleaseId: string;
  readonly activeDatabaseUrlFile: string;
  readonly candidateDatabaseUrlFile: string;
  readonly backupEncryptionKeyFile: string;
  readonly candidateMigrationSetDigest: string;
  readonly parallelDatabaseReference: string;
}, supplied: {
  readonly createBackup?: typeof createEncryptedPostgresBackup;
  readonly restoreBackup?: typeof runEncryptedPostgresRestoreDrill;
  readonly migrateCandidate?: (databaseUrl: string) => Promise<void>;
  readonly now?: () => string;
} = {}) {
  if (!DIGEST.test(input.candidateMigrationSetDigest)) {
    throw new Error("STAGING_UPGRADE_DATABASE_MIGRATION_SET_DIGEST_INVALID");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,255}$/.test(input.parallelDatabaseReference)) {
    throw new Error("STAGING_UPGRADE_DATABASE_REFERENCE_INVALID");
  }
  const directory = await privateDirectory(input.candidateDirectory);
  const records = await ensurePrivate(join(directory, "step-evidence"));
  const backupDirectory = await ensurePrivate(join(directory, "paired-backup"));
  const stateFile = join(directory, "database-upgrade-state.json");
  const createBackup = supplied.createBackup ?? createEncryptedPostgresBackup;
  const restoreBackup = supplied.restoreBackup ?? runEncryptedPostgresRestoreDrill;
  const migrateCandidate = supplied.migrateCandidate ?? defaultMigrate;
  const now = supplied.now ?? (() => new Date().toISOString());

  const record = async (step: "encrypted-backup" | "parallel-restore-rehearsal" | "forward-migrate",
    outcome: StagingUpgradePreparationStepRecord["outcome"], details: Record<string, unknown>) => {
    const evidence = { schemaVersion: 1, product: "company-os", operationId: input.operationId,
      siteId: input.siteId, candidateReleaseId: input.candidateReleaseId, step, outcome,
      capturedAt: now(), ...details, databaseCoordinatesIncluded: false,
      encryptionKeyIncluded: false, secretMaterialIncluded: false };
    const raw = `${JSON.stringify(evidence, null, 2)}\n`; const evidenceDigest = sha256(raw);
    await writeFile(join(records, `${step}.json`), raw, { flag: "wx", mode: 0o600 });
    return { schemaVersion: 1 as const, product: "company-os" as const,
      operationId: input.operationId, siteId: input.siteId,
      candidateReleaseId: input.candidateReleaseId, step, outcome, evidenceDigest,
      secretMaterialIncluded: false as const } as StagingUpgradePreparationStepRecord;
  };

  return {
    "encrypted-backup": async () => {
      await rejectExisting(stateFile, "STAGING_UPGRADE_DATABASE_STATE_ALREADY_EXISTS");
      const databaseUrl = (await privateFile(input.activeDatabaseUrlFile,
        "STAGING_UPGRADE_ACTIVE_DATABASE_FILE_UNSAFE", 16_384)).trim();
      const key = backupEncryptionKey((await privateFile(input.backupEncryptionKeyFile,
        "STAGING_UPGRADE_BACKUP_KEY_FILE_UNSAFE", 256)).trim());
      const result = await createBackup({ databaseUrl, outputDirectory: backupDirectory,
        encryptionKey: key });
      if (result.schemaVersion !== 1 || result.status !== "PASS" || !DIGEST.test(result.ciphertextDigest) ||
          resolve(result.ciphertextPath).slice(0, backupDirectory.length + 1) !== `${backupDirectory}/` ||
          result.manifestPath !== `${result.ciphertextPath}.json`) {
        throw new Error("STAGING_UPGRADE_BACKUP_RESULT_INVALID");
      }
      const state = { schemaVersion: 1, operationId: input.operationId, status: "BACKUP_RETAINED",
        ciphertextDigest: result.ciphertextDigest, ciphertextPath: result.ciphertextPath,
        manifestPath: result.manifestPath, candidateMigrationSetDigest: input.candidateMigrationSetDigest };
      await writeAtomic(stateFile, state);
      return record("encrypted-backup", "PAIRED_BACKUP_AND_MANIFEST_RETAINED",
        { ciphertextDigest: result.ciphertextDigest });
    },
    "parallel-restore-rehearsal": async () => {
      const state = await databaseState(stateFile, "BACKUP_RETAINED");
      const targetUrl = (await privateFile(input.candidateDatabaseUrlFile,
        "STAGING_UPGRADE_CANDIDATE_DATABASE_FILE_UNSAFE", 16_384)).trim();
      const key = backupEncryptionKey((await privateFile(input.backupEncryptionKeyFile,
        "STAGING_UPGRADE_BACKUP_KEY_FILE_UNSAFE", 256)).trim());
      const result = await restoreBackup({ targetUrl, backupPath: state.ciphertextPath,
        encryptionKey: key, schemaValidation: "CONNECTIVITY_ONLY" });
      if (result.schemaVersion !== 1 || result.status !== "PASS" ||
          result.ciphertextDigest !== state.ciphertextDigest) {
        throw new Error("STAGING_UPGRADE_RESTORE_RESULT_INVALID");
      }
      await writeAtomic(stateFile, { ...state, status: "PARALLEL_RESTORE_VERIFIED",
        parallelDatabaseReference: input.parallelDatabaseReference });
      return record("parallel-restore-rehearsal",
        "PREVIOUS_RELEASE_STATE_RESTORED_TO_EMPTY_PARALLEL_TARGET",
        { ciphertextDigest: result.ciphertextDigest,
          parallelDatabaseReference: input.parallelDatabaseReference });
    },
    "forward-migrate": async () => {
      const state = await databaseState(stateFile, "PARALLEL_RESTORE_VERIFIED");
      const targetUrl = (await privateFile(input.candidateDatabaseUrlFile,
        "STAGING_UPGRADE_CANDIDATE_DATABASE_FILE_UNSAFE", 16_384)).trim();
      if (state.parallelDatabaseReference !== input.parallelDatabaseReference) {
        throw new Error("STAGING_UPGRADE_DATABASE_TARGET_CHANGED");
      }
      await migrateCandidate(targetUrl);
      await writeAtomic(stateFile, { ...state, status: "CANDIDATE_MIGRATED",
        candidateMigrationSetDigest: input.candidateMigrationSetDigest });
      return record("forward-migrate", "CURRENT_MIGRATIONS_APPLIED_ONCE",
        { ciphertextDigest: state.ciphertextDigest,
          candidateMigrationSetDigest: input.candidateMigrationSetDigest });
    },
  };
}

async function defaultMigrate(databaseUrl: string) {
  const database = createCompanyDatabase(databaseUrl);
  try { await database.ping(); await database.migrate(); await database.checkSchema(); }
  finally { await database.close(); }
}
async function databaseState(path: string, expected: string): Promise<any> {
  const value = JSON.parse(await privateFile(path, "STAGING_UPGRADE_DATABASE_STATE_UNSAFE", 1_048_576));
  if (value?.schemaVersion !== 1 || value.status !== expected ||
      !DIGEST.test(value.ciphertextDigest) || typeof value.ciphertextPath !== "string" ||
      typeof value.manifestPath !== "string" || !DIGEST.test(value.candidateMigrationSetDigest)) {
    throw new Error("STAGING_UPGRADE_DATABASE_STATE_INVALID");
  }
  return value;
}
async function rejectExisting(path: string, code: string) {
  try { await lstat(path); throw new Error(code); }
  catch (error) { if (!isCode(error, "ENOENT")) throw error; }
}
async function writeAtomic(path: string, value: unknown) {
  const partial = `${path}.partial-${process.pid}-${Date.now()}`;
  try { await writeFile(partial, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(partial, path); } finally { await rm(partial, { force: true }); }
}
async function privateDirectory(value: string) {
  const path = resolve(value); const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) {
    throw new Error("STAGING_UPGRADE_DATABASE_DIRECTORY_UNSAFE");
  }
  return path;
}
async function ensurePrivate(path: string) {
  try { await mkdir(path, { mode: 0o700 }); } catch (error) { if (!isCode(error, "EEXIST")) throw error; }
  return privateDirectory(path);
}
async function privateFile(pathValue: string, code: string, maximum: number) {
  const path = resolve(pathValue); const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o077) !== 0 || metadata.size < 2 || metadata.size > maximum) throw new Error(code);
  return readFile(path, "utf8");
}
function sha256(value: string) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
