import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("managed-cloud admission uses external PostgreSQL/OIDC and server-side admin provisioning", async () => {
  const [runner, browserTest, packageSource, workflow] = await Promise.all([
    read("scripts/run-self-hosted-compose-admission.mjs"),
    read("tests/e2e/managed-cloud-compose-live.spec.ts"),
    read("package.json"),
    read(".github/workflows/verify.yml"),
  ]);
  assert.match(runner, /COMPANY_OS_COMPOSE_ADMISSION_PROFILE/);
  assert.match(runner, /deploy\/compose\.managed-cloud\.yml/);
  assert.match(runner, /postgres:16\.15-bookworm@sha256:[a-f0-9]{64}/);
  assert.match(runner, /external: true/);
  assert.match(browserTest, /Managed account provisioning/);
  assert.match(browserTest, /ops:provision-managed-admin|provision-managed-instance-admin/);
  assert.match(browserTest, /Create company/);
  assert.match(browserTest, /Create organization/);
  assert.doesNotMatch(browserTest, /page\.route|route\.fulfill/);
  const packageJson = JSON.parse(packageSource) as { scripts: Record<string, string> };
  assert.equal(packageJson.scripts["test:compose:managed-cloud"],
    "COMPANY_OS_COMPOSE_ADMISSION_PROFILE=managed-cloud node scripts/run-self-hosted-compose-admission.mjs");
  assert.match(workflow, /npm run test:compose:managed-cloud/);
});
