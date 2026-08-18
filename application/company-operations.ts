import type {
  CompanyDomainEvent,
  Identifier,
} from "../core/control-plane.ts";
import type { ApprovalPublicationPort } from "../ports/approval-publication-port.ts";
import type { AuditEvidencePort } from "../ports/audit-evidence-port.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { OrganizationPrincipalPort } from "../ports/organization-principal-port.ts";

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
}

interface EventPayload {
  readonly summary: string;
  readonly evidenceId?: Identifier;
  readonly approvalId?: Identifier;
  readonly decision?: "APPROVED" | "REJECTED";
  readonly resultId?: Identifier;
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

const WORK_ID = "demo-work-001";

export class CompanyOperations {
  readonly #dependencies: CompanyOperationsDependencies;

  constructor(dependencies: CompanyOperationsDependencies) {
    this.#dependencies = dependencies;
  }

  async assignWork(): Promise<CompanyWorkState> {
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
      summary: "Agent Boss 分配演示市场简报任务",
    });
    return this.snapshot();
  }

  async recordPlan(): Promise<CompanyWorkState> {
    await this.#requirePhase("PLANNING");
    await this.#append("plan.recorded", {
      summary: "演示 Agent 形成确定性三步计划",
      evidenceId: "demo-evidence-plan",
    });
    return this.snapshot();
  }

  async recordToolActivity(): Promise<CompanyWorkState> {
    await this.#requirePhase("SIMULATING_TOOL_ACTIVITY");
    const state = await this.snapshot();
    if (state.events.some(({ type }) => type === "tool.activity.recorded")) {
      throw new Error("TOOL_ACTIVITY_ALREADY_RECORDED");
    }
    await this.#append("tool.activity.recorded", {
      summary: "模拟读取获准的演示市场数据",
      evidenceId: "demo-evidence-tool",
    });
    return this.snapshot();
  }

  async requestApproval(): Promise<CompanyWorkState> {
    await this.#requirePhase("SIMULATING_TOOL_ACTIVITY");
    const state = await this.snapshot();
    if (!state.events.some(({ type }) => type === "tool.activity.recorded")) {
      throw new Error("TOOL_ACTIVITY_REQUIRED");
    }
    await this.#dependencies.approval.publishRequest({
      id: "demo-approval-001",
      companyId: this.#dependencies.companyId,
      binding: {
        action: {
          id: "demo-action-publish",
          type: "publish-content",
          description: "发布演示市场简报",
          inputDigest: "sha256:demo-publish-action",
          risk: "HIGH",
        },
        workId: WORK_ID,
        responsibilityContractId: "demo-contract-researcher",
        executingAgentId: "demo-researcher",
        accountableHumanId: "demo-boss",
        evidenceReferences: state.responsibility.evidenceIds,
        resultReference: null,
      },
      requestedAt: this.#dependencies.sources.now(),
      expiresAt: "2026-08-18T08:10:00.000Z",
      status: "AWAITING_APPROVAL",
    });
    await this.#append("approval.requested", {
      summary: "高风险发布动作已暂停，等待真人决定",
      approvalId: "demo-approval-001",
    });
    return this.snapshot();
  }

  async decideApproval(decision: "APPROVED" | "REJECTED"): Promise<CompanyWorkState> {
    await this.#requirePhase("AWAITING_APPROVAL");
    await this.#dependencies.approval.publishDecision({
      requestId: "demo-approval-001",
      decision,
      decidedBy: this.#dependencies.actorId,
      decidedAt: this.#dependencies.sources.now(),
    });
    await this.#append("approval.decided", {
      summary: decision === "APPROVED" ? "真人批准模拟发布动作" : "真人拒绝模拟发布动作",
      approvalId: "demo-approval-001",
      decision,
    });
    if (decision === "REJECTED") return this.snapshot();

    await this.#dependencies.auditEvidence.recordEvidence({
      id: "demo-evidence-result",
      workId: WORK_ID,
      kind: "RESULT",
      summary: "演示市场简报结果",
      contentDigest: "sha256:demo-result",
      recordedAt: this.#dependencies.sources.now(),
      provenance: this.#dependencies.mode,
    });
    await this.#append("evidence.recorded", {
      summary: "结果证据已记录",
      evidenceId: "demo-evidence-result",
    });
    await this.#append("work.completed", {
      summary: "真人批准后形成演示结果与完整责任链",
      resultId: "demo-result-001",
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
        workId: WORK_ID,
        goalInitiatorId: this.#dependencies.actorId,
        accountableHumanId: "demo-boss",
        executingAgentId: "demo-researcher",
        permissionIds: ["permission-read-demo", "permission-publish-demo"],
        dataAuthorizationIds: ["data-contract-demo-market"],
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

  async #append(type: string, payload: EventPayload): Promise<void> {
    const existing = await this.#dependencies.eventStore.read(this.#dependencies.companyId);
    const event: CompanyDomainEvent<EventPayload> = {
      id: this.#dependencies.sources.nextId(),
      companyId: this.#dependencies.companyId,
      type,
      occurredAt: this.#dependencies.sources.now(),
      actorId: this.#dependencies.actorId,
      payload,
      provenance: this.#dependencies.mode,
    };
    await this.#dependencies.eventStore.append(event, existing.length);
  }
}

