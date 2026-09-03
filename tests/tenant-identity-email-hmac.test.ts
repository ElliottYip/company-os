import assert from "node:assert/strict";
import test from "node:test";
import { tenantAssertedEmailHmac } from "../adapters/security/tenant-identity-email-hmac.ts";

test("asserted email HMAC is normalized, tenant-bound, and key-bound", () => {
  const key = Buffer.alloc(32, 1);
  const tenantDigest = `sha256:${"a".repeat(64)}`;
  const first = tenantAssertedEmailHmac({ key, tenantDigest, email: " Human@Example.COM " });
  assert.match(first, /^hmac-sha256:[a-f0-9]{64}$/);
  assert.equal(first, tenantAssertedEmailHmac({ key, tenantDigest, email: "human@example.com" }));
  assert.notEqual(first, tenantAssertedEmailHmac({
    key, tenantDigest: `sha256:${"b".repeat(64)}`, email: "human@example.com",
  }));
  assert.notEqual(first, tenantAssertedEmailHmac({
    key: Buffer.alloc(32, 2), tenantDigest, email: "human@example.com",
  }));
});

test("asserted email HMAC rejects malformed context", () => {
  assert.throws(() => tenantAssertedEmailHmac({
    key: Buffer.alloc(31), tenantDigest: `sha256:${"a".repeat(64)}`, email: "human@example.com",
  }), /TENANT_EMAIL_HMAC_CONTEXT_INVALID/);
  assert.throws(() => tenantAssertedEmailHmac({
    key: Buffer.alloc(32), tenantDigest: `sha256:${"a".repeat(64)}`, email: "not-email",
  }), /TENANT_EMAIL_HMAC_EMAIL_INVALID/);
});
