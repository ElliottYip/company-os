import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDistinctDatabasePrincipals,
  runtimeDatabaseRoleName,
} from "../scripts/provision-postgres-runtime-role.ts";

test("runtime database role accepts one bounded non-administrator identifier", () => {
  assert.equal(runtimeDatabaseRoleName("company_os_runtime"), "company_os_runtime");
  for (const value of ["postgres", "CompanyOS", "company-os", "runtime;drop role postgres", "", "a".repeat(64)]) {
    assert.throws(() => runtimeDatabaseRoleName(value), /RUNTIME_DATABASE_ROLE_INVALID/);
  }
});

test("migration and runtime database principals must be distinct", () => {
  assert.doesNotThrow(() => assertDistinctDatabasePrincipals(
    "postgres://company_os_owner:fixture@db:5432/company_os",
    "company_os_runtime",
  ));
  assert.throws(() => assertDistinctDatabasePrincipals(
    "postgres://company_os_runtime:fixture@db:5432/company_os",
    "company_os_runtime",
  ), /DATABASE_PRINCIPALS_MUST_DIFFER/);
});
