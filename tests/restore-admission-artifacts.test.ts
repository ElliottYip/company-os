import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("PostgreSQL 16 restore admission uses isolated disposable resources and the release ops image", async () => {
  const [runner, packageSource, workflow] = await Promise.all([
    read("scripts/run-postgres-restore-admission.mjs"),
    read("package.json"),
    read(".github/workflows/verify.yml"),
  ]);
  assert.match(runner, /postgres:16\.15-bookworm@sha256:[a-f0-9]{64}/);
  assert.match(runner, /company-os-ops:restore-admission/);
  assert.match(runner, /randomBytes/);
  assert.match(runner, /company_os_restore_drill/);
  assert.match(runner, /RESTORE_ADMISSION_DATA_MISMATCH/);
  assert.match(runner, /docker", \["rm", "--force"/);
  assert.match(runner, /docker", \["network", "rm"/);
  assert.doesNotMatch(runner, /company_os_test_only|CHANGE_ME|const password\s*=\s*["'][^"']{8,}["']/i);
  const packageJson = JSON.parse(packageSource) as { scripts: Record<string, string> };
  assert.equal(packageJson.scripts["test:restore:postgres16"], "node scripts/run-postgres-restore-admission.mjs");
  assert.match(workflow, /npm run test:restore:postgres16/);
});
