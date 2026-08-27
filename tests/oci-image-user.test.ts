import assert from "node:assert/strict";
import test from "node:test";

import { createOciImageUserResolver, resolveOciImageUser } from
  "../adapters/config/oci-image-user.ts";

const passwd = [
  "root:x:0:0:root:/root:/bin/sh",
  "dex:x:1001:1002:Dex:/srv/dex:/sbin/nologin",
  "agent:x:1003:1004:Agent:/srv/agent:/sbin/nologin",
  "",
].join("\n");
const groups = [
  "root:x:0:",
  "dex:x:1002:",
  "agent:x:1004:",
  "runtime:x:2000:",
  "",
].join("\n");

test("OCI image user resolves names and the passwd primary group", () => {
  assert.deepEqual(resolveOciImageUser("dex", passwd, groups), { uid: 1001, gid: 1002 });
});

test("OCI image user resolves numeric and explicit user/group forms", () => {
  assert.deepEqual(resolveOciImageUser("1001", passwd, groups), { uid: 1001, gid: 1002 });
  assert.deepEqual(resolveOciImageUser("dex:runtime", passwd, groups), { uid: 1001, gid: 2000 });
  assert.deepEqual(resolveOciImageUser("1003:2000", passwd, groups), { uid: 1003, gid: 2000 });
});

test("OCI image user rejects implicit or explicit root identity", () => {
  assert.throws(() => resolveOciImageUser("root", passwd, groups), /OCI_IMAGE_USER_ROOT_OR_RANGE_INVALID/);
  assert.throws(() => resolveOciImageUser("dex:root", passwd, groups), /OCI_IMAGE_USER_ROOT_OR_RANGE_INVALID/);
  assert.throws(() => resolveOciImageUser("0:1002", passwd, groups), /OCI_IMAGE_USER_ROOT_OR_RANGE_INVALID/);
});

test("OCI image user refuses missing and ambiguous account data", () => {
  assert.throws(() => resolveOciImageUser("missing", passwd, groups),
    /OCI_IMAGE_USER_NOT_FOUND_OR_AMBIGUOUS/);
  assert.throws(() => resolveOciImageUser("dex:missing", passwd, groups),
    /OCI_IMAGE_GROUP_NOT_FOUND_OR_AMBIGUOUS/);
  assert.throws(() => resolveOciImageUser("dex", `${passwd}dex:x:2001:2001::/:/bin/false\n`, groups),
    /OCI_IMAGE_USER_NOT_FOUND_OR_AMBIGUOUS/);
  assert.throws(() => resolveOciImageUser("dex:runtime", passwd, `${groups}runtime:x:2001:\n`),
    /OCI_IMAGE_GROUP_NOT_FOUND_OR_AMBIGUOUS/);
});

test("OCI image user rejects malformed declarations and account databases", () => {
  for (const value of ["", " dex", "dex ", ":dex", "dex:", "dex:runtime:extra", "dex\0runtime"]) {
    assert.throws(() => resolveOciImageUser(value, passwd, groups), /OCI_IMAGE_USER_DECLARATION_INVALID/);
  }
  assert.throws(() => resolveOciImageUser("dex", "broken\n", groups), /OCI_IMAGE_PASSWD_INVALID/);
  assert.throws(() => resolveOciImageUser("dex", passwd, "broken\n"), /OCI_IMAGE_GROUP_INVALID/);
});

test("OCI inspection resolver binds each result to an exact immutable image reference", () => {
  const image = `ghcr.io/example/runtime@sha256:${"a".repeat(64)}`;
  const resolve = createOciImageUserResolver([{ image, declaredUser: "dex", passwdContents: passwd,
    groupContents: groups }]);
  assert.deepEqual(resolve(image), { uid: 1001, gid: 1002 });
  assert.deepEqual(resolve(image, "1001:2000"), { uid: 1001, gid: 2000 });
  assert.throws(() => resolve(`ghcr.io/example/runtime@sha256:${"b".repeat(64)}`),
    /OCI_IMAGE_USER_INSPECTION_MISSING/);
  assert.throws(() => createOciImageUserResolver([
    { image, declaredUser: "dex", passwdContents: passwd, groupContents: groups },
    { image, declaredUser: "agent", passwdContents: passwd, groupContents: groups },
  ]), /OCI_IMAGE_USER_INSPECTION_INVALID/);
  assert.throws(() => createOciImageUserResolver([{ image: "ghcr.io/example/runtime:latest",
    declaredUser: "dex", passwdContents: passwd, groupContents: groups }]),
  /OCI_IMAGE_USER_INSPECTION_INVALID/);
});
