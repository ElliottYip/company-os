import assert from "node:assert/strict";
import test from "node:test";

import { FormalAgentBossApi } from "../application/formal-agent-boss-api.ts";

test("formal facade binds route tenant and approval IDs before invoking use cases", async () => {
  const calls: unknown[] = [];
  const api = new FormalAgentBossApi({
    projection: { async execute(companyId) { calls.push(["read", companyId]); return { companyId }; } },
    dispatch: { async execute(input) { calls.push(["dispatch", input]); return { work: { id: input.draft.id } }; } },
    approvals: { async execute(input) { calls.push(["approval", input]); return { requestId: input.requestId }; } },
  });
  await api.getAgentBoss("company-one");
  await api.dispatchWork("company-one", {
    draft: {
      id: "work-one", companyId: "attacker-company", title: "Brief", goal: "Prepare a brief",
      scope: "AGENT", departmentId: "operations", projectId: null, agentId: "agent-one",
      requestedBy: "human-one", actionIds: ["read-knowledge"], parentWorkId: null,
    },
    genericGoalId: null,
  });
  await api.decideApproval("company-one", "approval-one", {
    decision: "APPROVED",
    expectedBinding: {
      action: { id: "action-one", type: "publish-content", description: "Publish", inputDigest: "sha256:input", risk: "HIGH" },
      workId: "work-one", responsibilityContractId: "contract-one", executingAgentId: "agent-one",
      accountableHumanId: "human-one", evidenceReferences: [], resultReference: null,
    },
  });

  assert.equal((calls[1] as [string, { draft: { companyId: string } }])[1].draft.companyId, "company-one");
  assert.equal((calls[2] as [string, { requestId: string }])[1].requestId, "approval-one");
});

test("formal work catalog paginates canonical work and returns only matching attempts", async () => {
  const projection = {
    schemaVersion: 1 as const,
    mode: "PRODUCTION" as const,
    viewer: { actorId: "human-one", displayName: "Human One" },
    organization: { company: { id: "company-one", name: "One", purpose: "Operate", locale: "en-US" }, departments: [], humans: [], agents: [] },
    responsibilities: { revision: 0, contracts: [] },
    agentLifecycle: { revision: 0, agents: [] },
    work: ["one", "two", "three"].map((id) => ({
      id: `work-${id}`, companyId: "company-one", title: id, goal: `Deliver ${id}`,
      scope: "AGENT" as const, departmentId: "operations", projectId: null,
      agentId: "agent-one", requestedBy: "human-one", actionIds: ["read"], parentWorkId: null,
      accountableHumanId: "human-one", responsibilityContractId: "contract-one",
      runtimeConnectorId: "connector-one", status: "PENDING" as const,
    })),
    attempts: [
      { id: "attempt-one", workId: "work-one", status: "SUCCEEDED" as const, attemptNumber: 1, evidenceReferences: [], resultId: "result-one" },
      { id: "attempt-two", workId: "work-two", status: "RUNNING" as const, attemptNumber: 1, evidenceReferences: [], resultId: null },
    ],
    pendingApprovals: [], generatedAt: "2026-08-25T00:00:00.000Z",
  };
  const api = new FormalAgentBossApi({
    projection: { async execute() { return projection; } },
    dispatch: { async execute() { throw new Error("not used"); } },
    approvals: { async execute() { throw new Error("not used"); } },
  });

  const page = await api.listWork("company-one", { cursor: 1, limit: 1 });
  assert.equal(page.items[0]?.work.id, "work-two");
  assert.deepEqual(page.items[0]?.attempts.map(({ id }) => id), ["attempt-two"]);
  assert.equal(page.nextCursor, "2");
  assert.equal((await api.getWork("company-one", "work-one")).attempts[0]?.resultId, "result-one");
  await assert.rejects(() => api.getWork("company-one", "missing"), /WORK_NOT_FOUND/);
});
