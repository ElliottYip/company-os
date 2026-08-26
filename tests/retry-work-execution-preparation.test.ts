import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import { RetryWorkExecutionPreparation } from "../application/retry-work-execution-preparation.ts";
import { WorkAttemptService } from "../application/work-attempt-service.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

function identity(actorId = "human-one"): IdentityPort {
  return {
    async getCurrentIdentity() {
      return { actorId, organizationId: "company-one", displayName: actorId,
        assurance: "ENTERPRISE_ASSERTED" };
    },
    async currentPrincipal() { return { id: actorId, kind: "HUMAN", displayName: actorId }; },
    async authorize() { return { id: "authorization-one", principalId: actorId,
      authorizedAt: "2026-08-25T10:10:00.000Z" }; },
  };
}

async function seededStore() {
  const store = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-preparation-retry-")));
  const work = { id: "work-one", companyId: "company-one", title: "Prepare report",
    goal: "Prepare the governed customer report.", scope: "AGENT" as const, departmentId: "operations",
    projectId: null, agentId: "agent-one", requestedBy: "human-one",
    actionIds: ["read-knowledge"] as const, parentWorkId: null, accountableHumanId: "human-one",
    responsibilityContractId: "responsibility-one", runtimeConnectorId: "connector-one",
    status: "PENDING" as const };
  await store.append({ id: "event-work", companyId: "company-one", type: "work.dispatched",
    occurredAt: "2026-08-25T10:00:00.000Z", actorId: "human-one", provenance: "PRODUCTION",
    payload: { work } }, 0);
  const plan = { dataAccess: [{ requestId: "request-one", contractId: "data-contract-one",
    dataSourceId: "crm-one", operation: "READ" as const, purpose: "customer-report",
    classification: "CONFIDENTIAL" as const, destinationId: null, contentDigest: null }],
  secretLeases: [{ secretReferenceId: "connector-secret-one", expectedVersion: 2,
    reasonCode: "WORK_EXECUTION", leaseDurationSeconds: 300 }] };
  await store.append({ id: "event-preparation", companyId: "company-one",
    type: "work-execution.preparation-requested", occurredAt: "2026-08-25T10:00:01.000Z",
    actorId: "human-one", correlationId: "work-one", provenance: "PRODUCTION",
    payload: { workId: "work-one", plan } }, 1);
  await new WorkAttemptService(store).create({ draft: { id: "attempt-one", companyId: "company-one",
    workId: "work-one", agentId: "agent-one", attemptNumber: 1, idempotencyKey: "work-one-attempt-one",
    timeoutAt: "2026-08-25T10:30:00.000Z", createdAt: "2026-08-25T10:00:02.000Z",
    authority: { responsibilityContractId: "responsibility-one", responsibilityContractRevision: 1,
      accountableHumanId: "human-one", actionIds: ["read-knowledge"], permissionIds: ["work-authorization"],
      dataAuthorizationIds: ["data-contract-one"], connectorId: "connector-one",
      connectorCapabilityDigest: `sha256:${"a".repeat(64)}` } },
  eventId: "event-attempt", publicationId: "publication-submit", actorId: "human-one",
  expectedEventSequence: 2 });
  return { store, work, plan };
}

test("the original human can resume a crash-interrupted preparation before pending delivery", async () => {
  const { store } = await seededStore();
  const calls: string[] = [];
  const service = new RetryWorkExecutionPreparation({
    identity: identity(), store,
    preparation: { async execute(input) {
      calls.push("prepare");
      return { workId: input.work.id, workAttemptId: input.attempt.id,
        dataAuthorizationReferences: ["data-contract-one"], governedDataReferences: ["data-reference-one"],
        dataEvidenceReferences: ["data-evidence-one"], executionGrantReferences: ["grant-one"],
        recordedAt: "2026-08-25T10:10:00.000Z" };
    } },
    delivery: { async execute(companyId) { calls.push(`deliver:${companyId}`); return [{ status: "DELIVERED" }]; } },
  });
  const result = await service.execute({ companyId: "company-one", workId: "work-one", attemptId: "attempt-one" });
  assert.deepEqual(calls, ["prepare", "deliver:company-one"]);
  assert.equal(result.preparation.workAttemptId, "attempt-one");
  assert.equal((result.connectorDelivery[0] as { status: string }).status, "DELIVERED");
});

test("a different company human cannot resume the initiator's preparation", async () => {
  const { store } = await seededStore();
  let called = false;
  const service = new RetryWorkExecutionPreparation({ identity: identity("human-two"), store,
    preparation: { async execute() { called = true; throw new Error("must not run"); } },
    delivery: { async execute() { called = true; return []; } } });
  await assert.rejects(service.execute({ companyId: "company-one", workId: "work-one",
    attemptId: "attempt-one" }), /WORK_PREPARATION_INITIATOR_REQUIRED/);
  assert.equal(called, false);
});
