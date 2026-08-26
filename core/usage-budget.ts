import type { Identifier } from "./control-plane.ts";

export type BillingType = "metered_api" | "subscription_included" | "subscription_overage" | "credits" | "fixed" | "unknown";
export type CostStatus = "reported" | "unpriced";
export type BudgetScopeType = "company" | "agent" | "project";
export type BudgetMetric = "billed_cents";
export type BudgetWindowKind = "calendar_month_utc" | "lifetime";

export interface VerifiedCostEvent {
  readonly id: Identifier; readonly companyId: Identifier; readonly agentId: Identifier;
  readonly workId: Identifier | null; readonly projectId: Identifier | null; readonly goalId: Identifier | null;
  readonly usageReference: Identifier; readonly sourceDigest: string;
  readonly provider: Identifier; readonly biller: Identifier; readonly billingType: BillingType;
  readonly costStatus: CostStatus; readonly model: Identifier;
  readonly inputTokens: number; readonly cachedInputTokens: number; readonly outputTokens: number;
  readonly costCents: number; readonly occurredAt: string; readonly recordedAt: string;
}

export interface BudgetPolicy {
  readonly id: Identifier; readonly companyId: Identifier; readonly scopeType: BudgetScopeType;
  readonly scopeId: Identifier; readonly metric: BudgetMetric; readonly windowKind: BudgetWindowKind;
  readonly amount: number; readonly warnPercent: number; readonly hardStopEnabled: boolean;
  readonly notifyEnabled: boolean; readonly isActive: boolean; readonly updatedAt: string;
}

export interface UsageBudgetLedger {
  readonly companyId: Identifier; readonly revision: number;
  readonly costEvents: readonly VerifiedCostEvent[]; readonly policies: readonly BudgetPolicy[];
}

export interface BudgetPolicySummary extends BudgetPolicy {
  readonly observedAmount: number; readonly remainingAmount: number; readonly utilizationPercent: number;
  readonly status: "ok" | "warning" | "hard_stop"; readonly windowStart: string | null; readonly windowEnd: string | null;
}

const ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const BILLING_TYPES: readonly BillingType[] = ["metered_api", "subscription_included", "subscription_overage", "credits", "fixed", "unknown"];

function count(value: number, code: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(code);
}

export function validateUsageBudgetLedger(ledger: UsageBudgetLedger): UsageBudgetLedger {
  if (!ID.test(ledger.companyId) || !Number.isSafeInteger(ledger.revision) || ledger.revision < 0) {
    throw new Error("USAGE_BUDGET_LEDGER_INVALID");
  }
  const ids = ledger.costEvents.map(({ id }) => id);
  const references = ledger.costEvents.map(({ usageReference }) => usageReference);
  if (new Set(ids).size !== ids.length || new Set(references).size !== references.length) {
    throw new Error("COST_EVENT_DUPLICATE");
  }
  const costEvents = ledger.costEvents.map((event) => {
    if (event.companyId !== ledger.companyId || ![event.id, event.agentId, event.usageReference, event.provider,
      event.biller, event.model].every(ID.test.bind(ID)) || event.workId !== null && !ID.test(event.workId) ||
      event.projectId !== null && !ID.test(event.projectId) || event.goalId !== null && !ID.test(event.goalId) ||
      !DIGEST.test(event.sourceDigest) || !BILLING_TYPES.includes(event.billingType) ||
      !["reported", "unpriced"].includes(event.costStatus) || !Number.isFinite(Date.parse(event.occurredAt)) ||
      !Number.isFinite(Date.parse(event.recordedAt))) throw new Error("COST_EVENT_INVALID");
    count(event.inputTokens, "COST_EVENT_INVALID"); count(event.cachedInputTokens, "COST_EVENT_INVALID");
    count(event.outputTokens, "COST_EVENT_INVALID"); count(event.costCents, "COST_EVENT_INVALID");
    if (event.costStatus === "unpriced" && event.costCents !== 0) throw new Error("UNPRICED_COST_MUST_BE_ZERO");
    return { ...event };
  });
  const keys = ledger.policies.map(({ scopeType, scopeId, metric, windowKind }) => `${scopeType}:${scopeId}:${metric}:${windowKind}`);
  if (new Set(ledger.policies.map(({ id }) => id)).size !== ledger.policies.length || new Set(keys).size !== keys.length) {
    throw new Error("BUDGET_POLICY_DUPLICATE");
  }
  const policies = ledger.policies.map((policy) => {
    if (policy.companyId !== ledger.companyId || !ID.test(policy.id) || !ID.test(policy.scopeId) ||
      !["company", "agent", "project"].includes(policy.scopeType) || policy.metric !== "billed_cents" ||
      !["calendar_month_utc", "lifetime"].includes(policy.windowKind) || !Number.isSafeInteger(policy.amount) ||
      policy.amount < 0 || !Number.isSafeInteger(policy.warnPercent) || policy.warnPercent < 1 ||
      policy.warnPercent > 99 || typeof policy.hardStopEnabled !== "boolean" ||
      typeof policy.notifyEnabled !== "boolean" || typeof policy.isActive !== "boolean" ||
      !Number.isFinite(Date.parse(policy.updatedAt))) throw new Error("BUDGET_POLICY_INVALID");
    return { ...policy };
  });
  return { companyId: ledger.companyId, revision: ledger.revision, costEvents, policies };
}

function monthWindow(now: string) {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error("BUDGET_CLOCK_INVALID");
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end };
}

export function summarizeBudgetPolicies(ledger: UsageBudgetLedger, now: string): readonly BudgetPolicySummary[] {
  const validated = validateUsageBudgetLedger(ledger); const month = monthWindow(now);
  return validated.policies.map((policy) => {
    const events = validated.costEvents.filter((event) => policy.isActive &&
      (policy.scopeType === "company" && event.companyId === policy.scopeId ||
       policy.scopeType === "agent" && event.agentId === policy.scopeId ||
       policy.scopeType === "project" && event.projectId === policy.scopeId) &&
      (policy.windowKind === "lifetime" || new Date(event.occurredAt) >= month.start && new Date(event.occurredAt) < month.end));
    const observedAmount = events.reduce((total, event) => total + event.costCents, 0);
    const utilizationPercent = policy.amount === 0 ? (observedAmount > 0 ? 100 : 0) : observedAmount / policy.amount * 100;
    const status = policy.hardStopEnabled && observedAmount >= policy.amount && (policy.amount > 0 || observedAmount > 0)
      ? "hard_stop" as const : utilizationPercent >= policy.warnPercent ? "warning" as const : "ok" as const;
    return { ...policy, observedAmount, remainingAmount: Math.max(0, policy.amount - observedAmount),
      utilizationPercent, status, windowStart: policy.windowKind === "calendar_month_utc" ? month.start.toISOString() : null,
      windowEnd: policy.windowKind === "calendar_month_utc" ? month.end.toISOString() : null };
  });
}
