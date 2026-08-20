import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";
import type {
  ApprovalBinding,
  ApprovalDecision,
  ApprovalPublicationPort,
} from "../ports/approval-publication-port.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

export interface DecideHighRiskActionCommand {
  readonly companyId: Identifier;
  readonly requestId: Identifier;
  readonly expectedBinding: ApprovalBinding;
  readonly decision: "APPROVED" | "REJECTED";
  readonly note?: string;
}

interface Dependencies {
  readonly identity: IdentityPort;
  readonly approvals: ApprovalPublicationPort;
  readonly events: EventDataStorePort;
  readonly now: () => string;
  readonly nextId: () => Identifier;
}

function sameList(left: readonly Identifier[], right: readonly Identifier[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameBinding(left: ApprovalBinding, right: ApprovalBinding): boolean {
  return (
    left.action.id === right.action.id &&
    left.action.type === right.action.type &&
    left.action.description === right.action.description &&
    left.action.inputDigest === right.action.inputDigest &&
    left.action.risk === right.action.risk &&
    left.workId === right.workId &&
    left.responsibilityContractId === right.responsibilityContractId &&
    left.executingAgentId === right.executingAgentId &&
    left.accountableHumanId === right.accountableHumanId &&
    sameList(left.evidenceReferences, right.evidenceReferences) &&
    left.resultReference === right.resultReference
  );
}

export class DecideHighRiskAction {
  readonly #dependencies: Dependencies;

  constructor(dependencies: Dependencies) {
    this.#dependencies = dependencies;
  }

  async execute(command: DecideHighRiskActionCommand): Promise<ApprovalDecision> {
    const identity = await this.#dependencies.identity.getCurrentIdentity();
    if (!identity) throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.assurance === "LOCAL_DEMO") {
      throw new Error("FORMAL_IDENTITY_REQUIRED");
    }
    if (identity.organizationId !== command.companyId) {
      throw new Error("TENANT_MISMATCH");
    }

    const request = (await this.#dependencies.approvals.pending(command.companyId))
      .find(({ id }) => id === command.requestId);
    if (!request) throw new Error("APPROVAL_REQUEST_NOT_FOUND");
    if (!sameBinding(request.binding, command.expectedBinding)) {
      throw new Error("APPROVAL_BINDING_MISMATCH");
    }
    if (request.binding.accountableHumanId !== identity.actorId) {
      throw new Error("APPROVAL_REQUIRES_ACCOUNTABLE_HUMAN");
    }

    const now = this.#dependencies.now();
    if (!Number.isFinite(Date.parse(now)) || Date.parse(now) >= Date.parse(request.expiresAt)) {
      throw new Error("APPROVAL_EXPIRED");
    }
    if (await this.#dependencies.approvals.decision(request.id)) {
      throw new Error("APPROVAL_ALREADY_DECIDED");
    }

    const receipt = await this.#dependencies.identity.authorize({
      companyId: command.companyId,
      action: `approval:${command.decision.toLowerCase()}`,
      resourceId: request.id,
      reason: `Decide exact action ${request.binding.action.id} for work ${request.binding.workId}`,
    });
    if (receipt.principalId !== identity.actorId) {
      throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    }

    const decision: ApprovalDecision = {
      requestId: request.id,
      decision: command.decision,
      decidedBy: identity.actorId,
      decidedAt: now,
      ...(command.note ? { note: command.note } : {}),
    };
    await this.#dependencies.approvals.publishDecision(decision);

    const existing = await this.#dependencies.events.read(command.companyId);
    const event: CompanyDomainEvent = {
      id: this.#dependencies.nextId(),
      companyId: command.companyId,
      type: "approval.decided",
      occurredAt: now,
      actorId: identity.actorId,
      payload: {
        requestId: request.id,
        decision: command.decision,
        authorizationReceiptId: receipt.id,
        binding: structuredClone(request.binding),
      },
      correlationId: request.binding.workId,
      provenance: "PRODUCTION",
    };
    await this.#dependencies.events.append(event, existing.length);
    return decision;
  }
}
