import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import { GetWorkRunTimeline } from "../application/get-work-run-timeline.ts";
import { WorkAttemptService } from "../application/work-attempt-service.ts";

const identity = {
  async getCurrentIdentity() {
    return { actorId: "human-one", organizationId: "company-one", displayName: "Human One",
      assurance: "ENTERPRISE_ASSERTED" as const };
  },
  async currentPrincipal() { return null; },
  async authorize() {
    return { id: "authorization-one", principalId: "human-one", authorizedAt: "2026-08-25T10:00:00.000Z" };
  },
};

test("run timeline is attempt-scoped, resumable, and excludes private connector material", async () => {
  const store = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-timeline-")));
  const attempts = new WorkAttemptService(store);
  await attempts.create({
    draft: {
      id: "attempt-one", companyId: "company-one", workId: "work-one", agentId: "agent-one",
      attemptNumber: 1, idempotencyKey: "attempt-one", createdAt: "2026-08-25T10:00:00.000Z",
      timeoutAt: "2026-08-25T11:00:00.000Z",
      authority: {
        responsibilityContractId: "contract-one", responsibilityContractRevision: 1,
        accountableHumanId: "human-one", actionIds: ["publish"], permissionIds: ["read"],
        dataAuthorizationIds: ["data-one"], connectorId: "connector-one",
        connectorCapabilityDigest: `sha256:${"a".repeat(64)}`,
      },
    },
    eventId: "attempt-created", publicationId: "submit-one", actorId: "human-one", expectedEventSequence: 0,
  });
  await store.append({
    id: "unrelated", companyId: "company-one", type: "connector.observation.recorded",
    occurredAt: "2026-08-25T10:00:30.000Z", actorId: "connector-one", provenance: "PRODUCTION",
    payload: { attemptId: "attempt-other", observation: { workId: "work-other", sequence: 1,
      status: "WORKING", summary: "Other run", evidenceRefs: [], recordedAt: "2026-08-25T10:00:30.000Z" } },
  }, 1);
  await store.append({
    id: "observation-one", companyId: "company-one", type: "connector.observation.recorded",
    occurredAt: "2026-08-25T10:01:00.000Z", actorId: "connector-one", correlationId: "work-one",
    provenance: "PRODUCTION", payload: { attemptId: "attempt-one", credential: "must-not-leak",
      externalSession: "private-session", privateReasoning: "hidden",
      observation: { workId: "work-one", sequence: 1, status: "WORKING", summary: "Collected source material",
        evidenceRefs: ["evidence-one"], resultReference: null, recordedAt: "2026-08-25T10:01:00.000Z" } },
  }, 2);
  const current = await attempts.load("company-one", "attempt-one");
  assert.ok(current);
  await store.append({
    id: "attempt-paused", companyId: "company-one", type: "work-attempt.recorded",
    occurredAt: "2026-08-25T10:01:30.000Z", actorId: "connector-one", correlationId: "work-one",
    provenance: "PRODUCTION", payload: { operation: "PAUSE", attempt: {
      ...current, status: "AWAITING_APPROVAL", pendingApprovalId: "request-one",
    } },
  }, 3);
  await store.append({
    id: "approval-one", companyId: "company-one", type: "approval.decided",
    occurredAt: "2026-08-25T10:02:00.000Z", actorId: "human-one", correlationId: "work-one",
    provenance: "PRODUCTION", payload: { requestId: "request-one", decision: "APPROVED", note: "private note",
      binding: { workId: "work-one", executingAgentId: "agent-one", accountableHumanId: "human-one" } },
  }, 4);

  const timeline = new GetWorkRunTimeline({ identity, events: store, attempts });
  const first = await timeline.execute({ companyId: "company-one", workId: "work-one", attemptId: "attempt-one",
    afterSequence: 0, limit: 2 });
  assert.equal(first.items.length, 2);
  assert.deepEqual(first.items.map(({ type }) => type), ["attempt.state_changed", "connector.observation"]);
  assert.equal(first.items[1]?.summary, "Collected source material");
  assert.deepEqual(first.items[1]?.attributes, {
    connectorSequence: 1, status: "WORKING", evidenceCount: 1, resultReference: null,
  });
  assert.ok(first.nextSequence !== null);
  assert.equal(JSON.stringify(first).includes("must-not-leak"), false);
  assert.equal(JSON.stringify(first).includes("private-session"), false);
  assert.equal(JSON.stringify(first).includes("hidden"), false);

  const second = await timeline.execute({ companyId: "company-one", workId: "work-one", attemptId: "attempt-one",
    afterSequence: first.nextSequence as number, limit: 2 });
  assert.deepEqual(second.items.map(({ type }) => type), ["attempt.state_changed", "approval.decided"]);
  assert.deepEqual(second.items[1]?.attributes, { requestId: "request-one", decision: "APPROVED" });
  assert.equal(second.nextSequence, null);
});

test("run timeline enforces formal tenant and attempt/work binding", async () => {
  const store = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-timeline-scope-")));
  const timeline = new GetWorkRunTimeline({ identity, events: store, attempts: new WorkAttemptService(store) });
  await assert.rejects(timeline.execute({ companyId: "company-one", workId: "work-one", attemptId: "missing",
    afterSequence: 0, limit: 20 }), /WORK_ATTEMPT_NOT_FOUND/);
  await assert.rejects(new GetWorkRunTimeline({ identity: { ...identity,
    async getCurrentIdentity() { return { actorId: "human-two", organizationId: "company-two",
      displayName: "Human Two", assurance: "ENTERPRISE_ASSERTED" as const }; } },
    events: store, attempts: new WorkAttemptService(store) }).execute({ companyId: "company-one", workId: "work-one",
      attemptId: "missing", afterSequence: 0, limit: 20 }), /TENANT_MISMATCH/);
});
