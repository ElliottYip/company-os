import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";
import { validateWorkDraft, type WorkDraft, type WorkItem } from "../core/work.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { GenericWorkPort, GenericWorkRecord } from "../ports/generic-work-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { OrganizationPrincipalPort } from "../ports/organization-principal-port.ts";
import type { ResponsibilityContractPort } from "../ports/responsibility-contract-port.ts";

export interface DispatchAccountableWorkInput {
  readonly draft: WorkDraft;
  readonly genericGoalId: Identifier | null;
}

export interface DispatchAccountableWorkResult {
  readonly work: WorkItem;
  readonly genericWork: GenericWorkRecord;
}

export class DispatchAccountableWork {
  readonly #identity: IdentityPort;
  readonly #organization: OrganizationPrincipalPort;
  readonly #contracts: ResponsibilityContractPort;
  readonly #genericWork: GenericWorkPort;
  readonly #events: EventDataStorePort;
  readonly #now: () => string;
  readonly #nextId: () => Identifier;

  constructor(dependencies: {
    readonly identity: IdentityPort;
    readonly organization: OrganizationPrincipalPort;
    readonly contracts: ResponsibilityContractPort;
    readonly genericWork: GenericWorkPort;
    readonly events: EventDataStorePort;
    readonly now: () => string;
    readonly nextId: () => Identifier;
  }) {
    this.#identity = dependencies.identity;
    this.#organization = dependencies.organization;
    this.#contracts = dependencies.contracts;
    this.#genericWork = dependencies.genericWork;
    this.#events = dependencies.events;
    this.#now = dependencies.now;
    this.#nextId = dependencies.nextId;
  }

  async execute(input: DispatchAccountableWorkInput): Promise<DispatchAccountableWorkResult> {
    const { draft } = input;
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== draft.companyId) throw new Error("TENANT_MISMATCH");
    if (identity.actorId !== draft.requestedBy) throw new Error("WORK_INITIATOR_IDENTITY_MISMATCH");
    const organization = await this.#organization.getOrganization(draft.companyId);
    if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");
    const responsibility = await this.#contracts.load(draft.companyId);
    const allEvents = await this.#events.read(draft.companyId);
    const existing = this.#existingWork(allEvents);
    const work = validateWorkDraft(draft, organization, responsibility.contracts, existing);

    const receipt = await this.#identity.authorize({
      companyId: draft.companyId,
      action: "work:dispatch",
      resourceId: work.id,
      reason: "Dispatch accountable work to the Company OS work system",
    });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");

    await this.#append(draft.companyId, identity.actorId, "work.dispatch-requested", {
      work,
      authorizationReceiptId: receipt.id,
      responsibilityContractId: work.responsibilityContractId,
    });
    const generic = await this.#genericWork.createWork({
      id: work.id,
      companyId: work.companyId,
      title: work.title,
      description: work.goal,
      goalId: input.genericGoalId,
      assigneeId: work.agentId,
      idempotencyKey: `${work.companyId}:${work.id}:v1`,
    });
    if (!generic.ok) {
      await this.#append(draft.companyId, identity.actorId, "work.dispatch-failed", {
        workId: work.id,
        code: generic.error.code,
        retryable: generic.error.retryable,
      });
      throw new Error(`GENERIC_WORK_DISPATCH_FAILED:${generic.error.code}`);
    }
    await this.#append(draft.companyId, identity.actorId, "work.dispatched", {
      work,
      genericStatus: generic.value.status,
    });
    return { work, genericWork: generic.value };
  }

  #existingWork(events: readonly CompanyDomainEvent[]): WorkItem[] {
    return events.flatMap((event) => {
      if (event.type !== "work.dispatched") return [];
      const payload = event.payload as { readonly work?: WorkItem };
      return payload.work ? [payload.work] : [];
    });
  }

  async #append(companyId: Identifier, actorId: Identifier, type: string, payload: unknown) {
    const events = await this.#events.read(companyId);
    await this.#events.append({
      id: this.#nextId(),
      companyId,
      type,
      occurredAt: this.#now(),
      actorId,
      payload,
      provenance: "PRODUCTION",
    }, events.length);
  }
}
