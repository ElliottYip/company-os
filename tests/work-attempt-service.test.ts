import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import { WorkAttemptService } from "../application/work-attempt-service.ts";

function draft() {
  return {
    id: "attempt-one", companyId: "company-one", workId: "work-one", agentId: "agent-one",
    attemptNumber: 1, idempotencyKey: "work-one:attempt-one",
    timeoutAt: "2026-08-20T10:30:00.000Z", createdAt: "2026-08-20T10:00:00.000Z",
    authority: {
      responsibilityContractId: "contract-one", responsibilityContractRevision: 1,
      accountableHumanId: "human-one", actionIds: ["read-knowledge"], permissionIds: ["permission-one"],
      dataAuthorizationIds: ["data-contract-one"], connectorId: "connector-one",
      connectorCapabilityDigest: `sha256:${"a".repeat(64)}`,
    },
  } as const;
}

test("attempt state and secret-free connector command survive service restart atomically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-attempt-service-"));
  const store = new LocalDurableControlPlaneStore(directory);
  const service = new WorkAttemptService(store);
  await service.create({
    draft: draft(), eventId: "event-create", publicationId: "publication-submit",
    actorId: "human-one", expectedEventSequence: 0,
  });

  const pending = await store.readPendingPublications("company-one", { afterSequence: 0, limit: 10 });
  assert.equal(pending.length, 1);
  assert.deepEqual(pending[0]?.payload, {
    schemaVersion: 1, operation: "SUBMIT", attemptId: "attempt-one", workId: "work-one",
    agentId: "agent-one", connectorId: "connector-one", idempotencyKey: "work-one:attempt-one",
  });
  assert.doesNotMatch(JSON.stringify(pending[0]), /credential|secret|session|reasoning/i);

  const restarted = new WorkAttemptService(new LocalDurableControlPlaneStore(directory));
  assert.equal((await restarted.load("company-one", "attempt-one"))?.status, "QUEUED");
  await restarted.transition({
    companyId: "company-one", attemptId: "attempt-one", operation: "ACQUIRE_LEASE",
    lease: { ownerId: "worker-one", fencingToken: 1, acquiredAt: "2026-08-20T10:01:00.000Z", expiresAt: "2026-08-20T10:05:00.000Z" },
    eventId: "event-lease", actorId: "worker-one", occurredAt: "2026-08-20T10:01:00.000Z",
    expectedEventSequence: 1,
  });
  const running = await restarted.transition({
    companyId: "company-one", attemptId: "attempt-one", operation: "START",
    fencingToken: 1, eventId: "event-start", actorId: "worker-one",
    occurredAt: "2026-08-20T10:01:01.000Z", expectedEventSequence: 2,
  });
  assert.equal(running.status, "RUNNING");

  await assert.rejects(restarted.transition({
    companyId: "company-one", attemptId: "attempt-one", operation: "CANCEL",
    fencingToken: 1, eventId: "event-stale", publicationId: "publication-stale",
    actorId: "worker-one", occurredAt: "2026-08-20T10:02:00.000Z", expectedEventSequence: 2,
  }), /sequence conflict/i);
  assert.equal((await restarted.load("company-one", "attempt-one"))?.status, "RUNNING");
  assert.equal((await store.readPendingPublications("company-one", { afterSequence: 1, limit: 10 })).length, 0);

  await restarted.transition({
    companyId: "company-one", attemptId: "attempt-one", operation: "PAUSE", fencingToken: 1,
    approvalRequestId: "approval-one", eventId: "event-pause", publicationId: "publication-pause",
    actorId: "worker-one", occurredAt: "2026-08-20T10:02:01.000Z", expectedEventSequence: 3,
  });
  await restarted.transition({
    companyId: "company-one", attemptId: "attempt-one", operation: "RESUME", fencingToken: 1,
    approvalRequestId: "approval-one", eventId: "event-resume", publicationId: "publication-resume",
    actorId: "human-one", occurredAt: "2026-08-20T10:02:02.000Z", expectedEventSequence: 4,
  });
  const approvalCommands = await store.readPendingPublications("company-one", { afterSequence: 1, limit: 10 });
  assert.deepEqual(approvalCommands.map(({ payload }) => payload), [
    {
      schemaVersion: 1, operation: "PAUSE", attemptId: "attempt-one", workId: "work-one",
      agentId: "agent-one", connectorId: "connector-one", idempotencyKey: "work-one:attempt-one",
      approvalRequestId: "approval-one",
    },
    {
      schemaVersion: 1, operation: "RESUME", attemptId: "attempt-one", workId: "work-one",
      agentId: "agent-one", connectorId: "connector-one", idempotencyKey: "work-one:attempt-one",
      approvalRequestId: "approval-one",
    },
  ]);
});

test("unknown outcomes require evidence-backed reconciliation after durable timeout", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-attempt-service-"));
  const store = new LocalDurableControlPlaneStore(directory);
  const service = new WorkAttemptService(store);
  await service.create({ draft: draft(), eventId: "event-create", publicationId: "publication-submit", actorId: "human-one", expectedEventSequence: 0 });
  await service.transition({
    companyId: "company-one", attemptId: "attempt-one", operation: "ACQUIRE_LEASE",
    lease: { ownerId: "worker-one", fencingToken: 1, acquiredAt: "2026-08-20T10:01:00.000Z", expiresAt: "2026-08-20T10:05:00.000Z" },
    eventId: "event-lease", actorId: "worker-one", occurredAt: "2026-08-20T10:01:00.000Z", expectedEventSequence: 1,
  });
  await service.transition({ companyId: "company-one", attemptId: "attempt-one", operation: "START", fencingToken: 1, eventId: "event-start", actorId: "worker-one", occurredAt: "2026-08-20T10:01:01.000Z", expectedEventSequence: 2 });
  const unknown = await service.transition({ companyId: "company-one", attemptId: "attempt-one", operation: "TIME_OUT", eventId: "event-timeout", actorId: "system", occurredAt: "2026-08-20T10:31:00.000Z", expectedEventSequence: 3 });
  assert.equal(unknown.status, "OUTCOME_UNKNOWN");
  const reconciled = await service.transition({
    companyId: "company-one", attemptId: "attempt-one", operation: "RECONCILE",
    reconciliation: { resolution: "CONFIRMED_FAILED", resolvedBy: "human-one", evidenceId: "evidence-one", resolvedAt: "2026-08-20T10:32:00.000Z" },
    eventId: "event-reconcile", actorId: "human-one", occurredAt: "2026-08-20T10:32:00.000Z", expectedEventSequence: 4,
  });
  assert.equal(reconciled.status, "FAILED");
  assert.equal(reconciled.reconciliation?.evidenceId, "evidence-one");
});
