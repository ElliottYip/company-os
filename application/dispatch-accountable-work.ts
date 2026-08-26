import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";
import { validateWorkDraft, type WorkDraft, type WorkItem } from "../core/work.ts";
import type { WorkAttempt } from "../core/work-attempt.ts";
import type { ModelExecutionAuthority, ModelRoutingIntent } from "../core/model-governance.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { GenericWorkPort, GenericWorkRecord } from "../ports/generic-work-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { OrganizationPrincipalPort } from "../ports/organization-principal-port.ts";
import type { ResponsibilityContractPort } from "../ports/responsibility-contract-port.ts";
import type { AgentLifecyclePort } from "../ports/agent-lifecycle-port.ts";
import type { CompanyStructurePort } from "../ports/company-structure-port.ts";
import { evaluateCompanyAgentEligibility } from "../core/agent-lifecycle.ts";
import {
  validateWorkExecutionPreparationPlan,
  type PreparedWorkExecution,
  type WorkExecutionPreparationPlan,
} from "./prepare-work-execution.ts";

export interface DispatchAccountableWorkInput {
  readonly draft: WorkDraft;
  readonly genericGoalId: Identifier | null;
  readonly executionPreparation?: WorkExecutionPreparationPlan;
}

export interface DispatchAccountableWorkResult {
  readonly work: WorkItem;
  readonly genericWork: GenericWorkRecord;
  readonly attempt?: WorkAttempt;
  readonly preparation?: PreparedWorkExecution;
  readonly connectorDelivery?: readonly unknown[];
}

export class DispatchAccountableWork {
  readonly #identity: IdentityPort;
  readonly #organization: OrganizationPrincipalPort;
  readonly #contracts: ResponsibilityContractPort;
  readonly #genericWork: GenericWorkPort;
  readonly #events: EventDataStorePort;
  readonly #lifecycle: AgentLifecyclePort;
  readonly #structure: CompanyStructurePort;
  readonly #now: () => string;
  readonly #nextId: () => Identifier;
  readonly #attemptScheduler?: {
    latestForWork?(companyId: Identifier, workId: Identifier): Promise<WorkAttempt | null>;
    execute(command: {
      readonly work: WorkItem;
      readonly responsibilityContractRevision: number;
      readonly authorizationReceiptId: Identifier;
      readonly dataAuthorizationIds?: readonly Identifier[];
      readonly modelAuthority?: ModelExecutionAuthority | null;
      readonly scheduledAt: string;
    }): Promise<WorkAttempt>;
  };
  readonly #modelResolver?: { execute(intent: ModelRoutingIntent): Promise<ModelExecutionAuthority> };
  readonly #executionPreparation?: {
    execute(input: {
      readonly work: WorkItem;
      readonly attempt: WorkAttempt;
      readonly plan: WorkExecutionPreparationPlan;
    }): Promise<PreparedWorkExecution>;
  };
  readonly #commandDelivery?: {
    execute(companyId: Identifier): Promise<readonly unknown[]>;
  };
  readonly #budgetAuthorization?: { execute(work: WorkItem): Promise<unknown> };

  constructor(dependencies: {
    readonly identity: IdentityPort;
    readonly organization: OrganizationPrincipalPort;
    readonly contracts: ResponsibilityContractPort;
    readonly genericWork: GenericWorkPort;
    readonly events: EventDataStorePort;
    readonly lifecycle: AgentLifecyclePort;
    readonly structure: CompanyStructurePort;
    readonly now: () => string;
    readonly nextId: () => Identifier;
    readonly attemptScheduler?: {
      latestForWork?(companyId: Identifier, workId: Identifier): Promise<WorkAttempt | null>;
      execute(command: {
        readonly work: WorkItem;
        readonly responsibilityContractRevision: number;
        readonly authorizationReceiptId: Identifier;
        readonly dataAuthorizationIds?: readonly Identifier[];
        readonly modelAuthority?: ModelExecutionAuthority | null;
        readonly scheduledAt: string;
      }): Promise<WorkAttempt>;
    };
    readonly modelResolver?: { execute(intent: ModelRoutingIntent): Promise<ModelExecutionAuthority> };
    readonly executionPreparation?: {
      execute(input: {
        readonly work: WorkItem;
        readonly attempt: WorkAttempt;
        readonly plan: WorkExecutionPreparationPlan;
      }): Promise<PreparedWorkExecution>;
    };
    readonly commandDelivery?: {
      execute(companyId: Identifier): Promise<readonly unknown[]>;
    };
    readonly budgetAuthorization?: { execute(work: WorkItem): Promise<unknown> };
  }) {
    this.#identity = dependencies.identity;
    this.#organization = dependencies.organization;
    this.#contracts = dependencies.contracts;
    this.#genericWork = dependencies.genericWork;
    this.#events = dependencies.events;
    this.#lifecycle = dependencies.lifecycle;
    this.#structure = dependencies.structure;
    this.#now = dependencies.now;
    this.#nextId = dependencies.nextId;
    this.#attemptScheduler = dependencies.attemptScheduler;
    this.#modelResolver = dependencies.modelResolver;
    this.#executionPreparation = dependencies.executionPreparation;
    this.#commandDelivery = dependencies.commandDelivery;
    this.#budgetAuthorization = dependencies.budgetAuthorization;
  }

  async execute(input: DispatchAccountableWorkInput): Promise<DispatchAccountableWorkResult> {
    const { draft } = input;
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== draft.companyId) throw new Error("TENANT_MISMATCH");
    if (identity.actorId !== draft.requestedBy) throw new Error("WORK_INITIATOR_IDENTITY_MISMATCH");
    const organization = await this.#organization.getOrganization(draft.companyId);
    if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");
    const [structure, lifecycle] = await Promise.all([
      this.#structure.load(draft.companyId),
      this.#lifecycle.load(draft.companyId),
    ]);
    if (!structure) throw new Error("ORGANIZATION_NOT_FOUND");
    const lifecycleAgent = evaluateCompanyAgentEligibility(structure, lifecycle)
      .find(({ id }) => id === draft.agentId);
    if (!lifecycleAgent) throw new Error("AGENT_NOT_FOUND");
    if (!lifecycleAgent.eligibility.assignable) {
      throw new Error(`AGENT_NOT_ASSIGNABLE:${lifecycleAgent.eligibility.assignabilityReason}`);
    }
    const responsibility = await this.#contracts.load(draft.companyId);
    const allEvents = await this.#events.read(draft.companyId);
    const existing = this.#existingWork(allEvents);
    const work = validateWorkDraft(draft, organization, responsibility.contracts, existing);
    const previous = existing.find(({ id }) => id === work.id);
    const plan = input.executionPreparation
      ? validateWorkExecutionPreparationPlan(input.executionPreparation)
      : null;
    const requiresPreparation = Boolean(plan &&
      (plan.dataAccess.length || plan.secretLeases.length || plan.modelRouting));

    // A replay of the same durable Work remains idempotent even when spend
    // reaches a hard stop later. Only a new dispatch consumes current budget authority.
    if (!previous) await this.#budgetAuthorization?.execute(work);

    const receipt = await this.#identity.authorize({
      companyId: draft.companyId,
      action: "work:dispatch",
      resourceId: work.id,
      reason: "Dispatch accountable work to the Company OS work system",
    });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");

    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(work)) {
        throw new Error("WORK_IDEMPOTENCY_CONFLICT");
      }
      const generic = await this.#genericWork.getWork(work.companyId, work.id);
      if (!generic.ok) throw new Error(`GENERIC_WORK_DISPATCH_FAILED:${generic.error.code}`);
      return this.#schedulePrepareAndDeliver(
        work, generic.value, responsibility.revision, receipt.id,
        requiresPreparation ? plan : null,
      );
    }

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
      genericGoalId: input.genericGoalId,
    });
    return this.#schedulePrepareAndDeliver(
      work, generic.value, responsibility.revision, receipt.id,
      requiresPreparation ? plan : null,
    );
  }

  async #schedulePrepareAndDeliver(
    work: WorkItem,
    genericWork: GenericWorkRecord,
    responsibilityContractRevision: number,
    authorizationReceiptId: Identifier,
    plan: WorkExecutionPreparationPlan | null,
  ): Promise<DispatchAccountableWorkResult> {
    if (plan) {
      if (!this.#executionPreparation) throw new Error("WORK_EXECUTION_PREPARATION_UNAVAILABLE");
      await this.#recordPreparationRequested(work, plan);
    }
    const existingAttempt = await this.#attemptScheduler?.latestForWork?.(work.companyId, work.id);
    let modelAuthority: ModelExecutionAuthority | null = existingAttempt?.authority.model ?? null;
    if (!existingAttempt && plan?.modelRouting) {
      if (!this.#modelResolver) throw new Error("MODEL_ROUTING_UNAVAILABLE");
      modelAuthority = await this.#modelResolver.execute(plan.modelRouting);
    }
    const attempt = await this.#attemptScheduler?.execute({
      work,
      responsibilityContractRevision,
      authorizationReceiptId,
      ...(plan ? { dataAuthorizationIds: plan.dataAccess.map(({ contractId }) => contractId) } : {}),
      ...(modelAuthority ? { modelAuthority } : {}),
      scheduledAt: this.#now(),
    });
    const preparation = attempt && plan
      ? await this.#executionPreparation?.execute({ work, attempt, plan })
      : undefined;
    const connectorDelivery = attempt
      ? await this.#commandDelivery?.execute(work.companyId)
      : undefined;
    return {
      work, genericWork,
      ...(attempt ? { attempt } : {}),
      ...(preparation ? { preparation } : {}),
      ...(connectorDelivery ? { connectorDelivery } : {}),
    };
  }

  async #recordPreparationRequested(work: WorkItem, plan: WorkExecutionPreparationPlan): Promise<void> {
    const current = await this.#events.read(work.companyId);
    const exists = current.some((event) => event.type === "work-execution.preparation-requested" &&
      (event.payload as { readonly workId?: Identifier }).workId === work.id);
    if (exists) return;
    await this.#events.append({
      id: this.#nextId(), companyId: work.companyId, type: "work-execution.preparation-requested",
      occurredAt: this.#now(), actorId: work.requestedBy, correlationId: work.id,
      payload: {
        workId: work.id,
        plan: structuredClone(plan),
        dataRequestIds: plan.dataAccess.map(({ requestId }) => requestId),
        dataAuthorizationIds: plan.dataAccess.map(({ contractId }) => contractId),
        secretReferenceIds: plan.secretLeases.map(({ secretReferenceId }) => secretReferenceId),
      },
      provenance: "PRODUCTION",
    }, current.length);
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
