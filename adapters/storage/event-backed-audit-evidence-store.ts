import type { CompanyDomainEvent, Identifier } from "../../core/control-plane.ts";
import type {
  AuditEvidencePort,
  EvidenceRecord,
  ResponsibilityProjection,
} from "../../ports/audit-evidence-port.ts";
import type { EventDataStorePort } from "../../ports/event-data-store-port.ts";

interface ResponsibilityContext {
  readonly workId: Identifier;
  readonly goalInitiatorId: Identifier;
  readonly accountableHumanId: Identifier;
  readonly executingAgentId: Identifier;
  readonly permissionIds: readonly Identifier[];
  readonly dataAuthorizationIds: readonly Identifier[];
}

export class EventBackedAuditEvidenceStore implements AuditEvidencePort {
  readonly #events: EventDataStorePort;
  readonly #companyId: Identifier;
  readonly #nextId: () => Identifier;

  constructor(
    events: EventDataStorePort,
    companyId: Identifier,
    nextId: () => Identifier,
  ) {
    this.#events = events;
    this.#companyId = companyId;
    this.#nextId = nextId;
  }

  async recordEvidence(record: EvidenceRecord): Promise<void> {
    const current = await this.#events.read(this.#companyId);
    if (current.some(({ type, payload }) =>
      type === "evidence.persisted" &&
      (payload as { record?: EvidenceRecord }).record?.id === record.id
    )) throw new Error("Evidence already exists.");
    const event: CompanyDomainEvent = {
      id: this.#nextId(),
      companyId: this.#companyId,
      type: "evidence.persisted",
      occurredAt: record.recordedAt,
      actorId: "audit-evidence-adapter",
      payload: { record: structuredClone(record) },
      correlationId: record.workId,
      provenance: record.provenance,
    };
    await this.#events.append(event, current.length);
  }

  async projectResponsibility(workId: Identifier): Promise<ResponsibilityProjection> {
    const events = await this.#events.read(this.#companyId);
    const context = events
      .map(({ payload }) => (payload as { responsibility?: ResponsibilityContext }).responsibility)
      .find((candidate) => candidate?.workId === workId);
    if (!context) throw new Error("Responsibility context not found.");
    const evidenceReferences = events.flatMap(({ type, payload }) => {
      if (type !== "evidence.persisted") return [];
      const record = (payload as { record?: EvidenceRecord }).record;
      return record?.workId === workId ? [record.id] : [];
    });
    const approvalReferences = events.flatMap(({ payload }) => {
      const candidate = payload as { responsibility?: ResponsibilityContext; approvalId?: Identifier };
      return candidate.responsibility?.workId === workId && candidate.approvalId
        ? [candidate.approvalId]
        : [];
    });
    const resultReference = events
      .map(({ payload }) => payload as { responsibility?: ResponsibilityContext; resultId?: Identifier })
      .findLast((candidate) => candidate.responsibility?.workId === workId && candidate.resultId)
      ?.resultId ?? null;
    return {
      workId,
      goalInitiatorId: context.goalInitiatorId,
      accountableHumanId: context.accountableHumanId,
      executingAgentId: context.executingAgentId,
      permissionReferences: [...context.permissionIds],
      dataAuthorizationReferences: [...context.dataAuthorizationIds],
      approvalReferences: [...new Set(approvalReferences)],
      evidenceReferences,
      resultReference,
    };
  }
}
