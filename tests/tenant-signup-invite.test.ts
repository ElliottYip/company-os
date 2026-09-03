import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { createTenantSignupInviteGate } from
  "../adapters/security/tenant-signup-invite-gate.ts";

const CODE = "COS-23456-789AB-CDEFG-HJKLM";
const KEY = Buffer.alloc(32, 7);

function digest(code: string): `hmac-sha256:${string}` {
  return `hmac-sha256:${createHmac("sha256", KEY)
    .update("company-os/tenant-signup-invite/v1\0")
    .update(code)
    .digest("hex")}`;
}

test("tenant signup invitation codes are normalized and matched by HMAC only", () => {
  const gate = createTenantSignupInviteGate({ key: KEY, allowedDigests: new Set([digest(CODE)]) });
  assert.equal(gate.verify(`  ${CODE.toLowerCase()}  `), digest(CODE));
  assert.throws(() => gate.verify("COS-23456-789AB-CDEFG-HJKLN"), /TENANT_SIGNUP_NOT_ALLOWED/);
  assert.doesNotMatch(JSON.stringify(gate), /COS-/);
});

test("tenant signup invitation configuration rejects weak keys and malformed digests", () => {
  assert.throws(() => createTenantSignupInviteGate({
    key: Buffer.alloc(16), allowedDigests: new Set([digest(CODE)]),
  }), /TENANT_SIGNUP_INVITE_KEY_INVALID/);
  assert.throws(() => createTenantSignupInviteGate({
    key: KEY, allowedDigests: new Set(["sha256:not-an-invite"]),
  }), /TENANT_SIGNUP_INVITE_DIGEST_INVALID/);
});
