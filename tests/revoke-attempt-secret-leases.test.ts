import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { RevokeAttemptSecretLeases } from "../application/revoke-attempt-secret-leases.ts";
import type { SecretBrokerPort } from "../ports/secret-broker-port.ts";

async function seed(events: InMemoryEventStore) {
  await events.append({ id: "attempt-terminal", companyId: "company-one", type: "work-attempt.recorded",
    occurredAt: "2026-08-25T12:10:00.000Z", actorId: "connector-one", provenance: "PRODUCTION",
    payload: { operation: "COMPLETE", attempt: { id: "attempt-one", companyId: "company-one",
      workId: "work-one", status: "SUCCEEDED" } } }, 0);
  await events.append({ id: "lease-issued", companyId: "company-one", type: "secret.lease-issued",
    occurredAt: "2026-08-25T12:00:01.000Z", actorId: "human-one", provenance: "PRODUCTION",
    payload: { leaseId: "lease-one", secretReferenceId: "secret-one", version: 2,
      consumerId: "connector-one", workAttemptId: "attempt-one", issuedAt: "2026-08-25T12:00:01.000Z",
      expiresAt: "2026-08-25T12:15:00.000Z", attestationDigest: `sha256:${"a".repeat(64)}` } }, 1);
}

test("terminal Attempt automatically revokes each active lease exactly once", async () => {
  const events = new InMemoryEventStore(); await seed(events); const calls: unknown[] = [];
  const broker: SecretBrokerPort = { async describe() { return null; }, async issueLease() {
    return { ok: false, error: { code: "UNUSED", retryable: false } }; },
  async revokeLease(companyId, leaseId, reasonCode) { calls.push({ companyId, leaseId, reasonCode }); } };
  let ids = 0;
  const useCase = new RevokeAttemptSecretLeases({ events, broker,
    now: () => "2026-08-25T12:10:01.000Z", nextId: () => `revocation-${++ids}` });
  assert.deepEqual(await useCase.execute("company-one"), [{ leaseId: "lease-one", status: "REVOKED",
    code: "SECRET_LEASE_REVOKED" }]);
  assert.deepEqual(await useCase.execute("company-one"), []);
  assert.deepEqual(calls, [{ companyId: "company-one", leaseId: "lease-one", reasonCode: "WORK_ATTEMPT_TERMINATED" }]);
  assert.deepEqual((await events.read("company-one")).slice(2).map(({ type }) => type), [
    "secret.lease-revocation-requested", "secret.lease-revoked",
  ]);
});

test("lease revocation persists only a stable failure and applies bounded retry backoff", async () => {
  const events = new InMemoryEventStore(); await seed(events); let calls = 0; let now = "2026-08-25T12:10:01.000Z";
  const broker: SecretBrokerPort = { async describe() { return null; }, async issueLease() {
    return { ok: false, error: { code: "UNUSED", retryable: false } }; },
  async revokeLease() { calls += 1; throw new Error("raw vault stack must not persist"); } };
  let ids = 0;
  const useCase = new RevokeAttemptSecretLeases({ events, broker, now: () => now,
    nextId: () => `revocation-failure-${++ids}` });
  assert.equal((await useCase.execute("company-one"))[0]?.code, "SECRET_LEASE_REVOCATION_FAILED");
  assert.deepEqual(await useCase.execute("company-one"), []);
  assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify(await events.read("company-one")), /raw vault stack/i);
  now = "2026-08-25T12:10:32.000Z";
  assert.equal((await useCase.execute("company-one"))[0]?.status, "RETRY_PENDING");
  assert.equal(calls, 2);
});
