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

export interface AgentBossAttemptProjection {
  readonly id: Identifier;
  readonly workId: Identifier;
  readonly status: WorkAttemptStatus;
  readonly attemptNumber: number;
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
  readonly work: readonly WorkItem[];
  readonly attempts: readonly AgentBossAttemptProjection[];
  readonly pendingApprovals: readonly ApprovalRequest[];
  readonly generatedAt: string;
}

const ATTEMPT_STATUSES = new Set<WorkAttemptStatus>([
  "QUEUED", "LEASED", "RUNNING", "AWAITING_APPROVAL", "SUCCEEDED",
  "FAILED", "CANCELLED", "TIMED_OUT", "OUTCOME_UNKNOWN",
]);

function attemptProjection(value: unknown): AgentBossAttemptProjection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || typeof candidate.workId !== "string" ||
      !ATTEMPT_STATUSES.has(candidate.status as WorkAttemptStatus) ||
      !Number.isSafeInteger(candidate.attemptNumber)) return null;
  return {
    id: candidate.id,
    workId: candidate.workId,
    status: candidate.status as WorkAttemptStatus,
    attemptNumber: candidate.attemptNumber as number,
  };
}

export class GetAgentBossProjection {
  readonly #identity: IdentityPort;
  readonly #organization: OrganizationPrincipalPort;
  readonly #responsibilities: ResponsibilityContractPort;
  readonly #approvals: ApprovalPublicationPort;
  readonly #events: EventDataStorePort;

  constructor(dependencies: {
    readonly identity: IdentityPort;
    readonly organization: OrganizationPrincipalPort;
    readonly responsibilities: ResponsibilityContractPort;
    readonly approvals: ApprovalPublicationPort;
    readonly events: EventDataStorePort;
  }) {
    this.#identity = dependencies.identity;
    this.#organization = dependencies.organization;
    this.#responsibilities = dependencies.responsibilities;
    this.#approvals = dependencies.approvals;
    this.#events = dependencies.events;
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
    const [responsibilities, pendingApprovals, events] = await Promise.all([
      this.#responsibilities.load(companyId),
      this.#approvals.pending(companyId),
      this.#events.read(companyId),
    ]);
    const work = events.flatMap(({ type, payload }) => {
      if (type !== "work.dispatched") return [];
      const candidate = (payload as { readonly work?: WorkItem }).work;
      return candidate ? [structuredClone(candidate)] : [];
    });
    const attempts = events.flatMap(({ type, payload }) => {
      if (type !== "work-attempt.recorded") return [];
      const candidate = attemptProjection((payload as { readonly attempt?: unknown }).attempt);
      return candidate ? [candidate] : [];
    });
    return {
      schemaVersion: 1,
      mode: "PRODUCTION",
      viewer: { actorId: identity.actorId, displayName: identity.displayName },
      organization: structuredClone(organization),
      responsibilities: structuredClone(responsibilities),
      work,
      attempts,
      pendingApprovals: structuredClone(pendingApprovals),
      generatedAt: receipt.authorizedAt,
    };
  }
}
