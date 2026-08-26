import type { CompanyDomainEvent, Identifier } from "../../core/control-plane.ts";
import type {
  CancelGenericRunCommand,
  CreateGenericWorkCommand,
  GenericRunEventPage,
  GenericWorkFailure,
  GenericWorkPage,
  GenericWorkPort,
  GenericWorkRecord,
  GenericWorkResult,
} from "../../ports/generic-work-port.ts";
import type { EventDataStorePort } from "../../ports/event-data-store-port.ts";

function failure(code: string, category: GenericWorkFailure["category"]): GenericWorkResult<never> {
  return { ok: false, error: { code, category, retryable: false } };
}

export class EventBackedGenericWorkStore implements GenericWorkPort {
  readonly #events: EventDataStorePort;
  readonly #now: () => string;
  readonly #nextId: () => Identifier;

  constructor(events: EventDataStorePort, now: () => string, nextId: () => Identifier) {
    this.#events = events;
    this.#now = now;
    this.#nextId = nextId;
  }

  async createWork(command: CreateGenericWorkCommand): Promise<GenericWorkResult<GenericWorkRecord>> {
    const existing = await this.#records(command.companyId);
    const duplicate = existing.find(({ id }) => id === command.id);
    if (duplicate) return { ok: true, value: duplicate };
    const timestamp = this.#now();
    const record: GenericWorkRecord = {
      id: command.id,
      companyId: command.companyId,
      title: command.title,
      goalId: command.goalId,
      assigneeId: command.assigneeId,
      status: "PENDING",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const events = await this.#events.read(command.companyId);
    const event: CompanyDomainEvent = {
      id: this.#nextId(),
      companyId: command.companyId,
      type: "generic-work.created",
      occurredAt: timestamp,
      actorId: "generic-work-store",
      payload: { record, idempotencyKey: command.idempotencyKey },
      correlationId: command.id,
      provenance: "PRODUCTION",
    };
    try {
      await this.#events.append(event, events.length);
      return { ok: true, value: record };
    } catch (error) {
      if (error instanceof Error && error.message === "EVENT_SEQUENCE_CONFLICT") {
        const raced = (await this.#records(command.companyId)).find(({ id }) => id === command.id);
        if (raced) return { ok: true, value: raced };
      }
      return failure("GENERIC_WORK_PERSISTENCE_FAILED", "INFRASTRUCTURE_UNAVAILABLE");
    }
  }

  async getWork(companyId: Identifier, workId: Identifier): Promise<GenericWorkResult<GenericWorkRecord>> {
    const record = (await this.#records(companyId)).find(({ id }) => id === workId);
    return record ? { ok: true, value: record } : failure("GENERIC_WORK_NOT_FOUND", "NOT_FOUND");
  }

  async listWork(query: { readonly companyId: Identifier; readonly cursor?: string; readonly limit: number }): Promise<GenericWorkResult<GenericWorkPage>> {
    const offset = query.cursor ? Number(query.cursor) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(query.limit) || query.limit < 1) {
      return failure("GENERIC_WORK_PAGE_INVALID", "INVALID_REQUEST");
    }
    const records = await this.#records(query.companyId);
    const items = records.slice(offset, offset + query.limit);
    const next = offset + items.length;
    return { ok: true, value: { items, nextCursor: next < records.length ? String(next) : null } };
  }

  async cancelRun(_command: CancelGenericRunCommand): Promise<GenericWorkResult<void>> {
    return failure("GENERIC_RUN_NOT_FOUND", "NOT_FOUND");
  }

  async listRunEvents(): Promise<GenericWorkResult<GenericRunEventPage>> {
    return { ok: true, value: { items: [], nextSequence: null } };
  }

  async #records(companyId: Identifier): Promise<GenericWorkRecord[]> {
    return (await this.#events.read(companyId, { types: ["generic-work.created"] }))
      .map(({ payload }) => structuredClone((payload as { record: GenericWorkRecord }).record));
  }
}
