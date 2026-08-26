import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";
import type {
  ApprovalBinding,
  ApprovalDecision,
  ApprovalPublicationPort,
} from "../ports/approval-publication-port.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { WorkAttemptService } from "./work-attempt-service.ts";

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
  readonly attempts?: WorkAttemptService;
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
      .find(({ id }) => id === command.requestId)
      ?? await this.#dependencies.approvals.request?.(command.requestId);
    if (!request) throw new Error("APPROVAL_REQUEST_NOT_FOUND");
    if (!sameBinding(request.binding, command.expectedBinding)) {
      throw new Error("APPROVAL_BINDING_MISMATCH");
    }
    if (request.binding.accountableHumanId !== identity.actorId) {
      throw new Error("APPROVAL_REQUIRES_ACCOUNTABLE_HUMAN");
    }

    const existingDecision = await this.#dependencies.approvals.decision(request.id);
    if (existingDecision) {
      if (existingDecision.decision !== command.decision || existingDecision.decidedBy !== identity.actorId) {
        throw new Error("APPROVAL_ALREADY_DECIDED");
      }
      await this.#recordDecisionEvent(command.companyId, request.binding, existingDecision, null);
      await this.#applyAttemptDecision(command.companyId, request.binding.workId, request.id, existingDecision);
      return existingDecision;
    }
    const now = this.#dependencies.now();
    if (!Number.isFinite(Date.parse(now)) || Date.parse(now) >= Date.parse(request.expiresAt)) {
      throw new Error("APPROVAL_EXPIRED");
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

    await this.#recordDecisionEvent(command.companyId, request.binding, decision, receipt.id);
    await this.#applyAttemptDecision(command.companyId, request.binding.workId, request.id, decision);
    return decision;
  }

  async #recordDecisionEvent(
    companyId: Identifier,
    binding: ApprovalBinding,
    decision: ApprovalDecision,
    authorizationReceiptId: Identifier | null,
  ): Promise<void> {
    const existing = await this.#dependencies.events.read(companyId);
    if (existing.some(({ type, payload }) => type === "approval.decided" &&
      (payload as { requestId?: Identifier }).requestId === decision.requestId)) return;
    const event: CompanyDomainEvent = {
      id: this.#dependencies.nextId(), companyId, type: "approval.decided",
      occurredAt: decision.decidedAt, actorId: decision.decidedBy,
      payload: { requestId: decision.requestId, decision: decision.decision,
        authorizationReceiptId, binding: structuredClone(binding) },
      correlationId: binding.workId, provenance: "PRODUCTION",
    };
    await this.#dependencies.events.append(event, existing.length);
  }

  async #applyAttemptDecision(
    companyId: Identifier,
    workId: Identifier,
    requestId: Identifier,
    decision: ApprovalDecision,
  ): Promise<void> {
    const attempts = this.#dependencies.attempts;
    if (!attempts) return;
    const attempt = await attempts.latestForWork(companyId, workId);
    if (!attempt) throw new Error("WORK_ATTEMPT_NOT_FOUND");
    if (decision.decision === "APPROVED" && attempt.status === "RUNNING") return;
    if (decision.decision === "REJECTED" &&
        (attempt.status === "CANCELLATION_REQUESTED" || attempt.status === "CANCELLED")) return;
    if (attempt.status !== "AWAITING_APPROVAL" || attempt.pendingApprovalId !== requestId) {
      throw new Error("WORK_ATTEMPT_APPROVAL_BINDING_MISMATCH");
    }
    const operation = decision.decision === "APPROVED" ? "RESUME" : "REQUEST_CANCEL";
    const base = {
      companyId: attempt.companyId, attemptId: attempt.id,
      eventId: this.#dependencies.nextId(), publicationId: this.#dependencies.nextId(),
      actorId: decision.decidedBy, occurredAt: decision.decidedAt,
      expectedEventSequence: (await this.#dependencies.events.read(attempt.companyId)).length,
      fencingToken: attempt.lastFencingToken,
    } as const;
    if (operation === "RESUME") await attempts.transition({ ...base, operation, approvalRequestId: requestId });
    else await attempts.transition({ ...base, operation });
  }
}
