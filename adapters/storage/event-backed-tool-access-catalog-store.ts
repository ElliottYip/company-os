import type { CompanyDomainEvent, Identifier } from "../../core/control-plane.ts";
import type { ToolAccessCatalog } from "../../core/tool-access.ts";
import type { EventDataStorePort } from "../../ports/event-data-store-port.ts";
import type { ToolAccessCatalogPort } from "../../ports/tool-access-catalog-port.ts";

export class EventBackedToolAccessCatalogStore implements ToolAccessCatalogPort {
  readonly #events: EventDataStorePort;
  readonly #nextId: () => Identifier;
  constructor(events: EventDataStorePort, nextId: () => Identifier) {
    this.#events = events; this.#nextId = nextId;
  }
  async load(companyId: Identifier): Promise<ToolAccessCatalog> {
    const event = (await this.#events.read(companyId, { types: ["tool-access.catalog.replaced"] })).at(-1);
    return event ? structuredClone((event.payload as { catalog: ToolAccessCatalog }).catalog)
      : { companyId, revision: 0, profiles: [], entries: [], bindings: [], policies: [] };
  }
  async replace(catalog: ToolAccessCatalog, expectedRevision: number, actorId: Identifier, occurredAt: string) {
    const current = await this.load(catalog.companyId);
    if (current.revision !== expectedRevision) throw new Error("TOOL_ACCESS_REVISION_CONFLICT");
    const next = structuredClone({ ...catalog, revision: expectedRevision + 1 });
    const all = await this.#events.read(catalog.companyId);
    const event: CompanyDomainEvent = { id: this.#nextId(), companyId: catalog.companyId,
      type: "tool-access.catalog.replaced", occurredAt, actorId, payload: { catalog: next }, provenance: "PRODUCTION" };
    await this.#events.append(event, all.length);
    return next;
  }
}
