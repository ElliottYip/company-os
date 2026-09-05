import type { Identifier } from "./control-plane.ts";
import type { VerifiedCostEvent } from "./usage-budget.ts";

export type ValueScopeType = "COMPANY" | "PROJECT" | "AGENT" | "ASSET";
export type ValueMetric = "HOURS_SAVED_MINUTES" | "ADOPTION" | "OUTCOME_VALUE_CENTS";
export interface ValueMeasurement {
  readonly id: Identifier; readonly companyId: Identifier; readonly scopeType: ValueScopeType;
  readonly scopeId: Identifier; readonly metric: ValueMetric; readonly numerator: number;
  readonly denominator: number | null; readonly method: string; readonly sourceReference: Identifier;
  readonly sourceDigest: `sha256:${string}`; readonly confidence: "VERIFIED" | "ESTIMATED";
  readonly periodStart: string; readonly periodEnd: string; readonly recordedAt: string;
}
export interface AiValueLedger { readonly companyId: Identifier; readonly revision: number;
  readonly measurements: readonly ValueMeasurement[] }
export interface VerifiedValueSummary {
  readonly ledgerRevision: number;
  readonly scopeType: ValueScopeType; readonly scopeId: Identifier;
  readonly periodStart: string; readonly periodEnd: string;
  readonly verifiedHoursSavedMinutes: number; readonly verifiedAdoptionBps: number | null;
  readonly verifiedOutcomeValueCents: number; readonly verifiedCostCents: number;
  readonly verifiedNetValueCents: number | null;
  readonly unavailableReasons: readonly ("NO_VERIFIED_ADOPTION" | "UNPRICED_COST" | "NO_VERIFIED_OUTCOME_VALUE")[];
  readonly evidenceReferences: readonly Identifier[];
}
const ID = /^[a-z0-9][a-z0-9-]{0,127}$/; const DIGEST = /^sha256:[a-f0-9]{64}$/;
export function validateAiValueLedger(value: AiValueLedger): AiValueLedger {
  if (!ID.test(value.companyId) || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
      value.measurements.length > 100_000) throw new Error("AI_VALUE_LEDGER_INVALID");
  const ids = new Set<string>(); const sources = new Set<string>();
  const measurements = value.measurements.map((record) => {
    if (record.companyId !== value.companyId || ids.has(record.id) || sources.has(record.sourceReference) ||
        ![record.id, record.scopeId, record.sourceReference].every((item) => ID.test(item)) ||
        !["COMPANY", "PROJECT", "AGENT", "ASSET"].includes(record.scopeType) ||
        !["HOURS_SAVED_MINUTES", "ADOPTION", "OUTCOME_VALUE_CENTS"].includes(record.metric) ||
        !Number.isSafeInteger(record.numerator) || record.numerator < 0 ||
        !(record.denominator === null || Number.isSafeInteger(record.denominator) && record.denominator > 0) ||
        (record.metric === "ADOPTION") !== (record.denominator !== null) ||
        record.denominator !== null && record.numerator > record.denominator ||
        typeof record.method !== "string" || !record.method.trim() || [...record.method].length > 1_000 ||
        !DIGEST.test(record.sourceDigest) || !["VERIFIED", "ESTIMATED"].includes(record.confidence) ||
        ![record.periodStart, record.periodEnd, record.recordedAt].every((item) => Number.isFinite(Date.parse(item))) ||
        Date.parse(record.periodStart) >= Date.parse(record.periodEnd) || Date.parse(record.periodEnd) > Date.parse(record.recordedAt)) {
      throw new Error("AI_VALUE_MEASUREMENT_INVALID");
    }
    ids.add(record.id); sources.add(record.sourceReference);
    return { ...record, method: record.method.trim() };
  });
  return { companyId: value.companyId, revision: value.revision, measurements };
}

export function summarizeVerifiedValue(input: { readonly ledger: AiValueLedger;
  readonly costs: readonly VerifiedCostEvent[]; readonly scopeType: ValueScopeType; readonly scopeId: Identifier;
  readonly periodStart: string; readonly periodEnd: string }): VerifiedValueSummary {
  const ledger = validateAiValueLedger(input.ledger);
  const measurements = ledger.measurements.filter((record) => record.confidence === "VERIFIED" &&
    record.scopeType === input.scopeType && record.scopeId === input.scopeId &&
    record.periodStart >= input.periodStart && record.periodEnd <= input.periodEnd);
  const metric = (name: ValueMetric) => measurements.filter((record) => record.metric === name);
  const hours = metric("HOURS_SAVED_MINUTES").reduce((total, record) => total + record.numerator, 0);
  const adoption = metric("ADOPTION"); const adoptionDenominator = adoption.reduce((total, record) => total + record.denominator!, 0);
  const adoptionBps = adoptionDenominator ? Math.round(adoption.reduce((total, record) => total + record.numerator, 0) /
    adoptionDenominator * 10_000) : null;
  const outcome = metric("OUTCOME_VALUE_CENTS").reduce((total, record) => total + record.numerator, 0);
  const costs = input.costs.filter((record) => record.companyId === ledger.companyId && record.occurredAt >= input.periodStart &&
    record.occurredAt < input.periodEnd && (input.scopeType === "COMPANY" ||
      input.scopeType === "AGENT" && record.agentId === input.scopeId ||
      input.scopeType === "PROJECT" && record.projectId === input.scopeId));
  const unpriced = costs.some(({ costStatus }) => costStatus === "unpriced") || input.scopeType === "ASSET";
  const costCents = costs.reduce((total, record) => total + record.costCents, 0);
  const reasons: VerifiedValueSummary["unavailableReasons"][number][] = [];
  if (adoptionBps === null) reasons.push("NO_VERIFIED_ADOPTION"); if (!outcome) reasons.push("NO_VERIFIED_OUTCOME_VALUE");
  if (unpriced) reasons.push("UNPRICED_COST");
  return { ledgerRevision: ledger.revision, scopeType: input.scopeType, scopeId: input.scopeId, periodStart: input.periodStart,
    periodEnd: input.periodEnd, verifiedHoursSavedMinutes: hours, verifiedAdoptionBps: adoptionBps,
    verifiedOutcomeValueCents: outcome, verifiedCostCents: costCents,
    verifiedNetValueCents: unpriced || !outcome ? null : outcome - costCents,
    unavailableReasons: reasons, evidenceReferences: measurements.map(({ sourceReference }) => sourceReference) };
}
