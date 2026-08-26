import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("managed admin provisioning is a server-side verified-identity command", async () => {
  const [command, adapter, packageSource] = await Promise.all([
    read("scripts/provision-managed-instance-admin.ts"),
    read("adapters/persistence/postgres/postgres-verified-human-directory.ts"),
    read("package.json"),
  ]);
  assert.match(command, /COMPANY_OS_PROFILE/);
  assert.match(command, /managed-cloud/);
  assert.match(command, /COMPANY_OS_PROVISION_ADMIN_EMAIL/);
  assert.match(command, /COMPANY_OS_DATABASE_URL/);
  assert.match(adapter, /emailVerified/);
  assert.match(adapter, /findVerifiedHumanIdByEmail/);
  assert.doesNotMatch(command, /process\.argv|clientSecret|sessionSecret/);
  const packageJson = JSON.parse(packageSource) as { scripts: Record<string, string> };
  assert.equal(packageJson.scripts["ops:provision-managed-admin"],
    "node --experimental-strip-types scripts/provision-managed-instance-admin.ts");
});
