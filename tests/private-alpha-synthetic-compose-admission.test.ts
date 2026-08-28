import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Compose admission can opt into the formal-only Paperclip overlay without changing its default profile", () => {
  const script = readFileSync("scripts/run-self-hosted-compose-admission.mjs", "utf8");
  assert.match(script, /COMPANY_OS_COMPOSE_ADMISSION_PAPERCLIP_ENABLED/);
  assert.match(script, /deploy\/compose\.private-alpha-paperclip\.yml/);
  assert.match(script, /COMPANY_OS_PAPERCLIP_AUTHORIZATION_FILE/);
  assert.match(script, /COMPANY_OS_COMPOSE_ADMISSION_EXTRA_CA_CERTIFICATE/);
  assert.match(script, /COMPANY_OS_COMPOSE_ADMISSION_PAPERCLIP_TLS_KEY/);
  assert.match(script, /private-alpha-paperclip-tls-proxy\.mjs/);
  assert.match(script, /private-alpha-federated-compose-live\.spec\.ts/);
  assert.match(script, /paperclipEnabled \? \[/);
});

test("the private Alpha browser admission uses a real formal session and verifies sync replay and revocation", () => {
  const source = readFileSync("tests/e2e/private-alpha-federated-compose-live.spec.ts", "utf8");
  assert.match(source, /portfolio-sources\/paperclip-alpha\/synchronize/);
  assert.match(source, /RECORDED/);
  assert.match(source, /REPLAYED/);
  assert.match(source, /FEDERATED_SOURCE_UNAVAILABLE/);
  assert.match(source, /runtimeFederatedSources/);
  assert.doesNotMatch(source, /page\.route\(/);
});
