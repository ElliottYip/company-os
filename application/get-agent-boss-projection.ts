import type { Identifier } from "../core/control-plane.ts";
import type { OrganizationDraft } from "../core/organization.ts";
import type { ResponsibilityContract } from "../core/responsibility.ts";
import type { WorkItem } from "../core/work.ts";
import type { WorkAttemptStatus } from "../core/work-attempt.ts";
import type { ApprovalPublicationPort, ApprovalRequest } from "../ports/approval-publication-port.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { OrganizationPrincipalPort } from "../ports/organization-principal-port.ts";
import type { ResponsibilityContractPort } from "../ports/responsibility-contract-port.ts";
import type { AgentLifecyclePort } from "../ports/agent-lifecycle-port.ts";
import type { CompanyStructurePort } from "../ports/company-structure-port.ts";
import {
  evaluateCompanyAgentEligibility,
  type AgentLifecycleRecord,
  type AgentWorkEligibility,
} from "../core/agent-lifecycle.ts";

export interface AgentBossAttemptProjection {
  readonly id: Identifier;
  readonly workId: Identifier;
  readonly status: WorkAttemptStatus;
  readonly attemptNumber: number;
  readonly evidenceReferences: readonly Identifier[];
  readonly resultId: Identifier | null;
  readonly reconciliation: {
    readonly resolution: "CONFIRMED_SUCCEEDED" | "CONFIRMED_FAILED" | "SAFE_TO_RETRY";
    readonly evidenceId: Identifier;
    readonly resolvedAt: string;
  } | null;
  readonly preparationStatus: "NOT_REQUIRED" | "PENDING" | "PREPARED";
}

export interface AgentBossProjection {
  readonly schemaVersion: 1;
  readonly mode: "PRODUCTION";
  readonly viewer: {
    readonly actorId: Identifier;
    readonly displayName: string;
  };
  readonly organization: OrganizationDraft;
  readonly responsibilities: {
    readonly revision: number;
    readonly contracts: readonly ResponsibilityContract[];
  };
  readonly agentLifecycle: {
    readonly revision: number;
    readonly agents: readonly (AgentLifecycleRecord & {
      readonly eligibility: AgentWorkEligibility;
    })[];
  };
  readonly work: readonly WorkItem[];
  readonly attempts: readonly AgentBossAttemptProjection[];
  readonly pendingApprovals: readonly ApprovalRequest[];
  readonly generatedAt: string;
}

const ATTEMPT_STATUSES = new Set<WorkAttemptStatus>([
  "QUEUED", "LEASED", "RUNNING", "AWAITING_APPROVAL", "SUCCEEDED",
  "CANCELLATION_REQUESTED", "FAILED", "CANCELLED", "TIMED_OUT", "OUTCOME_UNKNOWN",
]);

function attemptProjection(value: unknown): AgentBossAttemptProjection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || typeof candidate.workId !== "string" ||
      !ATTEMPT_STATUSES.has(candidate.status as WorkAttemptStatus) ||
      !Number.isSafeInteger(candidate.attemptNumber)) return null;
  const rawReconciliation = candidate.reconciliation && typeof candidate.reconciliation === "object" &&
    !Array.isArray(candidate.reconciliation) ? candidate.reconciliation as Record<string, unknown> : null;
  const reconciliation = rawReconciliation &&
    ["CONFIRMED_SUCCEEDED", "CONFIRMED_FAILED", "SAFE_TO_RETRY"].includes(String(rawReconciliation.resolution)) &&
    typeof rawReconciliation.evidenceId === "string" && typeof rawReconciliation.resolvedAt === "string"
    ? { resolution: rawReconciliation.resolution as "CONFIRMED_SUCCEEDED" | "CONFIRMED_FAILED" | "SAFE_TO_RETRY",
        evidenceId: rawReconciliation.evidenceId, resolvedAt: rawReconciliation.resolvedAt }
    : null;
  return {
    id: candidate.id,
    workId: candidate.workId,
    status: candidate.status as WorkAttemptStatus,
    attemptNumber: candidate.attemptNumber as number,
    evidenceReferences: [],
    resultId: typeof candidate.resultId === "string" ? candidate.resultId : null,
    reconciliation,
    preparationStatus: "NOT_REQUIRED",
  };
}

export class GetAgentBossProjection {
  readonly #identity: IdentityPort;
  readonly #organization: OrganizationPrincipalPort;
  readonly #responsibilities: ResponsibilityContractPort;
  readonly #approvals: ApprovalPublicationPort;
  readonly #events: EventDataStorePort;
  readonly #lifecycle: AgentLifecyclePort;
  readonly #structure: CompanyStructurePort;

  constructor(dependencies: {
    readonly identity: IdentityPort;
    readonly organization: OrganizationPrincipalPort;
    readonly responsibilities: ResponsibilityContractPort;
    readonly approvals: ApprovalPublicationPort;
    readonly events: EventDataStorePort;
    readonly lifecycle: AgentLifecyclePort;
    readonly structure: CompanyStructurePort;
  }) {
    this.#identity = dependencies.identity;
    this.#organization = dependencies.organization;
    this.#responsibilities = dependencies.responsibilities;
    this.#approvals = dependencies.approvals;
    this.#events = dependencies.events;
    this.#lifecycle = dependencies.lifecycle;
    this.#structure = dependencies.structure;
  }

  async execute(companyId: Identifier): Promise<AgentBossProjection> {
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") {
      throw new Error("FORMAL_IDENTITY_REQUIRED");
    }
    if (identity.organizationId !== companyId) throw new Error("TENANT_MISMATCH");
    const receipt = await this.#identity.authorize({
      companyId,
      action: "agent-boss:read",
      resourceId: companyId,
      reason: "Read the formal Agent Boss control-plane projection",
    });
    if (receipt.principalId !== identity.actorId) {
      throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    }
    const organization = await this.#organization.getOrganization(companyId);
    if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");
    const [responsibilities, pendingApprovals, events, lifecycle, structure] = await Promise.all([
      this.#responsibilities.load(companyId),
      this.#approvals.pending(companyId),
      this.#events.read(companyId),
      this.#lifecycle.load(companyId),
      this.#structure.load(companyId),
    ]);
    if (!structure) throw new Error("ORGANIZATION_NOT_FOUND");
    const eligibilityByAgent = new Map(
      evaluateCompanyAgentEligibility(structure, lifecycle).map((agent) => [agent.id, agent.eligibility]),
    );
    const work = events.flatMap(({ type, payload }) => {
      if (type !== "work.dispatched") return [];
      const candidate = (payload as { readonly work?: WorkItem }).work;
      return candidate ? [structuredClone(candidate)] : [];
    });
    const evidenceByAttempt = new Map<Identifier, Set<Identifier>>();
    for (const { type, payload } of events) {
      if (type !== "connector.observation.recorded") continue;
      const value = payload as { attemptId?: Identifier; observation?: {
        evidenceOutputs?: readonly { evidenceReference?: Identifier }[];
      } };
      if (!value.attemptId) continue;
      const references = evidenceByAttempt.get(value.attemptId) ?? new Set<Identifier>();
      for (const output of value.observation?.evidenceOutputs ?? []) {
        if (typeof output.evidenceReference === "string") references.add(output.evidenceReference);
      }
      evidenceByAttempt.set(value.attemptId, references);
    }
    const attemptsById = new Map<Identifier, AgentBossAttemptProjection>();
    const preparationRequestedForWork = new Set(events.flatMap(({ type, payload }) => {
      if (type !== "work-execution.preparation-requested") return [];
      const workId = (payload as { readonly workId?: Identifier }).workId;
      return workId ? [workId] : [];
    }));
    const preparedAttempts = new Set(events.flatMap(({ type, payload }) => {
      if (type !== "work-execution.prepared") return [];
      const attemptId = (payload as { readonly preparation?: { readonly workAttemptId?: Identifier } })
        .preparation?.workAttemptId;
      return attemptId ? [attemptId] : [];
    }));
    for (const { type, payload } of events) {
      if (type !== "work-attempt.recorded") continue;
      const candidate = attemptProjection((payload as { readonly attempt?: unknown }).attempt);
      if (candidate) attemptsById.set(candidate.id, {
        ...candidate,
        evidenceReferences: [...(evidenceByAttempt.get(candidate.id) ?? [])],
        preparationStatus: preparedAttempts.has(candidate.id)
          ? "PREPARED"
          : preparationRequestedForWork.has(candidate.workId)
            ? "PENDING"
            : "NOT_REQUIRED",
      });
    }
    const attempts = [...attemptsById.values()];
    return {
      schemaVersion: 1,
      mode: "PRODUCTION",
      viewer: { actorId: identity.actorId, displayName: identity.displayName },
      organization: structuredClone(organization),
      responsibilities: structuredClone(responsibilities),
      agentLifecycle: {
        revision: lifecycle.revision,
        agents: lifecycle.agents.map((record) => ({
          ...structuredClone(record),
          eligibility: structuredClone(eligibilityByAgent.get(record.agentId) ?? {
            assignable: false,
            invokable: false,
            assignabilityReason: "unknown_status",
            invokabilityReason: "unknown_status",
            orgChainHealth: {
              status: "invalid_org_chain",
              reason: "missing_manager",
              firstInvalidAgentId: null,
              pausedAncestorIds: [],
            },
          }),
        })),
      },
      work,
      attempts,
      pendingApprovals: structuredClone(pendingApprovals),
      generatedAt: receipt.authorizedAt,
    };
  }
}
