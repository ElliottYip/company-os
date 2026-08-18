import type { CompanyDomainEvent, Identifier } from "../../core/control-plane.ts";
import type { EventDataStorePort } from "../../ports/event-data-store-port.ts";
import type {
  ReplaceResponsibilityContractsInput,
  ResponsibilityContractPort,
  ResponsibilityContractSnapshot,
} from "../../ports/responsibility-contract-port.ts";

const EVENT_TYPE = "responsibility.contracts.replaced";

export class EventBackedResponsibilityContractStore implements ResponsibilityContractPort {
  readonly #events: EventDataStorePort;
  readonly #nextId: () => Identifier;

  constructor(events: EventDataStorePort, nextId: () => Identifier) {
    this.#events = events;
    this.#nextId = nextId;
  }

  async load(companyId: Identifier): Promise<ResponsibilityContractSnapshot> {
    const events = await this.#events.read(companyId, { types: [EVENT_TYPE] });
    const latest = events.at(-1);
    if (!latest) return { revision: 0, contracts: [] };
    const payload = latest.payload as Partial<ResponsibilityContractSnapshot>;
    if (!Number.isInteger(payload.revision) || !Array.isArray(payload.contracts)) {
      throw new Error("Stored responsibility contract snapshot is invalid.");
    }
    return structuredClone(payload as ResponsibilityContractSnapshot);
  }

  async replace(input: ReplaceResponsibilityContractsInput): Promise<ResponsibilityContractSnapshot> {
    const allEvents = await this.#events.read(input.companyId);
    const current = await this.load(input.companyId);
    if (current.revision !== input.expectedRevision) {
      throw new Error("Responsibility contract revision conflict.");
    }
    const snapshot: ResponsibilityContractSnapshot = {
      revision: current.revision + 1,
      contracts: structuredClone(input.contracts),
    };
    const event: CompanyDomainEvent = {
      id: this.#nextId(),
      companyId: input.companyId,
      type: EVENT_TYPE,
      occurredAt: input.recordedAt,
      actorId: input.actorId,
      payload: snapshot,
      provenance: "PRODUCTION",
    };
    await this.#events.append(event, allEvents.length);
    return snapshot;
  }
}
