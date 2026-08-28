import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const indexPath = new URL("../web/dist/index.html", import.meta.url);
const html = await readFile(indexPath, "utf8");
const runtimeConfig = html.indexOf('src="/company-os-config.js"');
const moduleScript = html.search(/<script\b[^>]*\btype="module"[^>]*\bsrc=/);

assert.notEqual(runtimeConfig, -1, "BUILT_WEB_RUNTIME_CONFIG_SCRIPT_MISSING");
assert.notEqual(moduleScript, -1, "BUILT_WEB_MODULE_SCRIPT_MISSING");
assert.ok(
  runtimeConfig < moduleScript,
  "BUILT_WEB_RUNTIME_CONFIG_MUST_PRECEDE_MODULE",
);

console.log("Built Web loads runtime configuration before the application module.");
