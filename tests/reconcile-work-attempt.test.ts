import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import { ReconcileWorkAttempt } from "../application/reconcile-work-attempt.ts";
import { WorkAttemptService } from "../application/work-attempt-service.ts";

const identity = { async getCurrentIdentity() { return { actorId: "human-one", organizationId: "company-one",
  displayName: "Human", assurance: "ENTERPRISE_ASSERTED" as const }; }, async currentPrincipal() { return null; },
  async authorize() { return { id: "authorization-one", principalId: "human-one", authorizedAt: "2026-08-25T10:32:00.000Z" }; } };

async function unknown(store: LocalDurableControlPlaneStore, suffix: string) {
  const service = new WorkAttemptService(store); const attemptId = `attempt-${suffix}`; const workId = `work-${suffix}`;
  await service.create({ draft: { id: attemptId, companyId: "company-one", workId, agentId: "agent-one",
    attemptNumber: 1, idempotencyKey: suffix, createdAt: "2026-08-25T10:00:00.000Z",
    timeoutAt: "2026-08-25T10:30:00.000Z", authority: { responsibilityContractId: "contract-one",
      responsibilityContractRevision: 1, accountableHumanId: "human-one", actionIds: ["read"], permissionIds: [],
      dataAuthorizationIds: [], connectorId: "connector-one", connectorCapabilityDigest: `sha256:${"a".repeat(64)}` } },
    eventId: `create-${suffix}`, publicationId: `submit-${suffix}`, actorId: "human-one",
    expectedEventSequence: (await store.read("company-one")).length });
  await service.transition({ companyId: "company-one", attemptId, operation: "ACQUIRE_LEASE",
    lease: { ownerId: "connector-one", fencingToken: 1, acquiredAt: "2026-08-25T10:01:00.000Z", expiresAt: "2026-08-25T10:20:00.000Z" },
    eventId: `lease-${suffix}`, actorId: "connector-one", occurredAt: "2026-08-25T10:01:00.000Z",
    expectedEventSequence: (await store.read("company-one")).length });
  await service.transition({ companyId: "company-one", attemptId, operation: "START", fencingToken: 1,
    eventId: `start-${suffix}`, actorId: "connector-one", occurredAt: "2026-08-25T10:01:01.000Z",
    expectedEventSequence: (await store.read("company-one")).length });
  await service.transition({ companyId: "company-one", attemptId, operation: "TIME_OUT",
    eventId: `timeout-${suffix}`, actorId: "system", occurredAt: "2026-08-25T10:31:00.000Z",
    expectedEventSequence: (await store.read("company-one")).length });
  return { attemptId, workId };
}

test("unknown outcome reconciliation requires admitted, work-bound production evidence and is idempotent", async () => {
  const store = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-reconcile-")));
  const target = await unknown(store, "one"); let ids = 0;
  const useCase = new ReconcileWorkAttempt({ identity, store, now: () => "2026-08-25T10:32:00.000Z",
    nextId: () => `reconciliation-${++ids}` });
  await assert.rejects(useCase.execute({ companyId: "company-one", ...target,
    resolution: "CONFIRMED_FAILED", evidenceId: "missing-evidence" }), /EVIDENCE_NOT_FOUND/);
  await store.append({ id: "evidence-event", companyId: "company-one", type: "evidence.persisted",
    occurredAt: "2026-08-25T10:31:30.000Z", actorId: "audit-evidence-adapter", provenance: "PRODUCTION",
    correlationId: target.workId, payload: { record: { id: "evidence-one", workId: target.workId, kind: "ARTIFACT",
      summary: "External failure receipt", contentDigest: `sha256:${"b".repeat(64)}`,
      recordedAt: "2026-08-25T10:31:30.000Z", provenance: "PRODUCTION" } } },
    (await store.read("company-one")).length);
  const reconciled = await useCase.execute({ companyId: "company-one", ...target,
    resolution: "CONFIRMED_FAILED", evidenceId: "evidence-one" });
  assert.equal(reconciled.status, "FAILED");
  assert.equal(reconciled.reconciliation?.resolvedBy, "human-one");
  assert.equal((await useCase.execute({ companyId: "company-one", ...target,
    resolution: "CONFIRMED_FAILED", evidenceId: "evidence-one" })).id, target.attemptId);
  await assert.rejects(useCase.execute({ companyId: "company-one", ...target,
    resolution: "SAFE_TO_RETRY", evidenceId: "evidence-one" }), /RECONCILIATION_CONFLICT/);
});
