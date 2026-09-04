import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertEncryptedRestoreTarget,
  encryptedRestoreSchemaValidation,
} from "../scripts/postgres-encrypted-restore-drill.ts";

test("encrypted restore admits only an explicitly named empty drill target", () => {
  assert.doesNotThrow(() => assertEncryptedRestoreTarget(
    "postgres://operator:fixture@db:5432/company_os_restore_drill",
    "/backup/company-os-20260825.dump.enc",
  ));
  assert.throws(() => assertEncryptedRestoreTarget(
    "postgres://operator:fixture@db:5432/company_os",
    "/backup/company-os-20260825.dump.enc",
  ), /ENCRYPTED_RESTORE_TARGET_NAME_REQUIRED/);
  assert.throws(() => assertEncryptedRestoreTarget(
    "postgres://operator:fixture@db:5432/company_os_restore_drill",
    "relative.dump.enc",
  ), /ENCRYPTED_RESTORE_BACKUP_PATH_INVALID/);
});

test("encrypted restore entrypoint reads credentials through file indirection", async () => {
  const source = await readFile("scripts/postgres-encrypted-restore-drill.ts", "utf8");
  assert.match(source, /readSecretFileEnvironment\("COMPANY_OS_BACKUP_ENCRYPTION_KEY"\)/);
  assert.match(source, /readSecretFileEnvironment\("COMPANY_OS_RESTORE_DATABASE_URL"\)/);
  assert.doesNotMatch(source, /backupEncryptionKey\(process\.env\.COMPANY_OS_BACKUP_ENCRYPTION_KEY\)/);
  assert.doesNotMatch(source, /const targetUrl = process\.env\.COMPANY_OS_RESTORE_DATABASE_URL/);
});

test("encrypted restore schema validation is explicit and closed", () => {
  assert.equal(encryptedRestoreSchemaValidation(undefined), "CURRENT");
  assert.equal(encryptedRestoreSchemaValidation("CONNECTIVITY_ONLY"), "CONNECTIVITY_ONLY");
  assert.throws(
    () => encryptedRestoreSchemaValidation("skip"),
    /ENCRYPTED_RESTORE_SCHEMA_VALIDATION_INVALID/,
  );
});
