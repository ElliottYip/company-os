import assert from "node:assert/strict";
import test from "node:test";
import { getTableName } from "drizzle-orm";
import { companyAuthSchema } from "../adapters/persistence/postgres/auth-schema.ts";

test("Better Auth persistence is Company OS-owned and complete", () => {
  assert.deepEqual(Object.keys(companyAuthSchema).sort(), ["account", "rateLimit", "session", "user", "verification"]);
  for (const table of Object.values(companyAuthSchema)) {
    assert.match(getTableName(table), /^company_os_auth_/);
  }
  assert.equal(getTableName(companyAuthSchema.user), "company_os_auth_user");
  assert.equal(getTableName(companyAuthSchema.session), "company_os_auth_session");
});
