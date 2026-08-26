import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePublicApiUrl,
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

test("static file resolution cannot escape the built Web root", () => {
  assert.equal(resolveStaticFile("web/dist", "/assets/../index.html")?.endsWith("/web/dist/index.html"), true);
  assert.equal(resolveStaticFile("web/dist", "/../../package.json"), null);
  assert.equal(resolveStaticFile("web/dist", "/%2e%2e/%2e%2e/package.json"), null);
  assert.equal(resolveStaticFile("web/dist", "/..\\package.json"), null);
});
