import assert from "node:assert/strict";
import test from "node:test";
import { dropRuntimePrivileges, type RuntimeIdentityProcess } from
  "../adapters/security/runtime-privilege-drop.ts";

function fakeRuntime(uid = 0, gid = 0) {
  const calls: string[] = [];
  let currentUid = uid;
  let currentGid = gid;
  const runtime: RuntimeIdentityProcess = {
    getuid: () => currentUid,
    getgid: () => currentGid,
    setgroups: (groups) => calls.push(`groups:${groups.join(",")}`),
    setgid: (next) => { calls.push(`gid:${next}`); currentGid = next; },
    setuid: (next) => { calls.push(`uid:${next}`); currentUid = next; },
  };
  return { runtime, calls };
}

test("drops supplementary groups, gid and uid after root-only bootstrap", () => {
  const { runtime, calls } = fakeRuntime();
  dropRuntimePrivileges({ COMPANY_OS_RUNTIME_UID: "1000", COMPANY_OS_RUNTIME_GID: "1000" }, runtime);
  assert.deepEqual(calls, ["groups:", "gid:1000", "uid:1000"]);
  assert.equal(runtime.getuid?.(), 1000);
  assert.equal(runtime.getgid?.(), 1000);
});

test("is a no-op when disabled or already running as the target identity", () => {
  const disabled = fakeRuntime();
  dropRuntimePrivileges({}, disabled.runtime);
  assert.deepEqual(disabled.calls, []);
  const alreadyDropped = fakeRuntime(1000, 1000);
  dropRuntimePrivileges({ COMPANY_OS_RUNTIME_UID: "1000", COMPANY_OS_RUNTIME_GID: "1000" }, alreadyDropped.runtime);
  assert.deepEqual(alreadyDropped.calls, []);
});

test("fails closed for incomplete, invalid or non-root transitions", () => {
  assert.throws(() => dropRuntimePrivileges({ COMPANY_OS_RUNTIME_UID: "1000" }, fakeRuntime().runtime),
    /IDENTITY_INCOMPLETE/);
  assert.throws(() => dropRuntimePrivileges({ COMPANY_OS_RUNTIME_UID: "0", COMPANY_OS_RUNTIME_GID: "1000" },
    fakeRuntime().runtime), /RUNTIME_UID_INVALID/);
  assert.throws(() => dropRuntimePrivileges({ COMPANY_OS_RUNTIME_UID: "1000", COMPANY_OS_RUNTIME_GID: "1000" },
    fakeRuntime(1001, 1001).runtime), /PRIVILEGE_DROP_FORBIDDEN/);
});
