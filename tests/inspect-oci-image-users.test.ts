import assert from "node:assert/strict";
import test from "node:test";

import { inspectOciImageUsers } from "../scripts/inspect-oci-image-users.mjs";

const image = `ghcr.io/example/runtime@sha256:${"a".repeat(64)}`;
const passwd = "runtime:x:1001:1002::/nonexistent:/sbin/nologin\n";
const group = "runtime:x:1002:\n";

test("OCI image user inspection binds declared user and account databases to the exact digest", async () => {
  const calls: string[][] = [];
  const result = await inspectOciImageUsers([image], { async run(argv: string[]) {
    calls.push(argv); return { ok: true, stdout: argv.includes("inspect") ? '"runtime"\n' :
      argv.at(-1) === "/etc/passwd" ? passwd : group };
  } });
  assert.deepEqual(result, [{ image, declaredUser: "runtime", passwdContents: passwd, groupContents: group }]);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[1]?.slice(0, 13), ["docker", "run", "--rm", "--pull", "never", "--network", "none",
    "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "--entrypoint"]);
  assert.equal(calls.slice(1).every((call) => call.includes(image)), true);
});

test("OCI image user inspection accepts a tag plus digest immutable reference", async () => {
  const taggedImage = `caddy:2.11.4-alpine@sha256:${"b".repeat(64)}`;
  const result = await inspectOciImageUsers([taggedImage], { async run(argv: string[]) {
    return { ok: true, stdout: argv.includes("inspect") ? '"1000:1000"\n' :
      argv.at(-1) === "/etc/passwd" ? "caddy:x:1000:1000::/:/sbin/nologin\n" : "caddy:x:1000:\n" };
  } });
  assert.equal(result[0]?.image, taggedImage);
  assert.equal(result[0]?.declaredUser, "1000:1000");
});

test("OCI image user inspection rejects mutable and incomplete evidence while retaining explicit-root evidence", async () => {
  await assert.rejects(inspectOciImageUsers(["ghcr.io/example/runtime:latest"], { async run() {
    return { ok: true, stdout: "root" };
  } }), /OCI_IMAGE_USER_IMAGE_SET_INVALID/);
  const explicit = await inspectOciImageUsers([image], { async run(argv: string[]) {
    return { ok: true, stdout: argv.includes("inspect") ? '""\n' : argv.at(-1) === "/etc/passwd" ?
      passwd : group };
  } });
  assert.equal(explicit[0]?.declaredUser, "");
  await assert.rejects(inspectOciImageUsers([image], { async run(argv: string[]) {
    return { ok: !argv.includes("/etc/group"), stdout: argv.includes("inspect") ? '"runtime"\n' : passwd };
  } }), /OCI_IMAGE_USER_ACCOUNT_DATABASE_INSPECTION_FAILED/);
});
