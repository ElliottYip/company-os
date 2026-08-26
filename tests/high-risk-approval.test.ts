import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { EventBackedApprovalStore } from "../adapters/storage/event-backed-approval-store.ts";
import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import { DecideHighRiskAction } from "../application/decide-high-risk-action.ts";
import { CollectConnectorObservations } from "../application/collect-connector-observations.ts";
import { WorkAttemptService } from "../application/work-attempt-service.ts";
import type { CompanyDomainEvent } from "../core/control-plane.ts";
import type { ApprovalDecision, ApprovalRequest } from "../ports/approval-publication-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

const request: ApprovalRequest = {
  id: "approval-one",
  companyId: "company-one",
  binding: {
    action: {
      id: "action-one",
      type: "publish-content",
      description: "Publish the approved brief",
      inputDigest: "sha256:exact-input",
      risk: "HIGH",
    },
    workId: "work-one",
    responsibilityContractId: "contract-one",
    executingAgentId: "agent-one",
    accountableHumanId: "human-one",
    evidenceReferences: ["evidence-one"],
    resultReference: "result-one",
  },
  requestedAt: "2026-08-18T08:00:00.000Z",
  expiresAt: "2026-08-18T09:00:00.000Z",
  status: "AWAITING_APPROVAL",
};

function harness(actorId = "human-one", organizationId = "company-one") {
  const decisions: ApprovalDecision[] = [];
  const events: CompanyDomainEvent[] = [];
  const identity: IdentityPort = {
    async getCurrentIdentity() {
      return { actorId, organizationId, displayName: actorId, assurance: "ENTERPRISE_ASSERTED" };
    },
    async currentPrincipal() {
      return { id: actorId, kind: "HUMAN", displayName: actorId };
    },
    async authorize(intent) {
      return {
        id: "authorization-one",
        principalId: actorId,
        authorizedAt: "2026-08-18T08:30:00.000Z",
      };
    },
  };
  const useCase = new DecideHighRiskAction({
    identity,
    approvals: {
      async publishRequest() {},
      async pending(companyId) { return companyId === request.companyId ? [request] : []; },
      async publishDecision(decision) { decisions.push(decision); },
      async decision() { return decisions[0] ?? null; },
    },
    events: {
      async append(event) { events.push(event); return { sequence: events.length, storedAt: event.occurredAt }; },
      async read() { return events; },
      async resetFixture() { throw new Error("not a fixture"); },
    },
    now: () => "2026-08-18T08:30:00.000Z",
    nextId: () => "event-approval-one",
  });
  return { useCase, decisions, events };
}

test("accountable human can decide only the exact bound high-risk action", async () => {
  const { useCase, decisions, events } = harness();
  await useCase.execute({
    companyId: "company-one",
    requestId: "approval-one",
    expectedBinding: request.binding,
    decision: "APPROVED",
  });

  assert.equal(decisions[0]?.decidedBy, "human-one");
  assert.equal(events[0]?.type, "approval.decided");
  assert.deepEqual(events[0]?.payload, {
    requestId: "approval-one",
    decision: "APPROVED",
    authorizationReceiptId: "authorization-one",
    binding: request.binding,
  });
});

test("approval fails closed for cross-tenant identity, wrong human, or changed digest", async () => {
  const crossTenant = harness("human-one", "company-two");
  await assert.rejects(
    crossTenant.useCase.execute({
      companyId: "company-one",
      requestId: "approval-one",
      expectedBinding: request.binding,
      decision: "APPROVED",
    }),
    /TENANT_MISMATCH/,
  );

  const outsider = harness("human-two");
  await assert.rejects(
    outsider.useCase.execute({
      companyId: "company-one",
      requestId: "approval-one",
      expectedBinding: request.binding,
      decision: "APPROVED",
    }),
    /APPROVAL_REQUIRES_ACCOUNTABLE_HUMAN/,
  );

  const changed = structuredClone(request.binding);
  changed.action.inputDigest = "sha256:changed-input";
  const mismatch = harness();
  await assert.rejects(
    mismatch.useCase.execute({
      companyId: "company-one",
      requestId: "approval-one",
      expectedBinding: changed,
      decision: "APPROVED",
    }),
    /APPROVAL_BINDING_MISMATCH/,
  );
  assert.equal(mismatch.decisions.length, 0);
});

test("rejected exact approval requests Connector cancellation without claiming a terminal outcome", async () => {
  const store = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-rejected-approval-")));
  const attempts = new WorkAttemptService(store);
  let id = 0; const nextId = () => `rejection-${++id}`;
  const draft = { id: "attempt-rejected", companyId: "company-one", workId: "work-one", agentId: "agent-one",
    attemptNumber: 1, idempotencyKey: "work-one:v1", createdAt: "2026-08-18T08:00:00.000Z",
    timeoutAt: "2026-08-18T09:00:00.000Z", authority: { responsibilityContractId: "contract-one",
      responsibilityContractRevision: 1, accountableHumanId: "human-one", actionIds: ["action-one"],
      permissionIds: [], dataAuthorizationIds: [], connectorId: "connector-one",
      connectorCapabilityDigest: `sha256:${"a".repeat(64)}` } } as const;
  await attempts.create({ draft, eventId: nextId(), publicationId: nextId(), actorId: "human-one", expectedEventSequence: 0 });
  await attempts.transition({ operation: "ACQUIRE_LEASE", companyId: "company-one", attemptId: draft.id,
    eventId: nextId(), actorId: "connector-one", occurredAt: "2026-08-18T08:01:00.000Z", expectedEventSequence: 1,
    lease: { ownerId: "connector-one", fencingToken: 1, acquiredAt: "2026-08-18T08:01:00.000Z",
      expiresAt: "2026-08-18T08:59:00.000Z" } });
  await attempts.transition({ operation: "START", companyId: "company-one", attemptId: draft.id,
    eventId: nextId(), actorId: "connector-one", occurredAt: "2026-08-18T08:02:00.000Z",
    expectedEventSequence: 2, fencingToken: 1 });
  const approvals = new EventBackedApprovalStore(store, "company-one", nextId, () => "2026-08-18T08:30:00.000Z");
  await approvals.publishRequest(request);
  await attempts.transition({ operation: "PAUSE", companyId: "company-one", attemptId: draft.id,
    eventId: nextId(), publicationId: nextId(), actorId: "connector-one", occurredAt: request.requestedAt,
    expectedEventSequence: (await store.read("company-one")).length, fencingToken: 1,
    approvalRequestId: request.id });
  const identity = { async getCurrentIdentity() { return { actorId: "human-one", organizationId: "company-one",
    displayName: "Human", assurance: "ENTERPRISE_ASSERTED" as const }; }, async currentPrincipal() { return null; },
    async authorize() { return { id: nextId(), principalId: "human-one", authorizedAt: "2026-08-18T08:30:00.000Z" }; } };
  await new DecideHighRiskAction({ identity, approvals, events: store, attempts,
    now: () => "2026-08-18T08:30:00.000Z", nextId }).execute({
      companyId: "company-one", requestId: request.id, expectedBinding: request.binding, decision: "REJECTED",
    });
  assert.equal((await attempts.load("company-one", draft.id))?.status, "CANCELLATION_REQUESTED");
  const cancels = (await store.readPendingPublications("company-one", { afterSequence: 0, limit: 100 }))
    .filter(({ payload }) => (payload as { operation?: string }).operation === "CANCEL");
  assert.equal(cancels.length, 1);
  const port = {
    async capabilities() { return { connectorId: "connector-one", displayName: "Fixture", protocolVersion: "1.0",
      supportsPause: true, supportsResume: true, supportsCancellation: true, supportsEvidence: true,
      maximumTimeoutSeconds: 3600 }; },
    async health() { return "HEALTHY" as const; }, async deploy() { throw new Error("unused"); },
    async submit() { throw new Error("unused"); }, async pause() {}, async resume() {}, async cancel() {},
    async observe() { return [{ workId: "work-one", sequence: 1, status: "CANCELLED" as const,
      summary: "Connector confirmed cancellation", evidenceRefs: [],
      recordedAt: "2026-08-18T08:31:00.000Z" }]; },
  };
  await new CollectConnectorObservations({ store, executionPorts: [port], nextId }).execute("company-one");
  assert.equal((await attempts.load("company-one", draft.id))?.status, "CANCELLED");
});
