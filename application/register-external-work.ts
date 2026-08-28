import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";
import {
  externalWorkIdentity,
  validateExternalWork,
  type ExternalWorkInput,
  type ExternalWorkRecord,
} from "../core/cross-source-work.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";

export interface ExternalWorkOutcome {
  readonly status: "RECORDED" | "REPLAYED" | "UPDATED";
  readonly record: ExternalWorkRecord;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

export class RegisterExternalWork {
  readonly #events: EventDataStorePort;
  readonly #nextId: () => Identifier;

  constructor(dependencies: {
    readonly events: EventDataStorePort;
    readonly nextId: () => Identifier;
  }) {
    this.#events = dependencies.events;
    this.#nextId = dependencies.nextId;
  }

  async registerObserved(input: ExternalWorkInput): Promise<ExternalWorkOutcome> {
    const candidate = validateExternalWork(input, "OBSERVED");
    const current = await this.#matching(candidate);
    if (current) {
      if (canonical(current) !== canonical(candidate)) {
        throw new Error("OBSERVED_WORK_REFERENCE_CONFLICT");
      }
      return { status: "REPLAYED", record: current };
    }
    await this.#append(candidate);
    return { status: "RECORDED", record: candidate };
  }

  async synchronizeFederated(input: ExternalWorkInput): Promise<ExternalWorkOutcome> {
    const candidate = validateExternalWork(input, "FEDERATED");
    const current = await this.#matching(candidate);
    if (current) {
      if (candidate.sourceRevision < current.sourceRevision) {
        throw new Error("FEDERATED_WORK_SOURCE_REVISION_STALE");
      }
      if (candidate.sourceRevision === current.sourceRevision) {
        if (canonical(current) !== canonical(candidate)) {
          throw new Error("FEDERATED_WORK_SOURCE_REVISION_CONFLICT");
        }
        return { status: "REPLAYED", record: current };
      }
      await this.#append(candidate);
      return { status: "UPDATED", record: candidate };
    }
    await this.#append(candidate);
    return { status: "RECORDED", record: candidate };
  }

  async list(companyId: Identifier): Promise<readonly ExternalWorkRecord[]> {
    const records = new Map<string, ExternalWorkRecord>();
    const events = await this.#events.read(companyId, {
      types: ["portfolio-work.recorded"],
    });
    for (const event of events) {
      const record = (event.payload as { readonly record?: ExternalWorkRecord }).record;
      if (record?.companyId === companyId) records.set(externalWorkIdentity(record), record);
    }
    return [...records.values()].map((record) => structuredClone(record));
  }

  async #matching(candidate: ExternalWorkRecord): Promise<ExternalWorkRecord | null> {
    return (await this.list(candidate.companyId))
      .find((record) => externalWorkIdentity(record) === externalWorkIdentity(candidate)) ?? null;
  }

  async #append(record: ExternalWorkRecord): Promise<void> {
    const existing = await this.#events.read(record.companyId);
    const event: CompanyDomainEvent = {
      id: this.#nextId(),
      companyId: record.companyId,
      type: "portfolio-work.recorded",
      occurredAt: record.synchronizedAt,
      actorId: record.source.connectorId,
      payload: { record: structuredClone(record) },
      correlationId: record.id,
      provenance: record.provenance,
    };
    await this.#events.append(event, existing.length);
  }
}

