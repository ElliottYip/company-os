import assert from "node:assert/strict";
import test from "node:test";
import { assertRestoreDrillBoundary, postgresCommandCoordinates } from "../scripts/postgres-restore-drill.ts";

test("restore drill keeps database credentials out of its evidence coordinates", () => {
  const coordinates = postgresCommandCoordinates("postgres://operator:sensitive%20fixture@db.example:5433/company_os?sslmode=require");
  assert.deepEqual({ ...coordinates, password: "[redacted]" }, {
    host: "db.example", port: "5433", database: "company_os", user: "operator",
    password: "[redacted]", sslMode: "require",
  });
  assert.doesNotMatch(JSON.stringify({ host: coordinates.host, port: coordinates.port,
    database: coordinates.database, user: coordinates.user, sslMode: coordinates.sslMode }), /sensitive/);
});

test("restore drill refuses same, ambiguous, or non-absolute targets before a database call", () => {
  const source = postgresCommandCoordinates("postgres://operator:fixture@db.example/company_os");
  assert.throws(() => assertRestoreDrillBoundary(source, source, "/tmp/company-os.dump"),
    /RESTORE_DRILL_SOURCE_TARGET_MUST_DIFFER/);
  const productionNamedTarget = postgresCommandCoordinates("postgres://operator:fixture@db.example/company_os_copy");
  assert.throws(() => assertRestoreDrillBoundary(source, productionNamedTarget, "/tmp/company-os.dump"),
    /RESTORE_DRILL_TARGET_NAME_REQUIRED/);
  const drillTarget = postgresCommandCoordinates("postgres://operator:fixture@db.example/company_os_restore_drill");
  assert.throws(() => assertRestoreDrillBoundary(source, drillTarget, "relative.dump"),
    /RESTORE_DRILL_BACKUP_PATH_INVALID/);
  assert.doesNotThrow(() => assertRestoreDrillBoundary(source, drillTarget, "/tmp/company-os.dump"));
});
