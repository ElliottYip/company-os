import type { CompanyDomainEvent, Identifier } from "../../core/control-plane.ts";
import type {
  ApprovalDecision,
  ApprovalPublicationPort,
  ApprovalRequest,
} from "../../ports/approval-publication-port.ts";
import type { EventDataStorePort } from "../../ports/event-data-store-port.ts";

export class EventBackedApprovalStore implements ApprovalPublicationPort {
  readonly #events: EventDataStorePort;
  readonly #companyId: Identifier;
  readonly #nextId: () => Identifier;
  readonly #now: () => string;

  constructor(
    events: EventDataStorePort,
    companyId: Identifier,
    nextId: () => Identifier,
    now: () => string,
  ) {
    this.#events = events;
    this.#companyId = companyId;
    this.#nextId = nextId;
    this.#now = now;
  }

  async publishRequest(input: ApprovalRequest): Promise<void> {
    if (input.companyId !== this.#companyId) throw new Error("Approval tenant mismatch.");
    const existing = (await this.#requests()).find(({ id }) => id === input.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(input)) throw new Error("APPROVAL_REQUEST_IDEMPOTENCY_CONFLICT");
      return;
    }
    await this.#append("approval.publication.requested", { request: structuredClone(input) });
  }

  async request(requestId: Identifier): Promise<ApprovalRequest | null> {
    return (await this.#requests()).find(({ id }) => id === requestId) ?? null;
  }

  async pending(companyId: Identifier): Promise<readonly ApprovalRequest[]> {
    if (companyId !== this.#companyId) return [];
    const decisions = new Set((await this.#decisions()).map(({ requestId }) => requestId));
    return (await this.#requests()).filter(({ id }) => !decisions.has(id));
  }

  async publishDecision(decision: ApprovalDecision): Promise<void> {
    if (!(await this.#requests()).some(({ id }) => id === decision.requestId)) {
      throw new Error("Approval request does not exist.");
    }
    if (await this.decision(decision.requestId)) throw new Error("Approval already decided.");
    await this.#append("approval.publication.decided", { decision: structuredClone(decision) });
  }

  async decision(requestId: Identifier): Promise<ApprovalDecision | null> {
    return (await this.#decisions()).find((decision) => decision.requestId === requestId) ?? null;
  }

  async #requests(): Promise<ApprovalRequest[]> {
    return (await this.#events.read(this.#companyId, { types: ["approval.publication.requested"] }))
      .map(({ payload }) => (payload as { request: ApprovalRequest }).request);
  }

  async #decisions(): Promise<ApprovalDecision[]> {
    return (await this.#events.read(this.#companyId, { types: ["approval.publication.decided"] }))
      .map(({ payload }) => (payload as { decision: ApprovalDecision }).decision);
  }

  async #append(type: string, payload: unknown): Promise<void> {
    const existing = await this.#events.read(this.#companyId);
    const event: CompanyDomainEvent = {
      id: this.#nextId(),
      companyId: this.#companyId,
      type,
      occurredAt: this.#now(),
      actorId: "approval-publication-adapter",
      payload,
      provenance: "PRODUCTION",
    };
    await this.#events.append(event, existing.length);
  }
}
