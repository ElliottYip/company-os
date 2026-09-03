import assert from "node:assert/strict";
import test from "node:test";
import { TenantSignupRequestLimiter } from "../adapters/http/tenant-signup-request-limiter.ts";

test("tenant signup limiter bounds credential verification work and resets by window", () => {
  let now = 1_000;
  const limiter = new TenantSignupRequestLimiter({
    maximumRequestsPerWindow: 2, windowMilliseconds: 1_000, now: () => now,
  });
  limiter.consume("client-a");
  limiter.consume("client-a");
  assert.throws(() => limiter.consume("client-a"), /TENANT_SIGNUP_RATE_LIMITED/);
  assert.doesNotThrow(() => limiter.consume("client-b"));
  now = 2_000;
  assert.doesNotThrow(() => limiter.consume("client-a"));
});

test("tenant signup limiter bounds its per-client state", () => {
  const limiter = new TenantSignupRequestLimiter({ maximumRequestsPerWindow: 2, maximumKeys: 1 });
  limiter.consume("client-a");
  assert.throws(() => limiter.consume("client-b"), /TENANT_SIGNUP_RATE_LIMITED/);
});
