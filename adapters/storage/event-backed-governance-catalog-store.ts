import type { CompanyDomainEvent, Identifier } from "../../core/control-plane.ts";
import type { EventDataStorePort } from "../../ports/event-data-store-port.ts";
import type {
  GovernanceCatalogPort,
  GovernanceCatalogSnapshot,
  ReplaceGovernanceCatalogCommand,
} from "../../ports/governance-catalog-port.ts";

const EVENT_TYPE = "governance.catalog.replaced";

export class EventBackedGovernanceCatalogStore implements GovernanceCatalogPort {
  readonly #events: EventDataStorePort;
  readonly #nextId: () => Identifier;

  constructor(events: EventDataStorePort, nextId: () => Identifier) {
    this.#events = events;
    this.#nextId = nextId;
  }

  async load(companyId: Identifier): Promise<GovernanceCatalogSnapshot> {
    const event = (await this.#events.read(companyId, { types: [EVENT_TYPE] })).at(-1);
    if (!event) {
      return { revision: 0, companyId, modelRoutingPolicies: [], dataAuthorizationContracts: [] };
    }
    const snapshot = event.payload as Partial<GovernanceCatalogSnapshot>;
    if (!Number.isSafeInteger(snapshot.revision) ||
        !Array.isArray(snapshot.modelRoutingPolicies) ||
        !Array.isArray(snapshot.dataAuthorizationContracts) ||
        snapshot.companyId !== companyId) throw new Error("GOVERNANCE_CATALOG_CORRUPT");
    return structuredClone(snapshot as GovernanceCatalogSnapshot);
  }

  async replace(command: ReplaceGovernanceCatalogCommand): Promise<GovernanceCatalogSnapshot> {
    const events = await this.#events.read(command.companyId);
    const current = await this.load(command.companyId);
    if (current.revision !== command.expectedRevision) {
      throw new Error("GOVERNANCE_CATALOG_REVISION_CONFLICT");
    }
    const next: GovernanceCatalogSnapshot = {
      revision: current.revision + 1,
      companyId: command.companyId,
      modelRoutingPolicies: structuredClone(command.modelRoutingPolicies),
      dataAuthorizationContracts: structuredClone(command.dataAuthorizationContracts),
    };
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
