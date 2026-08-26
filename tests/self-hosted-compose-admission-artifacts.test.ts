import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("self-hosted admission exercises the production Compose profile through TLS and Keycloak", async () => {
  const [runner, browserTest, packageSource, workflow] = await Promise.all([
    read("scripts/run-self-hosted-compose-admission.mjs"),
    read("tests/e2e/self-hosted-compose-live.spec.ts"),
    read("package.json"),
    read(".github/workflows/verify.yml"),
  ]);
  assert.match(runner, /compose", "--project-name"/);
  assert.match(runner, /deploy\/compose\.self-hosted\.yml/);
  assert.match(runner, /NODE_EXTRA_CA_CERTS/);
  assert.match(runner, /const identityHost = keycloakContainer/);
  assert.match(runner, /docker\("network", "create", externalNetwork\)/);
  assert.match(runner, /"--network", externalNetwork/);
  assert.match(runner, /"127\.0\.0\.1:" \+ keycloakPort \+ ":" \+ keycloakPort/);
  assert.match(runner, /"--https-port=" \+ keycloakPort/);
  assert.doesNotMatch(runner, /host-gateway/);
  assert.match(runner, /mkdtempSync\(join\(tmpdir\(\)/);
  assert.doesNotMatch(runner, /\/private\/tmp/);
  assert.match(runner, /company-os-compose-realm\.json[\s\S]+mode: 0o644/);
  assert.match(runner, /quay\.io\/keycloak\/keycloak@sha256:[a-f0-9]{64}/);
  assert.match(runner, /down", "--volumes", "--remove-orphans"/);
  assert.match(browserTest, /Claim first administrator/);
  assert.match(browserTest, /Create company/);
  assert.match(browserTest, /Create organization/);
  assert.match(browserTest, /Production/);
  assert.doesNotMatch(browserTest, /page\.route|route\.fulfill/);
  const packageJson = JSON.parse(packageSource) as { scripts: Record<string, string> };
  assert.equal(packageJson.scripts["test:compose:self-hosted"], "node scripts/run-self-hosted-compose-admission.mjs");
  assert.match(workflow, /npm run test:compose:self-hosted/);
});
