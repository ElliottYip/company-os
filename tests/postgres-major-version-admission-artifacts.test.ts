import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("PostgreSQL support policy pins current 16 and 17 minors and proves a 16 to 17 migration", async () => {
  const [runner, packageSource, verifyWorkflow, releaseWorkflow, policy, compose, opsImage] =
    await Promise.all([
      read("scripts/run-postgres-major-version-admission.mjs"), read("package.json"),
      read(".github/workflows/verify.yml"), read(".github/workflows/release.yml"),
      read("docs/postgresql-support-policy.md"), read("deploy/compose.self-hosted.yml"),
      read("deploy/Dockerfile.ops"),
    ]);
  assert.match(runner, /postgres:16\.15-bookworm@sha256:[a-f0-9]{64}/);
  assert.match(runner, /postgres:17\.11-bookworm@sha256:[a-f0-9]{64}/);
  assert.match(runner, /pg_dump/);
  assert.match(runner, /pg_restore/);
  assert.match(runner, /ROLLBACK_SOURCE_PRESERVED/);
  assert.match(runner, /sourceMigrationCount/);
  assert.match(runner, /POSTGRES_MAJOR_ADMISSION_SOURCE_MIGRATIONS_INVALID/);
  assert.match(runner, /finally\s*\{/);
  assert.equal(JSON.parse(packageSource).scripts["test:upgrade:postgres-major"],
    "node scripts/run-postgres-major-version-admission.mjs");
  assert.match(verifyWorkflow, /npm run test:upgrade:postgres-major/);
  assert.match(releaseWorkflow, /npm run test:upgrade:postgres-major/);
  assert.match(policy, /PostgreSQL 16\.15/);
  assert.match(policy, /PostgreSQL 17\.11/);
  assert.match(policy, /logical dump\/restore/);
  assert.match(compose, /postgres:16\.15-bookworm/);
  assert.match(opsImage, /postgres:16\.15-bookworm/);
  assert.doesNotMatch(`${compose}\n${opsImage}`, /postgres:16\.4-bookworm/);
});
