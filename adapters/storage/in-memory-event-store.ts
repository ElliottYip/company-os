import type { CompanyDomainEvent, Identifier } from "../../core/control-plane.ts";
import type {
  AppendResult,
  EventDataStorePort,
  EventReadOptions,
} from "../../ports/event-data-store-port.ts";

export class InMemoryEventStore implements EventDataStorePort {
  readonly #streams = new Map<Identifier, CompanyDomainEvent[]>();

  async append(event: CompanyDomainEvent, expectedSequence?: number): Promise<AppendResult> {
    const stream = this.#streams.get(event.companyId) ?? [];
    if (expectedSequence !== undefined && stream.length !== expectedSequence) {
      throw new Error(`Sequence conflict: expected ${expectedSequence}, found ${stream.length}.`);
    }
    if (stream.some(({ id }) => id === event.id)) throw new Error(`Duplicate event ID: ${event.id}.`);
    stream.push(structuredClone(event));
    this.#streams.set(event.companyId, stream);
    return { sequence: stream.length, storedAt: event.occurredAt };
  }

  async read(
    companyId: Identifier,
    options: EventReadOptions = {},
  ): Promise<readonly CompanyDomainEvent[]> {
    return structuredClone((this.#streams.get(companyId) ?? [])
      .slice(options.afterSequence ?? 0)
      .filter((event) => !options.types || options.types.includes(event.type)));
  }

  async resetFixture(companyId: Identifier): Promise<void> {
    const stream = this.#streams.get(companyId) ?? [];
    if (stream.some(({ provenance }) => provenance !== "DEMO_FIXTURE")) {
      throw new Error("Production event streams cannot be reset.");
    }
    this.#streams.delete(companyId);
  }
}
