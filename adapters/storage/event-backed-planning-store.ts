import type { CompanyDomainEvent, Identifier } from "../../core/control-plane.ts";
import type { PlanningCatalog } from "../../core/planning.ts";
import type { EventDataStorePort } from "../../ports/event-data-store-port.ts";
import type { PlanningStorePort } from "../../ports/planning-store-port.ts";

export class EventBackedPlanningStore implements PlanningStorePort {
  readonly #events: EventDataStorePort;
  readonly #nextId: () => Identifier;
  constructor(events: EventDataStorePort, nextId: () => Identifier) {
    this.#events = events;
    this.#nextId = nextId;
  }
  async load(companyId: Identifier): Promise<PlanningCatalog> {
    for (const event of [...await this.#events.read(companyId)].reverse()) {
      if (event.type === "planning.catalog.replaced") {
        return structuredClone((event.payload as { catalog: PlanningCatalog }).catalog);
      }
      if (event.type === "organization.revised") {
        const catalog = (event.payload as { planningCatalog?: PlanningCatalog }).planningCatalog;
        if (catalog) return structuredClone(catalog);
      }
    }
    return { companyId, revision: 0, goals: [], projects: [] };
  }
  async replace(catalog: PlanningCatalog, expectedRevision: number, actorId: Identifier, occurredAt: string): Promise<PlanningCatalog> {
    const current = await this.load(catalog.companyId);
    if (current.revision !== expectedRevision) throw new Error("PLANNING_REVISION_CONFLICT");
    const next = structuredClone({ ...catalog, revision: expectedRevision + 1 });
    const all = await this.#events.read(catalog.companyId);
    const event: CompanyDomainEvent = { id: this.#nextId(), companyId: catalog.companyId,
      type: "planning.catalog.replaced", occurredAt, actorId, payload: { catalog: next }, provenance: "PRODUCTION" };
    await this.#events.append(event, all.length);
    return next;
  }
}
