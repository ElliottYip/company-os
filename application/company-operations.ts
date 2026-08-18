import type {
  CompanyDomainEvent,
  ExactAction,
  Identifier,
} from "../core/control-plane.ts";
import type { ApprovalPublicationPort } from "../ports/approval-publication-port.ts";
import type { AuditEvidencePort } from "../ports/audit-evidence-port.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { OrganizationPrincipalPort } from "../ports/organization-principal-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

export interface DeterministicSources {
  nextId(): Identifier;
  now(): string;
  reset(): void;
}

export interface CompanyOperationsDependencies {
  readonly mode: "PRODUCTION" | "DEMO_FIXTURE";
  readonly companyId: Identifier;
  readonly actorId: Identifier;
  readonly eventStore: EventDataStorePort;
  readonly approval: ApprovalPublicationPort;
  readonly auditEvidence: AuditEvidencePort;
  readonly organization: OrganizationPrincipalPort;
  readonly sources: DeterministicSources;
  readonly work: WorkContext;
  readonly identity?: IdentityPort;
}

export interface WorkContext {
  readonly workId: Identifier;
  readonly goalInitiatorId: Identifier;
  readonly accountableHumanId: Identifier;
  readonly executingAgentId: Identifier;
  readonly responsibilityContractId: Identifier;
  readonly permissionIds: readonly Identifier[];
  readonly dataAuthorizationIds: readonly Identifier[];
  readonly approvalId: Identifier;
  readonly approvalAction: ExactAction;
  readonly approvalExpiresAt: string;
  readonly planEvidenceId: Identifier;
  readonly activityEvidenceId: Identifier;
  readonly resultEvidenceId: Identifier;
  readonly resultId: Identifier;
  readonly summaries: {
    readonly assigned: string;
    readonly plan: string;
    readonly activity: string;
    readonly approvalRequested: string;
    readonly approvalApproved: string;
    readonly approvalRejected: string;
    readonly resultEvidence: string;
    readonly completed: string;
  };
}

interface EventPayload {
  readonly summary: string;
  readonly evidenceId?: Identifier;
  readonly approvalId?: Identifier;
  readonly decision?: "APPROVED" | "REJECTED";
  readonly resultId?: Identifier;
  readonly authorizationReceiptId?: Identifier;
  readonly responsibility?: {
    readonly workId: Identifier;
    readonly goalInitiatorId: Identifier;
    readonly accountableHumanId: Identifier;
    readonly executingAgentId: Identifier;
    readonly permissionIds: readonly Identifier[];
    readonly dataAuthorizationIds: readonly Identifier[];
  };
}

export interface CompanyWorkState {
  readonly mode: "PRODUCTION" | "DEMO_FIXTURE";
  readonly phase:
    | "READY"
    | "PLANNING"
    | "SIMULATING_TOOL_ACTIVITY"
    | "AWAITING_APPROVAL"
    | "COMPLETED"
    | "REJECTED";
  readonly events: readonly {
    readonly id: Identifier;
    readonly type: string;
    readonly occurredAt: string;
    readonly summary: string;
    readonly isFixture: boolean;
  }[];
  readonly responsibility: {
    readonly workId: Identifier;
    readonly goalInitiatorId: Identifier;
    readonly accountableHumanId: Identifier;
    readonly executingAgentId: Identifier;
    readonly permissionIds: readonly Identifier[];
    readonly dataAuthorizationIds: readonly Identifier[];
    readonly approvalIds: readonly Identifier[];
    readonly evidenceIds: readonly Identifier[];
    readonly resultId: Identifier | null;
  };
}

export class CompanyOperations {
  readonly #dependencies: CompanyOperationsDependencies;

  constructor(dependencies: CompanyOperationsDependencies) {
    if (dependencies.mode === "PRODUCTION" && !dependencies.identity) {
      throw new Error("PRODUCTION_IDENTITY_REQUIRED");
    }
    this.#dependencies = dependencies;
  }

  async assignWork(): Promise<CompanyWorkState> {
    const authorizationReceiptId = await this.#authorize("work:assign");
    const organization = await this.#dependencies.organization.getOrganization(
      this.#dependencies.companyId,
    );
    if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");
    if (organization.humans.every(({ id }) => id !== this.#dependencies.actorId)) {
      throw new Error("WORK_INITIATOR_NOT_HUMAN");
    }
    const current = await this.snapshot();
    if (current.phase !== "READY") throw new Error("WORK_ALREADY_ASSIGNED");
    await this.#append("work.assigned", {
      summary: this.#dependencies.work.summaries.assigned,
      authorizationReceiptId,
    });
    return this.snapshot();
  }

  async recordPlan(): Promise<CompanyWorkState> {
    const authorizationReceiptId = await this.#authorize("work:record-plan");
    await this.#requirePhase("PLANNING");
    await this.#dependencies.auditEvidence.recordEvidence({
      id: this.#dependencies.work.planEvidenceId,
      workId: this.#dependencies.work.workId,
      kind: "PLAN",
      summary: this.#dependencies.work.summaries.plan,
      contentDigest: `sha256:${this.#dependencies.work.planEvidenceId}`,
      recordedAt: this.#dependencies.sources.now(),
      provenance: this.#dependencies.mode,
    });
    await this.#append("plan.recorded", {
      summary: this.#dependencies.work.summaries.plan,
      evidenceId: this.#dependencies.work.planEvidenceId,
      authorizationReceiptId,
    });
    return this.snapshot();
  }

  async recordToolActivity(): Promise<CompanyWorkState> {
    const authorizationReceiptId = await this.#authorize("work:record-activity");
    await this.#requirePhase("SIMULATING_TOOL_ACTIVITY");
    const state = await this.snapshot();
    if (state.events.some(({ type }) => type === "tool.activity.recorded")) {
      throw new Error("TOOL_ACTIVITY_ALREADY_RECORDED");
    }
    await this.#dependencies.auditEvidence.recordEvidence({
      id: this.#dependencies.work.activityEvidenceId,
      workId: this.#dependencies.work.workId,
      kind: "TOOL_ACTIVITY",
      summary: this.#dependencies.work.summaries.activity,
      contentDigest: `sha256:${this.#dependencies.work.activityEvidenceId}`,
      recordedAt: this.#dependencies.sources.now(),
      provenance: this.#dependencies.mode,
    });
    await this.#append("tool.activity.recorded", {
      summary: this.#dependencies.work.summaries.activity,
      evidenceId: this.#dependencies.work.activityEvidenceId,
      authorizationReceiptId,
    });
    return this.snapshot();
  }

  async requestApproval(): Promise<CompanyWorkState> {
    const authorizationReceiptId = await this.#authorize("approval:request");
    await this.#requirePhase("SIMULATING_TOOL_ACTIVITY");
    const state = await this.snapshot();
    if (!state.events.some(({ type }) => type === "tool.activity.recorded")) {
      throw new Error("TOOL_ACTIVITY_REQUIRED");
    }
    await this.#dependencies.approval.publishRequest({
      id: this.#dependencies.work.approvalId,
      companyId: this.#dependencies.companyId,
      binding: {
        action: this.#dependencies.work.approvalAction,
        workId: this.#dependencies.work.workId,
        responsibilityContractId: this.#dependencies.work.responsibilityContractId,
        executingAgentId: this.#dependencies.work.executingAgentId,
        accountableHumanId: this.#dependencies.work.accountableHumanId,
        evidenceReferences: state.responsibility.evidenceIds,
        resultReference: null,
      },
      requestedAt: this.#dependencies.sources.now(),
      expiresAt: this.#dependencies.work.approvalExpiresAt,
      status: "AWAITING_APPROVAL",
    });
    await this.#append("approval.requested", {
      summary: this.#dependencies.work.summaries.approvalRequested,
      approvalId: this.#dependencies.work.approvalId,
      authorizationReceiptId,
    });
    return this.snapshot();
  }

  async decideApproval(decision: "APPROVED" | "REJECTED"): Promise<CompanyWorkState> {
    const authorizationReceiptId = await this.#authorize(`approval:${decision.toLowerCase()}`);
    await this.#requirePhase("AWAITING_APPROVAL");
    if (this.#dependencies.actorId !== this.#dependencies.work.accountableHumanId) {
      throw new Error("APPROVAL_REQUIRES_ACCOUNTABLE_HUMAN");
    }
    await this.#dependencies.approval.publishDecision({
      requestId: this.#dependencies.work.approvalId,
      decision,
      decidedBy: this.#dependencies.actorId,
      decidedAt: this.#dependencies.sources.now(),
    });
    await this.#append("approval.decided", {
      summary: decision === "APPROVED"
        ? this.#dependencies.work.summaries.approvalApproved
        : this.#dependencies.work.summaries.approvalRejected,
      approvalId: this.#dependencies.work.approvalId,
      decision,
      authorizationReceiptId,
    });
    if (decision === "REJECTED") return this.snapshot();

    await this.#dependencies.auditEvidence.recordEvidence({
      id: this.#dependencies.work.resultEvidenceId,
      workId: this.#dependencies.work.workId,
      kind: "RESULT",
      summary: this.#dependencies.work.summaries.resultEvidence,
      contentDigest: `sha256:${this.#dependencies.work.resultEvidenceId}`,
      recordedAt: this.#dependencies.sources.now(),
      provenance: this.#dependencies.mode,
    });
    await this.#append("evidence.recorded", {
      summary: this.#dependencies.work.summaries.resultEvidence,
      evidenceId: this.#dependencies.work.resultEvidenceId,
    });
    await this.#append("work.completed", {
      summary: this.#dependencies.work.summaries.completed,
      resultId: this.#dependencies.work.resultId,
    });
    return this.snapshot();
  }

  async snapshot(): Promise<CompanyWorkState> {
    const events = await this.#dependencies.eventStore.read(this.#dependencies.companyId);
    const payloads = events.map((event) => event.payload as EventPayload);
    const latest = events.at(-1)?.type;
    const phase = latest === undefined
      ? "READY"
      : latest === "work.assigned"
        ? "PLANNING"
        : latest === "approval.requested"
          ? "AWAITING_APPROVAL"
          : latest === "approval.decided" && payloads.at(-1)?.decision === "REJECTED"
            ? "REJECTED"
            : latest === "work.completed"
              ? "COMPLETED"
              : "SIMULATING_TOOL_ACTIVITY";
    return {
      mode: this.#dependencies.mode,
      phase,
      events: events.map((event) => ({
        id: event.id,
        type: event.type,
        occurredAt: event.occurredAt,
        summary: (event.payload as EventPayload).summary,
        isFixture: event.provenance === "DEMO_FIXTURE",
      })),
      responsibility: {
        workId: this.#dependencies.work.workId,
        goalInitiatorId: this.#dependencies.work.goalInitiatorId,
        accountableHumanId: this.#dependencies.work.accountableHumanId,
        executingAgentId: this.#dependencies.work.executingAgentId,
        permissionIds: [...this.#dependencies.work.permissionIds],
        dataAuthorizationIds: [...this.#dependencies.work.dataAuthorizationIds],
        approvalIds: payloads.flatMap(({ approvalId }) => approvalId ? [approvalId] : [])
          .filter((value, index, values) => values.indexOf(value) === index),
        evidenceIds: payloads.flatMap(({ evidenceId }) => evidenceId ? [evidenceId] : []),
        resultId: payloads.findLast(({ resultId }) => resultId !== undefined)?.resultId ?? null,
      },
    };
  }

  async resetFixture(): Promise<CompanyWorkState> {
    if (this.#dependencies.mode !== "DEMO_FIXTURE") {
      throw new Error("FORMAL_STATE_CANNOT_RESET_AS_FIXTURE");
    }
    await this.#dependencies.eventStore.resetFixture(this.#dependencies.companyId);
    this.#dependencies.sources.reset();
    return this.snapshot();
  }

  async #requirePhase(expected: CompanyWorkState["phase"]): Promise<void> {
    const state = await this.snapshot();
    if (state.phase !== expected) throw new Error(`INVALID_WORK_PHASE:${state.phase}`);
  }

  async #authorize(action: string): Promise<Identifier | undefined> {
    if (this.#dependencies.mode === "DEMO_FIXTURE") return undefined;
    const identityPort = this.#dependencies.identity;
    if (!identityPort) throw new Error("PRODUCTION_IDENTITY_REQUIRED");
    const identity = await identityPort.getCurrentIdentity();
    if (!identity) throw new Error("AUTHENTICATION_REQUIRED");
    if (
      identity.assurance === "LOCAL_DEMO" ||
      identity.organizationId !== this.#dependencies.companyId ||
      identity.actorId !== this.#dependencies.actorId
    ) {
      throw new Error("FORMAL_IDENTITY_CONTEXT_MISMATCH");
    }
    const receipt = await identityPort.authorize({
      companyId: this.#dependencies.companyId,
      action,
      resourceId: this.#dependencies.work.workId,
      reason: `Operate work ${this.#dependencies.work.workId}`,
    });
    if (receipt.principalId !== identity.actorId) {
      throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    }
    return receipt.id;
  }

  async #append(type: string, payload: EventPayload): Promise<void> {
    const existing = await this.#dependencies.eventStore.read(this.#dependencies.companyId);
    const event: CompanyDomainEvent<EventPayload> = {
      id: this.#dependencies.sources.nextId(),
      companyId: this.#dependencies.companyId,
      type,
      occurredAt: this.#dependencies.sources.now(),
      actorId: this.#dependencies.actorId,
      payload: {
        ...payload,
        responsibility: {
          workId: this.#dependencies.work.workId,
          goalInitiatorId: this.#dependencies.work.goalInitiatorId,
          accountableHumanId: this.#dependencies.work.accountableHumanId,
          executingAgentId: this.#dependencies.work.executingAgentId,
          permissionIds: [...this.#dependencies.work.permissionIds],
          dataAuthorizationIds: [...this.#dependencies.work.dataAuthorizationIds],
        },
      },
      provenance: this.#dependencies.mode,
    };
    await this.#dependencies.eventStore.append(event, existing.length);
  }
}
