import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("staging doctor public environment flag reaches the script instead of Node option parsing", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "company-os-staging-doctor-cli-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const root = join(temporary, "staging"); const secrets = join(temporary, "secrets");
  await mkdir(root); await chmod(root, 0o750);
  await mkdir(secrets); await chmod(secrets, 0o700);

  const result = spawnSync(process.execPath, ["--experimental-strip-types",
    "scripts/staging-deployment-doctor.ts", "--root", root,
    "--secret-directory", secrets, "--public-env-file", join(root, "missing.env")], {
    cwd: new URL("../", import.meta.url), encoding: "utf8",
  });

  assert.equal(result.status, 2, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "NOT_READY");
  assert.doesNotMatch(result.stderr, /node: .*missing\.env: not found/);
});
