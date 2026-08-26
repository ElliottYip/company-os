import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import { RecoverExpiredWorkAttempts } from "../application/recover-expired-work-attempts.ts";
import { WorkAttemptService } from "../application/work-attempt-service.ts";

const digest = `sha256:${"a".repeat(64)}`;

async function createAttempt(
  store: LocalDurableControlPlaneStore,
  id: string,
  timeoutAt: string,
) {
  const attempts = new WorkAttemptService(store);
  await attempts.create({
    draft: {
      id, companyId: "company-one", workId: `work-${id}`, agentId: "agent-one",
      attemptNumber: 1, idempotencyKey: id, createdAt: "2026-08-25T10:00:00.000Z", timeoutAt,
      authority: { responsibilityContractId: "contract-one", responsibilityContractRevision: 1,
        accountableHumanId: "human-one", actionIds: ["read"], permissionIds: [], dataAuthorizationIds: [],
        connectorId: "connector-one", connectorCapabilityDigest: digest },
    },
    eventId: `create-${id}`, publicationId: `submit-${id}`, actorId: "human-one",
    expectedEventSequence: (await store.read("company-one")).length,
  });
  return attempts;
}

test("recovery marks possibly side-effecting expired work unknown and never retries it", async () => {
  const store = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-expiry-")));
  const attempts = await createAttempt(store, "attempt-running", "2026-08-25T10:30:00.000Z");
  await attempts.transition({ companyId: "company-one", attemptId: "attempt-running", operation: "ACQUIRE_LEASE",
    lease: { ownerId: "connector-one", fencingToken: 1, acquiredAt: "2026-08-25T10:01:00.000Z",
      expiresAt: "2026-08-25T10:20:00.000Z" }, eventId: "lease-running", actorId: "connector-one",
    occurredAt: "2026-08-25T10:01:00.000Z", expectedEventSequence: (await store.read("company-one")).length });
  await attempts.transition({ companyId: "company-one", attemptId: "attempt-running", operation: "START",
    fencingToken: 1, eventId: "start-running", actorId: "connector-one",
    occurredAt: "2026-08-25T10:01:01.000Z", expectedEventSequence: (await store.read("company-one")).length });
  let ids = 0;
  const recovery = new RecoverExpiredWorkAttempts({ store, now: () => "2026-08-25T10:31:00.000Z",
    nextId: () => `recovery-${++ids}` });
  assert.deepEqual(await recovery.execute("company-one"), [{ attemptId: "attempt-running",
    operation: "TIME_OUT", status: "OUTCOME_UNKNOWN" }]);
  assert.equal((await attempts.load("company-one", "attempt-running"))?.status, "OUTCOME_UNKNOWN");
  assert.deepEqual(await recovery.execute("company-one"), []);
  const events = await store.read("company-one", { types: ["work-attempt.recorded"] });
  assert.equal(events.filter(({ payload }) =>
    (payload as { operation?: string }).operation === "TIME_OUT").length, 1);
});

test("recovery requeues an unstarted expired lease and times out never-delivered work", async () => {
  const store = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-expiry-")));
  const attempts = await createAttempt(store, "attempt-leased", "2026-08-25T10:30:00.000Z");
  await createAttempt(store, "attempt-queued", "2026-08-25T10:05:00.000Z");
  await attempts.transition({ companyId: "company-one", attemptId: "attempt-leased", operation: "ACQUIRE_LEASE",
    lease: { ownerId: "connector-one", fencingToken: 1, acquiredAt: "2026-08-25T10:01:00.000Z",
      expiresAt: "2026-08-25T10:02:00.000Z" }, eventId: "lease-leased", actorId: "connector-one",
    occurredAt: "2026-08-25T10:01:00.000Z", expectedEventSequence: (await store.read("company-one")).length });
  let ids = 0;
  const recovery = new RecoverExpiredWorkAttempts({ store, now: () => "2026-08-25T10:10:00.000Z",
    nextId: () => `recovery-${++ids}` });
  assert.deepEqual(await recovery.execute("company-one"), [
    { attemptId: "attempt-leased", operation: "EXPIRE_LEASE", status: "QUEUED" },
    { attemptId: "attempt-queued", operation: "TIME_OUT", status: "TIMED_OUT" },
  ]);
});
