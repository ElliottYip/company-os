import assert from "node:assert/strict";
import test from "node:test";

import { AuthorizeWorkBudget } from "../application/authorize-work-budget.ts";
import type { UsageBudgetLedger } from "../core/usage-budget.ts";
import type { WorkItem } from "../core/work.ts";

const work: WorkItem = {
  id: "work-one", companyId: "company-one", title: "Prepare report", goal: "Prepare a source-backed report",
  scope: "PROJECT", departmentId: "ops", projectId: "project-one", agentId: "agent-one",
  requestedBy: "human-one", actionIds: ["read-data"], parentWorkId: null,
  accountableHumanId: "human-one", responsibilityContractId: "contract-one",
  runtimeConnectorId: "connector-one", status: "PENDING",
};

const cost = { id: "cost-one", companyId: "company-one", agentId: "agent-one", workId: "prior-work",
  projectId: "project-one", goalId: null, usageReference: "usage-one", sourceDigest: `sha256:${"a".repeat(64)}`,
  provider: "provider-one", biller: "provider-one", billingType: "metered_api" as const,
  costStatus: "reported" as const, model: "model-one", inputTokens: 100, cachedInputTokens: 0,
  outputTokens: 20, costCents: 1_000, occurredAt: "2026-08-25T10:00:00.000Z",
  recordedAt: "2026-08-25T10:01:00.000Z" };

function ledger(scopeType: "company" | "agent" | "project", hardStopEnabled = true): UsageBudgetLedger {
  const scopeId = scopeType === "company" ? "company-one" : scopeType === "agent" ? "agent-one" : "project-one";
  return { companyId: "company-one", revision: 2, costEvents: [cost], policies: [{
    id: `budget-${scopeType}`, companyId: "company-one", scopeType, scopeId,
    metric: "billed_cents", windowKind: "calendar_month_utc", amount: 1_000,
    warnPercent: 80, hardStopEnabled, notifyEnabled: true, isActive: true,
    updatedAt: "2026-08-25T09:00:00.000Z",
  }] };
}

test("new work is denied when any applicable active budget reached its hard stop", async () => {
  for (const scope of ["company", "agent", "project"] as const) {
    const service = new AuthorizeWorkBudget({ store: { async load() { return ledger(scope); } },
      now: () => "2026-08-25T12:00:00.000Z" });
    await assert.rejects(service.execute(work), /BUDGET_HARD_STOP/);
  }
});

test("warnings, inactive policies and unrelated scopes do not invent a dispatch block", async () => {
  const warning = ledger("company", false);
  const service = new AuthorizeWorkBudget({ store: { async load() { return warning; } },
    now: () => "2026-08-25T12:00:00.000Z" });
  const result = await service.execute(work);
  assert.equal(result.status, "AUTHORIZED");
  assert.equal(result.applicablePolicies.length, 1);

  const unrelated = { ...warning, policies: [{ ...warning.policies[0]!, hardStopEnabled: true,
    scopeType: "agent" as const, scopeId: "agent-other" }] };
  assert.equal((await new AuthorizeWorkBudget({ store: { async load() { return unrelated; } },
    now: () => "2026-08-25T12:00:00.000Z" }).execute(work)).applicablePolicies.length, 0);
});
