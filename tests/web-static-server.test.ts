import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";
import {
  normalizePublicApiUrl,
  normalizeReleaseId,
  createCompanyOsWebServer,
  parseWebRuntimeOptions,
  resolveStaticFile,
  runtimeConfigSource,
} from "../scripts/serve-web.mjs";

test("Web runtime configuration validates a reusable formal deployment", () => {
  assert.deepEqual(parseWebRuntimeOptions({
    COMPANY_OS_WEB_HOST: "0.0.0.0",
    COMPANY_OS_WEB_PORT: "8080",
    COMPANY_OS_WEB_API_URL: "https://api.company.example",
    COMPANY_OS_WEB_MODE: "formal",
  }), {
    host: "0.0.0.0",
    port: 8080,
    apiBaseUrl: "https://api.company.example",
    mode: "formal",
  });
  assert.throws(() => normalizePublicApiUrl("http://public.example"), /INVALID/);
  assert.throws(() => normalizePublicApiUrl("https://api.example/path"), /INVALID/);
  assert.equal(normalizePublicApiUrl("http://127.0.0.1:4310"), "http://127.0.0.1:4310");
  assert.equal(normalizeReleaseId(`0.1.0-rc.5-${"b".repeat(12)}`),
    `0.1.0-rc.5-${"b".repeat(12)}`);
  assert.throws(() => normalizeReleaseId("latest"), /COMPANY_OS_RELEASE_ID_INVALID/);
});

test("runtime configuration source contains public coordinates but no executable input", () => {
  const source = runtimeConfigSource({
    apiBaseUrl: "https://api.company.example",
    mode: "formal",
  });
  assert.match(source, /Object\.freeze/);
  assert.match(source, /https:\/\/api\.company\.example/);
  assert.doesNotMatch(source, /clientSecret|sessionSigningKey|databaseUrl/);
});

test("static file resolution rejects traversal without depending on prior build output", (context) => {
  const root = mkdtempSync(join(tmpdir(), "company-os-web-static-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "index.html"), "fixture-index");
  writeFileSync(join(root, "package.json"), "fixture-sensitive-file");

  assert.equal(resolveStaticFile(root, "/index.html"), join(root, "index.html"));
  assert.equal(resolveStaticFile(root, "/assets/../index.html"), null);
  assert.equal(resolveStaticFile(root, "/../../package.json"), null);
  assert.equal(resolveStaticFile(root, "/%2e%2e/%2e%2e/package.json"), null);
  assert.equal(resolveStaticFile(root, "/..\\package.json"), null);
});

test("Web responses identify an explicitly deployed immutable release", async (context) => {
  const root = mkdtempSync(join(tmpdir(), "company-os-web-release-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "index.html"), "release-bound-index");
  const releaseId = `0.1.0-rc.5-${"b".repeat(12)}`;
  const server = createCompanyOsWebServer({ distDirectory: root,
    apiBaseUrl: "http://127.0.0.1:4310", releaseId });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  context.after(async () => { server.close(); await once(server, "close"); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS_MISSING");
  const response = await fetch(`http://127.0.0.1:${address.port}/`);
  assert.equal(response.headers.get("x-company-os-release-id"), releaseId);
});
