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
