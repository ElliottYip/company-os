import assert from "node:assert/strict";
import test from "node:test";

import { DecideHighRiskAction } from "../application/decide-high-risk-action.ts";
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
    /tenant mismatch/i,
  );

  const outsider = harness("human-two");
  await assert.rejects(
    outsider.useCase.execute({
      companyId: "company-one",
      requestId: "approval-one",
      expectedBinding: request.binding,
      decision: "APPROVED",
    }),
    /accountable human/i,
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
    /binding mismatch/i,
  );
  assert.equal(mismatch.decisions.length, 0);
});
