import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runner = await readFile(new URL("../scripts/run-keycloak-oidc-compatibility.mjs", import.meta.url), "utf8");
const options = await readFile(new URL("../adapters/identity/better-auth-options.ts", import.meta.url), "utf8");
const workflow = await readFile(new URL("../.github/workflows/verify.yml", import.meta.url), "utf8");

test("Keycloak compatibility admission pins providers and creates credentials only at runtime", () => {
  assert.match(runner, /keycloak@sha256:[a-f0-9]{64}/);
  assert.match(runner, /postgres:16\.15-bookworm@sha256:[a-f0-9]{64}/);
  assert.doesNotMatch(runner, /keycloak:latest|POSTGRES_PASSWORD=[A-Za-z0-9_-]{16,}/);
  assert.match(runner, /randomBytes\(/);
  assert.match(runner, /start-dev/);
  assert.match(runner, /--import-realm/);
  assert.match(workflow, /npm run test:oidc:keycloak/);
});

test("formal identity exposes one exact Generic OAuth callback contract", () => {
  assert.match(options, /\/api\/auth\/oauth2\/callback\/enterprise-oidc/);
  assert.doesNotMatch(options, /`\$\{baseUrl\}\/api\/auth\/callback\/enterprise-oidc`/);
});
