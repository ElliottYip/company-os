import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("staging start CLI loads its TypeScript boundary in the production Node 22 invocation", () => {
  const result = spawnSync(process.execPath, ["--experimental-strip-types",
    new URL("../scripts/start-staging-release.mjs", import.meta.url).pathname,
    "--root", "/company-os-test-root-that-does-not-exist",
    "--release", `0.1.0-rc.1-${"a".repeat(12)}`,
    "--authorization", "change:synthetic-cli-admission",
    "--public-env-file", "/company-os-test-env-that-does-not-exist",
    "--secret-directory", "/company-os-test-secrets-that-do-not-exist"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /ERR_UNKNOWN_FILE_EXTENSION|Unknown file extension/);
  assert.match(result.stderr, /ENOENT/);
});
