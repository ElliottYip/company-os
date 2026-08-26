import type { ConnectorUsageOutput, Identifier, WorkObservation } from "../core/control-plane.ts";
import { validateUsageBudgetLedger, type VerifiedCostEvent } from "../core/usage-budget.ts";
import type { WorkAttempt } from "../core/work-attempt.ts";
import type { UsageBudgetStorePort } from "../ports/usage-budget-store-port.ts";

export interface ConnectorUsageIngestionOutcome {
  readonly usageReference: Identifier;
  readonly status: "RECORDED" | "REPLAYED";
}

const ID = /^[a-z0-9][a-z0-9-]{0,127}$/;

function sameCost(left: VerifiedCostEvent, right: VerifiedCostEvent): boolean {
  const { id: _leftId, ...leftValue } = left;
  const { id: _rightId, ...rightValue } = right;
  return JSON.stringify(leftValue) === JSON.stringify(rightValue);
}

/** Converts authenticated Agent Node usage evidence into the canonical budget ledger. */
export class IngestConnectorUsage {
  readonly #store: UsageBudgetStorePort;
  readonly #nextId: () => Identifier;

  constructor(dependencies: { readonly store: UsageBudgetStorePort; readonly nextId: () => Identifier }) {
    this.#store = dependencies.store;
    this.#nextId = dependencies.nextId;
  }

  async execute(input: {
    readonly attempt: WorkAttempt;
    readonly usageOutputs: readonly ConnectorUsageOutput[];
    readonly evidenceOutputs: NonNullable<WorkObservation["evidenceOutputs"]>;
    readonly observationRecordedAt: string;
    readonly projectId: Identifier | null;
    readonly goalId: Identifier | null;
  }): Promise<readonly ConnectorUsageIngestionOutcome[]> {
    const model = input.attempt.authority.model ?? null;
    if (!model) throw new Error("CONNECTOR_MODEL_USAGE_NOT_AUTHORIZED");
    if (!input.usageOutputs.length || input.usageOutputs.length > 128 ||
        new Set(input.usageOutputs.map(({ usageReference }) => usageReference)).size !== input.usageOutputs.length) {
      throw new Error("CONNECTOR_USAGE_INVALID");
    }
    const evidence = new Map(input.evidenceOutputs.map((item) => [item.evidenceReference, item.contentDigest]));
    const candidates: VerifiedCostEvent[] = [];
    for (const usage of input.usageOutputs) {
      const sourceDigest = evidence.get(usage.usageReference);
      if (!sourceDigest) throw new Error("CONNECTOR_USAGE_EVIDENCE_REQUIRED");
      const candidate: VerifiedCostEvent = {
        id: this.#nextId(), companyId: input.attempt.companyId, agentId: input.attempt.agentId,
        workId: input.attempt.workId, projectId: input.projectId, goalId: input.goalId,
        usageReference: usage.usageReference, sourceDigest,
        provider: model.providerAdapterId, biller: usage.biller, billingType: usage.billingType,
        costStatus: usage.costStatus, model: model.modelReference,
        inputTokens: usage.inputTokens, cachedInputTokens: usage.cachedInputTokens,
        outputTokens: usage.outputTokens, costCents: usage.costCents,
        occurredAt: usage.occurredAt, recordedAt: input.observationRecordedAt,
      };
      if (!ID.test(candidate.biller) || Date.parse(candidate.occurredAt) > Date.parse(candidate.recordedAt) ||
          input.attempt.startedAt === null || Date.parse(candidate.occurredAt) < Date.parse(input.attempt.startedAt)) {
        throw new Error("CONNECTOR_USAGE_INVALID");
      }
      candidates.push(candidate);
    }
    // Validate the complete observation before any ledger mutation so malformed
    // later entries cannot leave an earlier cost partially committed.
    validateUsageBudgetLedger({ companyId: input.attempt.companyId, revision: 0,
      costEvents: candidates, policies: [] });
    return this.#record(candidates);
  }

  async #record(candidates: readonly VerifiedCostEvent[]): Promise<readonly ConnectorUsageIngestionOutcome[]> {
    for (let retry = 0; retry < 3; retry += 1) {
      const ledger = await this.#store.load(candidates[0]!.companyId);
      const outcomes: ConnectorUsageIngestionOutcome[] = [];
      const missing: VerifiedCostEvent[] = [];
      for (const candidate of candidates) {
        const prior = ledger.costEvents.find(({ usageReference }) => usageReference === candidate.usageReference);
        if (prior) {
          if (!sameCost(prior, candidate)) throw new Error("CONNECTOR_USAGE_REFERENCE_CONFLICT");
          outcomes.push({ usageReference: candidate.usageReference, status: "REPLAYED" });
        } else {
          missing.push(candidate);
          outcomes.push({ usageReference: candidate.usageReference, status: "RECORDED" });
        }
      }
      if (!missing.length) return outcomes;
      const next = validateUsageBudgetLedger({ ...ledger, costEvents: [...ledger.costEvents, ...missing] });
      try {
        await this.#store.replace(next, ledger.revision, candidates[0]!.provider, candidates[0]!.recordedAt);
        return outcomes;
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "USAGE_BUDGET_REVISION_CONFLICT" || retry === 2) throw error;
      }
    }
    throw new Error("USAGE_BUDGET_REVISION_CONFLICT");
  }
}
