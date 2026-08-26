import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("staging status CLI loads its TypeScript evaluator in the production Node invocation", () => {
  const result = spawnSync(process.execPath, ["--experimental-strip-types",
    new URL("../scripts/inspect-staging-runtime.mjs", import.meta.url).pathname,
    "--root", "/company-os-status-root-that-does-not-exist"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /ERR_UNKNOWN_FILE_EXTENSION|Unknown file extension/);
  assert.match(result.stderr, /ENOENT/);
});
