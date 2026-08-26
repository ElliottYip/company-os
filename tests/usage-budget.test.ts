import assert from "node:assert/strict";
import test from "node:test";
import { summarizeBudgetPolicies, validateUsageBudgetLedger } from "../core/usage-budget.ts";

const event = { id: "cost-one", companyId: "company-one", agentId: "agent-one", workId: "work-one",
  projectId: null, goalId: null, usageReference: "usage-one", sourceDigest: `sha256:${"a".repeat(64)}`,
  provider: "provider-one", biller: "provider-one", billingType: "metered_api" as const,
  costStatus: "reported" as const, model: "model-one", inputTokens: 100, cachedInputTokens: 20,
  outputTokens: 30, costCents: 850, occurredAt: "2026-08-24T12:00:00.000Z", recordedAt: "2026-08-24T12:01:00.000Z" };
const policy = { id: "budget-one", companyId: "company-one", scopeType: "company" as const,
  scopeId: "company-one", metric: "billed_cents" as const, windowKind: "calendar_month_utc" as const,
  amount: 1_000, warnPercent: 80, hardStopEnabled: true, notifyEnabled: true, isActive: true,
  updatedAt: "2026-08-24T12:00:00.000Z" };

test("verified cost and budget policy preserve upstream accounting vocabulary", () => {
  const ledger = validateUsageBudgetLedger({ companyId: "company-one", revision: 2,
    costEvents: [event], policies: [policy] });
  const summary = summarizeBudgetPolicies(ledger, "2026-08-24T13:00:00.000Z")[0];
  assert.equal(summary?.observedAmount, 850);
  assert.equal(summary?.remainingAmount, 150);
  assert.equal(summary?.status, "warning");
  assert.equal(summary?.windowStart, "2026-08-01T00:00:00.000Z");
});

test("unpriced usage cannot invent a billed amount", () => {
  assert.throws(() => validateUsageBudgetLedger({ companyId: "company-one", revision: 0,
    costEvents: [{ ...event, costStatus: "unpriced", costCents: 1 }], policies: [] }),
  /UNPRICED_COST_MUST_BE_ZERO/);
});
