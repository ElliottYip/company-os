import assert from "node:assert/strict";
import test from "node:test";
import { ManageUsageBudget } from "../application/manage-usage-budget.ts";
import type { UsageBudgetLedger } from "../core/usage-budget.ts";

function service() {
  let ledger: UsageBudgetLedger = { companyId: "company-one", revision: 0, costEvents: [], policies: [] };
  const manager = new ManageUsageBudget({
    identity: { async getCurrentIdentity() { return { actorId: "human-one", organizationId: "company-one",
      displayName: "Alex", assurance: "ENTERPRISE_SSO" as const, roles: ["admin"] }; },
      async authorize(input) { return { principalId: "human-one", companyId: input.companyId,
        action: input.action, resourceId: input.resourceId, authorizedAt: "2026-08-24T12:00:00.000Z" }; } },
    structure: { async load() { return { organization: { company: { id: "company-one", name: "Company", purpose: "", locale: "en" },
      departments: [{ id: "ops", name: "Ops", mandate: "" }], humans: [{ id: "human-one", name: "Alex", title: "Owner", departmentId: "ops", avatarId: "human" }],
      agents: [{ id: "agent-one", name: "Agent", role: "Research", departmentId: "ops", accountableHumanId: "human-one", runtimeConnectorId: "connector-one", avatarId: "fish", autonomyLevel: 1 }] },
      projects: [{ id: "project-one", companyId: "company-one", name: "Project", purpose: "", accountableHumanId: "human-one" }],
      workspaces: [], positions: [], reportingLines: [], revision: 1 }; } },
    store: { async load() { return structuredClone(ledger); }, async replace(next, expected) {
      assert.equal(expected, ledger.revision); ledger = structuredClone({ ...next, revision: expected + 1 }); return ledger; } },
    now: () => "2026-08-24T12:00:00.000Z",
  });
  return { manager, current: () => ledger };
}

test("budget upsert and verified cost are revisioned and idempotent", async () => {
  const { manager, current } = service();
  await manager.upsertPolicy({ companyId: "company-one", policyId: "budget-one", scopeType: "company",
    scopeId: "company-one", amount: 1_000, expectedRevision: 0 });
  const cost = { id: "cost-one", companyId: "company-one", agentId: "agent-one", workId: "work-one",
    projectId: "project-one", goalId: null, usageReference: "usage-one", sourceDigest: `sha256:${"b".repeat(64)}`,
    provider: "provider-one", biller: "provider-one", billingType: "metered_api" as const,
    costStatus: "reported" as const, model: "model-one", inputTokens: 10, cachedInputTokens: 0,
    outputTokens: 5, costCents: 25, occurredAt: "2026-08-24T11:00:00.000Z", expectedRevision: 1 };
  await manager.recordVerifiedCost(cost);
  assert.equal(current().costEvents.length, 1);
  const replay = await manager.recordVerifiedCost({ ...cost, expectedRevision: 2 });
  assert.equal(replay.revision, 2);
  assert.equal(current().costEvents.length, 1);
});
