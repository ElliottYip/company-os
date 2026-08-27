import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public Demo is an explicit deployment opt-in and browser admission enables it", async () => {
  const [entry, compose, demoCompose, environment, playwright] = await Promise.all([
    readFile(new URL("../adapters/http/service-entry.ts", import.meta.url), "utf8"),
    readFile(new URL("../deploy/compose.staging.yml", import.meta.url), "utf8"),
    readFile(new URL("../deploy/compose.public-demo.yml", import.meta.url), "utf8"),
    readFile(new URL("../deploy/staging.env.example", import.meta.url), "utf8"),
    readFile(new URL("../playwright.config.ts", import.meta.url), "utf8"),
  ]);
  assert.match(entry, /COMPANY_OS_PUBLIC_DEMO_ENABLED/);
  assert.match(entry, /COMPANY_OS_RUNTIME_MODE/);
  assert.match(entry, /publicDemoEnabled \?/);
  assert.match(compose, /COMPANY_OS_RUNTIME_MODE: formal/);
  assert.match(compose, /COMPANY_OS_PUBLIC_DEMO_ENABLED: "false"/);
  assert.match(demoCompose, /COMPANY_OS_RUNTIME_MODE: public-demo/);
  assert.match(demoCompose, /COMPANY_OS_PUBLIC_DEMO_ENABLED: "true"/);
  assert.match(demoCompose, /COMPANY_OS_WEB_MODE: demo/);
  assert.doesNotMatch(demoCompose,
    /COMPANY_OS_(?:OIDC|DATABASE_URL|SECRET_DIRECTORY|CONNECTOR_PACKAGES)/);
  assert.doesNotMatch(demoCompose, /reference-data-node|codex-agent-node|vault/);
  assert.match(environment, /COMPANY_OS_PUBLIC_DEMO_ENABLED=false/);
  assert.match(playwright, /COMPANY_OS_RUNTIME_MODE=public-demo/);
  assert.match(playwright, /COMPANY_OS_PUBLIC_DEMO_ENABLED=true/);
});
