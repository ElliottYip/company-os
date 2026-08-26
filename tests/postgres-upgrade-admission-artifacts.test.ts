import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("PostgreSQL upgrade admission proves additive migration and parallel rollback recovery", async () => {
  const [runner, packageSource, workflow, dockerignore] = await Promise.all([
    read("scripts/run-postgres-upgrade-admission.mjs"),
    read("package.json"),
    read(".github/workflows/verify.yml"),
    read(".dockerignore"),
  ]);
  assert.match(runner, /postgres:16\.15-bookworm@sha256:[a-f0-9]{64}/);
  assert.match(runner, /0004_human_invites/);
  assert.match(runner, /0005_durable_control_plane/);
  assert.match(runner, /0006_instance_maintenance/);
  assert.match(runner, /company-os-api:upgrade-admission/);
  assert.match(runner, /pg_dump/);
  assert.match(runner, /pg_restore/);
  assert.match(runner, /company_os_upgrade_rollback/);
  assert.match(runner, /waitForHostPostgres\(hostUrl\)/);
  assert.match(runner, /UPGRADE_ADMISSION_HOST_POSTGRES_TIMEOUT/);
  assert.match(runner, /UPGRADE_ADMISSION_LEGACY_PROBE_FAILED/);
  assert.match(runner, /UPGRADE_ADMISSION_ROLLBACK_DATA_MISMATCH/);
  assert.match(runner, /docker", \["rm", "--force"/);
  assert.doesNotMatch(runner, /DROP\s+(?:TABLE|DATABASE)|company_os_test_only|CHANGE_ME/i);
  const packageJson = JSON.parse(packageSource) as { scripts: Record<string, string> };
  assert.equal(packageJson.scripts["test:upgrade:postgres16"],
    "node scripts/run-postgres-upgrade-admission.mjs");
  assert.match(workflow, /npm run test:upgrade:postgres16/);
  assert.match(dockerignore, /^assets$/m);
  assert.match(dockerignore, /^output$/m);
  assert.match(dockerignore, /^outputs$/m);
});
