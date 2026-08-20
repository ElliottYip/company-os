import type { CompanyDomainEvent, Identifier } from "../../core/control-plane.ts";
import type {
  ConnectorCatalogPort,
  ConnectorCatalogSnapshot,
  ReplaceConnectorCatalogCommand,
} from "../../ports/connector-catalog-port.ts";
import type { EventDataStorePort } from "../../ports/event-data-store-port.ts";

const EVENT_TYPE = "connector.catalog.replaced";

export class EventBackedConnectorCatalogStore implements ConnectorCatalogPort {
  readonly #events: EventDataStorePort;
  readonly #nextId: () => Identifier;

  constructor(events: EventDataStorePort, nextId: () => Identifier) {
    this.#events = events;
    this.#nextId = nextId;
  }

  async load(companyId: Identifier): Promise<ConnectorCatalogSnapshot> {
    const event = (await this.#events.read(companyId, { types: [EVENT_TYPE] })).at(-1);
    if (!event) return { revision: 0, connectors: [] };
    const snapshot = event.payload as Partial<ConnectorCatalogSnapshot>;
    if (!Number.isSafeInteger(snapshot.revision) || !Array.isArray(snapshot.connectors)) {
      throw new Error("CONNECTOR_CATALOG_CORRUPT");
    }
    return structuredClone(snapshot as ConnectorCatalogSnapshot);
  }

  async replace(command: ReplaceConnectorCatalogCommand): Promise<ConnectorCatalogSnapshot> {
    const events = await this.#events.read(command.companyId);
    const current = await this.load(command.companyId);
    if (current.revision !== command.expectedRevision) {
      throw new Error("CONNECTOR_CATALOG_REVISION_CONFLICT");
    }
    const next = { revision: current.revision + 1, connectors: structuredClone(command.connectors) };
    const event: CompanyDomainEvent = {
      id: this.#nextId(),
      companyId: command.companyId,
      type: EVENT_TYPE,
      occurredAt: command.recordedAt,
      actorId: command.actorId,
      payload: next,
      provenance: "PRODUCTION",
    };
    await this.#events.append(event, events.length);
    return next;
  }
}
