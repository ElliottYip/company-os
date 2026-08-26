import type { CompanyDomainEvent, Identifier } from "../../core/control-plane.ts";
import type { UsageBudgetLedger } from "../../core/usage-budget.ts";
import type { EventDataStorePort } from "../../ports/event-data-store-port.ts";
import type { UsageBudgetStorePort } from "../../ports/usage-budget-store-port.ts";

export class EventBackedUsageBudgetStore implements UsageBudgetStorePort {
  readonly #events: EventDataStorePort; readonly #nextId: () => Identifier;
  constructor(events: EventDataStorePort, nextId: () => Identifier) { this.#events = events; this.#nextId = nextId; }
  async load(companyId: Identifier): Promise<UsageBudgetLedger> {
    const event = (await this.#events.read(companyId, { types: ["usage-budget.ledger.replaced"] })).at(-1);
    return event ? structuredClone((event.payload as { ledger: UsageBudgetLedger }).ledger)
      : { companyId, revision: 0, costEvents: [], policies: [] };
  }
  async replace(ledger: UsageBudgetLedger, expectedRevision: number, actorId: Identifier, occurredAt: string) {
    const current = await this.load(ledger.companyId);
    if (current.revision !== expectedRevision) throw new Error("USAGE_BUDGET_REVISION_CONFLICT");
    const next = structuredClone({ ...ledger, revision: expectedRevision + 1 });
    const all = await this.#events.read(ledger.companyId);
    const event: CompanyDomainEvent = { id: this.#nextId(), companyId: ledger.companyId,
      type: "usage-budget.ledger.replaced", occurredAt, actorId, payload: { ledger: next }, provenance: "PRODUCTION" };
    await this.#events.append(event, all.length); return next;
  }
}
