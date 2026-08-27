import assert from "node:assert/strict";
import test from "node:test";

import { PublicDemoRequestLimiter } from "../adapters/http/public-demo-request-limiter.ts";

test("public Demo limiter bounds anonymous session creation per window", () => {
  let now = 1_000;
  const limiter = new PublicDemoRequestLimiter({
    maximumCreationsPerWindow: 2,
    maximumRequestsPerSessionPerWindow: 3,
    windowMilliseconds: 60_000,
    now: () => now,
  });

  limiter.consumeCreation();
  limiter.consumeCreation();
  assert.throws(() => limiter.consumeCreation(), /PUBLIC_DEMO_RATE_LIMITED/);
  now += 60_001;
  assert.doesNotThrow(() => limiter.consumeCreation());
});

test("public Demo limiter isolates opaque session request budgets without retaining tokens", () => {
  const limiter = new PublicDemoRequestLimiter({
    maximumCreationsPerWindow: 2,
    maximumRequestsPerSessionPerWindow: 2,
    windowMilliseconds: 60_000,
    now: () => 1_000,
    hashSessionId: (sessionId) => `digest:${sessionId.length}`,
  });

  limiter.consumeSession("session_A_opaque_0123456789abcdef0123456789");
  limiter.consumeSession("session_A_opaque_0123456789abcdef0123456789");
  assert.throws(
    () => limiter.consumeSession("session_A_opaque_0123456789abcdef0123456789"),
    /PUBLIC_DEMO_RATE_LIMITED/,
  );
  assert.doesNotThrow(
    () => limiter.consumeSession("session_BB_opaque_0123456789abcdef0123456789"),
  );
  assert.deepEqual(limiter.diagnosticKeys(), ["digest:43", "digest:44"]);
});

test("public Demo limiter bounds attacker-controlled session keys", () => {
  const limiter = new PublicDemoRequestLimiter({
    maximumCreationsPerWindow: 2,
    maximumRequestsPerSessionPerWindow: 2,
    maximumTrackedSessions: 2,
    windowMilliseconds: 60_000,
    now: () => 1_000,
    hashSessionId: (sessionId) => `digest:${sessionId}`,
  });

  limiter.consumeSession("first");
  limiter.consumeSession("second");
  assert.throws(() => limiter.consumeSession("attacker-third"), /PUBLIC_DEMO_RATE_LIMITED/);
  assert.equal(limiter.diagnosticKeys().length, 2);
});
