import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { GetAccountabilityLedger } from "../application/get-accountability-ledger.ts";
import type { CompanyDomainEvent } from "../core/control-plane.ts";

const now = "2026-08-25T12:00:00.000Z";

function identity(organizationId = "company-one", assurance: "ENTERPRISE_ASSERTED" | "LOCAL_DEMO" = "ENTERPRISE_ASSERTED") {
  return {
    async getCurrentIdentity() { return { actorId: "human-one", organizationId, displayName: "Human One", assurance }; },
    async currentPrincipal() { return null; },
    async authorize() { return { id: "authorization-one", principalId: "human-one", authorizedAt: now }; },
  };
}

async function append(store: InMemoryEventStore, event: Omit<CompanyDomainEvent, "companyId" | "occurredAt" | "actorId" | "provenance">) {
  const current = await store.read("company-one");
  await store.append({ ...event, companyId: "company-one", occurredAt: now, actorId: "system", provenance: "PRODUCTION" }, current.length);
}

test("accountability ledger joins exact approvals and digest-only Connector evidence", async () => {
  const store = new InMemoryEventStore();
  await append(store, { id: "attempt-event", type: "work-attempt.recorded", payload: {
    attempt: { id: "attempt-one", workId: "work-one" },
  } });
  await append(store, { id: "approval-request-event", type: "approval.publication.requested", payload: { request: {
    id: "approval-one", companyId: "company-one", status: "AWAITING_APPROVAL", requestedAt: now,
    expiresAt: "2026-08-25T13:00:00.000Z", binding: {
      action: { id: "publish", type: "PUBLISH", description: "Publish result",
        inputDigest: `sha256:${"a".repeat(64)}`, risk: "HIGH" },
      workId: "work-one", responsibilityContractId: "contract-one", executingAgentId: "agent-one",
      accountableHumanId: "human-one", evidenceReferences: ["evidence-one"], resultReference: null,
    },
  } } });
  await append(store, { id: "approval-decision-event", type: "approval.publication.decided", payload: { decision: {
    requestId: "approval-one", decision: "APPROVED", decidedBy: "human-one", decidedAt: now,
  } } });
  await append(store, { id: "observation-event", type: "connector.observation.recorded", payload: {
    attemptId: "attempt-one", observation: { summary: "Result stored at execution edge", recordedAt: now,
      evidenceOutputs: [{ evidenceReference: "evidence-one", contentDigest: `sha256:${"b".repeat(64)}` }],
      resultReference: "evidence-one",
    },
  } });
  const ledger = await new GetAccountabilityLedger({ identity: identity(), events: store, now: () => now })
    .execute("company-one");
  assert.equal(ledger.approvals[0]?.status, "APPROVED");
  assert.equal(ledger.approvals[0]?.request.binding.action.inputDigest, `sha256:${"a".repeat(64)}`);
  assert.deepEqual(ledger.evidence[0], {
    id: "evidence-one", workId: "work-one", attemptId: "attempt-one", kind: "RESULT",
    summary: "Result stored at execution edge", contentDigest: `sha256:${"b".repeat(64)}`,
    recordedAt: now, provenance: "PRODUCTION", source: "CONNECTOR",
  });
  assert.doesNotMatch(JSON.stringify(ledger), /credential|privateSession|chainOfThought/i);
});

test("accountability ledger rejects Demo, cross-tenant and corrupt evidence", async () => {
  const store = new InMemoryEventStore();
  await assert.rejects(new GetAccountabilityLedger({ identity: identity("company-one", "LOCAL_DEMO"), events: store,
    now: () => now }).execute("company-one"), /FORMAL_IDENTITY_REQUIRED/);
  await assert.rejects(new GetAccountabilityLedger({ identity: identity("company-two"), events: store,
    now: () => now }).execute("company-one"), /TENANT_MISMATCH/);
  await append(store, { id: "bad-evidence", type: "evidence.persisted", payload: { record: {
    id: "evidence-one", workId: "work-one", kind: "ARTIFACT", summary: "Bad digest",
    contentDigest: "not-a-digest", recordedAt: now, provenance: "PRODUCTION",
  } } });
  await assert.rejects(new GetAccountabilityLedger({ identity: identity(), events: store,
    now: () => now }).execute("company-one"), /ACCOUNTABILITY_LEDGER_CORRUPT/);
});
