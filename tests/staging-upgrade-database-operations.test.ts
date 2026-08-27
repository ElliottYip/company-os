import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createStagingUpgradeDatabaseOperations } from
  "../scripts/staging-upgrade-database-operations.ts";

const digest = (value: string) => `sha256:${value.repeat(64)}`;
async function fixture(context: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), "company-os-upgrade-database-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const candidate = join(root, "candidate"); await mkdir(candidate, { mode: 0o700 });
  const active = join(root, "active-url"); const target = join(root, "target-url"); const key = join(root, "key");
  await Promise.all([
    writeFile(active, "postgres://active:private@db.internal/active\n", { mode: 0o600 }),
    writeFile(target, "postgres://target:private@db.internal/company_restore\n", { mode: 0o600 }),
    writeFile(key, `${Buffer.alloc(32, 7).toString("base64")}\n`, { mode: 0o600 }),
  ]);
  return { candidate, active, target, key };
}

test("database operations bind encrypted backup, empty restore and forward migration", async (context) => {
  const value = await fixture(context); const calls: string[] = [];
  const operations = await createStagingUpgradeDatabaseOperations({ candidateDirectory: value.candidate,
    operationId: "upgrade-rc4-to-rc5", siteId: "company-os-test-site",
    candidateReleaseId: `0.1.0-rc.5-${"b".repeat(12)}`,
    activeDatabaseUrlFile: value.active, candidateDatabaseUrlFile: value.target,
    backupEncryptionKeyFile: value.key, candidateMigrationSetDigest: digest("b"),
    parallelDatabaseReference: "database:parallel-restore-rc5" }, {
    createBackup: async ({ outputDirectory }) => { calls.push("backup");
      const path = join(outputDirectory, "paired.dump.enc"); await writeFile(path, "cipher", { mode: 0o600 });
      await writeFile(`${path}.json`, "{}\n", { mode: 0o600 });
      return { schemaVersion: 1, status: "PASS", ciphertextDigest: digest("a"),
        ciphertextPath: path, manifestPath: `${path}.json` }; },
    restoreBackup: async (input) => { calls.push(`restore:${input.schemaValidation}`);
      return { schemaVersion: 1, status: "PASS", ciphertextDigest: digest("a") }; },
    migrateCandidate: async () => { calls.push("migrate"); },
    now: () => "2026-08-27T12:00:00.000Z",
  });
  await operations["encrypted-backup"]();
  await operations["parallel-restore-rehearsal"]();
  await operations["forward-migrate"]();
  assert.deepEqual(calls, ["backup", "restore:CONNECTIVITY_ONLY", "migrate"]);
  const state = JSON.parse(await readFile(join(value.candidate, "database-upgrade-state.json"), "utf8"));
  assert.equal(state.status, "CANDIDATE_MIGRATED");
  const evidence = await readFile(join(value.candidate, "step-evidence", "forward-migrate.json"), "utf8");
  assert.doesNotMatch(evidence, /postgres:\/\/|private@|BwcHBwcHBwcH/);
  assert.equal(JSON.parse(evidence).encryptionKeyIncluded, false);
});

test("database operations refuse migration before verified restore and target drift", async (context) => {
  const value = await fixture(context);
  const operations = await createStagingUpgradeDatabaseOperations({ candidateDirectory: value.candidate,
    operationId: "upgrade-rc4-to-rc5", siteId: "company-os-test-site",
    candidateReleaseId: `0.1.0-rc.5-${"b".repeat(12)}`,
    activeDatabaseUrlFile: value.active, candidateDatabaseUrlFile: value.target,
    backupEncryptionKeyFile: value.key, candidateMigrationSetDigest: digest("b"),
    parallelDatabaseReference: "database:parallel-restore-rc5" }, {
    createBackup: async ({ outputDirectory }) => { const path = join(outputDirectory, "paired.dump.enc");
      await writeFile(path, "cipher", { mode: 0o600 }); await writeFile(`${path}.json`, "{}\n", { mode: 0o600 });
      return { schemaVersion: 1, status: "PASS", ciphertextDigest: digest("a"),
        ciphertextPath: path, manifestPath: `${path}.json` }; },
    restoreBackup: async () => ({ schemaVersion: 1, status: "PASS", ciphertextDigest: digest("a") }),
    migrateCandidate: async () => {},
  });
  await assert.rejects(operations["forward-migrate"](), /ENOENT|STATE_UNSAFE/);
  await operations["encrypted-backup"](); await operations["parallel-restore-rehearsal"]();
  const changedOperations = await createStagingUpgradeDatabaseOperations({ candidateDirectory: value.candidate,
    operationId: "upgrade-rc4-to-rc5", siteId: "company-os-test-site",
    candidateReleaseId: `0.1.0-rc.5-${"b".repeat(12)}`,
    activeDatabaseUrlFile: value.active, candidateDatabaseUrlFile: value.target,
    backupEncryptionKeyFile: value.key, candidateMigrationSetDigest: digest("b"),
    parallelDatabaseReference: "database:different-target" }, { migrateCandidate: async () => {} });
  await assert.rejects(changedOperations["forward-migrate"](), /STAGING_UPGRADE_DATABASE_TARGET_CHANGED/);
});
