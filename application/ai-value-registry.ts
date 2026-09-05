import type { Identifier } from "../core/control-plane.ts";
import { summarizeVerifiedValue, validateAiValueLedger, type AiValueLedger, type ValueMeasurement,
  type ValueScopeType } from "../core/ai-value.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { UsageBudgetStorePort } from "../ports/usage-budget-store-port.ts";

async function project(events: EventDataStorePort, companyId: Identifier): Promise<AiValueLedger> {
  const records = await events.read(companyId, { types: ["ai-value-ledger.revised"] });
  const ledger = (records.at(-1)?.payload as { ledger?: AiValueLedger } | undefined)?.ledger;
  return ledger ? validateAiValueLedger(ledger) : { companyId, revision: 0, measurements: [] };
}
export class AiValueRegistry {
  readonly #identity: IdentityPort; readonly #events: EventDataStorePort;
  readonly #costs: UsageBudgetStorePort; readonly #now: () => string; readonly #nextId: () => Identifier;
  constructor(dependencies: { readonly identity: IdentityPort; readonly events: EventDataStorePort;
    readonly costs: UsageBudgetStorePort; readonly now: () => string; readonly nextId: () => Identifier }) {
    this.#identity = dependencies.identity; this.#events = dependencies.events; this.#costs = dependencies.costs;
    this.#now = dependencies.now; this.#nextId = dependencies.nextId;
  }
  async record(companyId: Identifier, input: { readonly expectedRevision: number;
    readonly measurement: Omit<ValueMeasurement, "companyId"> }): Promise<AiValueLedger> {
    const actorId = await this.#authorize(companyId, "ai-value:record", "Record a source-backed value measurement");
    const current = await project(this.#events, companyId);
    if (current.revision !== input.expectedRevision) throw new Error("AI_VALUE_REVISION_CONFLICT");
    const prior = current.measurements.find(({ sourceReference }) => sourceReference === input.measurement.sourceReference);
    if (prior) {
      const { companyId: _companyId, ...priorInput } = prior;
      if (JSON.stringify(priorInput) !== JSON.stringify(input.measurement)) {
        throw new Error("AI_VALUE_SOURCE_CONFLICT");
      }
      return current;
    }
    const ledger = validateAiValueLedger({ companyId, revision: current.revision + 1,
      measurements: [...current.measurements, { ...input.measurement, companyId }] });
    const all = await this.#events.read(companyId);
    await this.#events.append({ id: this.#nextId(), companyId, type: "ai-value-ledger.revised", actorId,
      occurredAt: this.#now(), provenance: "PRODUCTION", payload: { ledger } }, all.length);
    return ledger;
  }
  async summarize(companyId: Identifier, input: { readonly scopeType: ValueScopeType; readonly scopeId: Identifier;
    readonly periodStart: string; readonly periodEnd: string }) {
    await this.#authorize(companyId, "ai-value:read", "Read verified cost and value");
    return summarizeVerifiedValue({ ledger: await project(this.#events, companyId),
      costs: (await this.#costs.load(companyId)).costEvents, ...input });
  }
  async #authorize(companyId: Identifier, action: string, reason: string): Promise<Identifier> {
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== companyId) throw new Error("TENANT_MISMATCH");
    const receipt = await this.#identity.authorize({ companyId, action, resourceId: companyId, reason });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH"); return identity.actorId;
  }
}
