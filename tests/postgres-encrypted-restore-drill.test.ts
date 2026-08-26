import assert from "node:assert/strict";
import test from "node:test";
import { assertEncryptedRestoreTarget } from "../scripts/postgres-encrypted-restore-drill.ts";

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
