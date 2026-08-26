import {
  acquireWorkAttemptLease,
  cancelWorkAttempt,
  completeWorkAttempt,
  createWorkAttempt,
  expireWorkAttemptLease,
  pauseWorkAttemptForApproval,
  reconcileUnknownOutcome,
  requestWorkAttemptCancellation,
  resumeWorkAttemptAfterApproval,
  startWorkAttempt,
  timeOutWorkAttempt,
  type WorkAttempt,
  type WorkAttemptDraft,
  type WorkAttemptLease,
  type WorkAttemptReconciliation,
} from "../core/work-attempt.ts";
import type { Identifier } from "../core/control-plane.ts";
import type {
  DurableControlPlaneStorePort,
  OutboxPublicationDraft,
} from "../ports/durable-control-plane-store-port.ts";

interface TransitionBase {
  readonly companyId: Identifier;
  readonly attemptId: Identifier;
  readonly eventId: Identifier;
  readonly publicationId?: Identifier;
  readonly actorId: Identifier;
  readonly occurredAt: string;
  readonly expectedEventSequence: number;
}

export type WorkAttemptTransition = TransitionBase & (
  | { readonly operation: "ACQUIRE_LEASE"; readonly lease: WorkAttemptLease }
  | { readonly operation: "START"; readonly fencingToken: number }
  | { readonly operation: "PAUSE"; readonly fencingToken: number; readonly approvalRequestId: Identifier }
  | { readonly operation: "RESUME"; readonly fencingToken: number; readonly approvalRequestId: Identifier }
  | { readonly operation: "COMPLETE"; readonly fencingToken: number; readonly outcome: "SUCCEEDED" | "FAILED"; readonly resultId: Identifier | null }
  | { readonly operation: "CANCEL"; readonly fencingToken: number | null }
  | { readonly operation: "REQUEST_CANCEL"; readonly fencingToken: number | null }
  | { readonly operation: "TIME_OUT" }
  | { readonly operation: "EXPIRE_LEASE" }
  | { readonly operation: "RECONCILE"; readonly reconciliation: WorkAttemptReconciliation }
);

export interface CreateWorkAttemptCommand {
  readonly draft: WorkAttemptDraft;
  readonly eventId: Identifier;
  readonly publicationId: Identifier;
  readonly actorId: Identifier;
  readonly expectedEventSequence: number;
}

function transitionAttempt(attempt: WorkAttempt, command: WorkAttemptTransition): WorkAttempt {
  switch (command.operation) {
    case "ACQUIRE_LEASE": return acquireWorkAttemptLease(attempt, command.lease);
    case "START": return startWorkAttempt(attempt, command.fencingToken, command.occurredAt);
    case "PAUSE": return pauseWorkAttemptForApproval(attempt, command.fencingToken, command.approvalRequestId, command.occurredAt);
    case "RESUME": return resumeWorkAttemptAfterApproval(attempt, command.fencingToken, command.approvalRequestId, command.occurredAt);
    case "COMPLETE": return completeWorkAttempt(attempt, command.fencingToken, command.outcome, command.resultId, command.occurredAt);
    case "CANCEL": return cancelWorkAttempt(attempt, command.fencingToken, command.occurredAt);
    case "REQUEST_CANCEL": return requestWorkAttemptCancellation(attempt, command.fencingToken, command.occurredAt);
    case "TIME_OUT": return timeOutWorkAttempt(attempt, command.occurredAt);
    case "EXPIRE_LEASE": return expireWorkAttemptLease(attempt, command.occurredAt);
    case "RECONCILE": return reconcileUnknownOutcome(attempt, command.reconciliation);
  }
}

function publication(
  attempt: WorkAttempt,
  operation: "SUBMIT" | "PAUSE" | "RESUME" | "CANCEL",
  id: Identifier,
  occurredAt: string,
  approvalRequestId: Identifier | undefined = undefined,
): OutboxPublicationDraft {
  return {
    id,
    companyId: attempt.companyId,
    topic: "connector.commands",
    partitionKey: attempt.id,
    occurredAt,
    payload: {
      schemaVersion: 1,
      operation,
      attemptId: attempt.id,
      workId: attempt.workId,
      agentId: attempt.agentId,
      connectorId: attempt.authority.connectorId,
      idempotencyKey: attempt.idempotencyKey,
      ...(operation === "PAUSE" || operation === "RESUME"
        ? { approvalRequestId: approvalRequestId ?? attempt.pendingApprovalId }
        : {}),
      ...(operation === "CANCEL" ? { fencingToken: attempt.lastFencingToken } : {}),
    },
  };
}

/** Persists the pure attempt state machine and connector commands through one atomic boundary. */
export class WorkAttemptService {
  readonly #store: DurableControlPlaneStorePort;

  constructor(store: DurableControlPlaneStorePort) {
    this.#store = store;
  }

  async load(companyId: Identifier, attemptId: Identifier): Promise<WorkAttempt | null> {
    const events = await this.#store.read(companyId, { types: ["work-attempt.recorded"] });
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const attempt = (events[index]?.payload as { readonly attempt?: WorkAttempt }).attempt;
      if (attempt?.id === attemptId && attempt.companyId === companyId) return structuredClone(attempt);
    }
    return null;
  }

  async latestForWork(companyId: Identifier, workId: Identifier): Promise<WorkAttempt | null> {
    const events = await this.#store.read(companyId, { types: ["work-attempt.recorded"] });
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const attempt = (events[index]?.payload as { readonly attempt?: WorkAttempt }).attempt;
      if (attempt?.workId === workId && attempt.companyId === companyId) return structuredClone(attempt);
    }
    return null;
  }

  async list(companyId: Identifier): Promise<readonly WorkAttempt[]> {
    const events = await this.#store.read(companyId, { types: ["work-attempt.recorded"] });
    const latest = new Map<Identifier, WorkAttempt>();
    for (const event of events) {
      const attempt = (event.payload as { readonly attempt?: WorkAttempt }).attempt;
      if (attempt?.companyId === companyId) latest.set(attempt.id, attempt);
    }
    return [...latest.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((attempt) => structuredClone(attempt));
  }

  async create(command: CreateWorkAttemptCommand): Promise<WorkAttempt> {
    const attempt = createWorkAttempt(command.draft);
    const existing = await this.load(attempt.companyId, attempt.id);
    if (existing) {
      if (!sameAttempt(existing, attempt)) throw new Error("WORK_ATTEMPT_IDEMPOTENCY_CONFLICT");
      return existing;
    }
    await this.#store.commit({
      event: {
        id: command.eventId,
        companyId: attempt.companyId,
        type: "work-attempt.recorded",
        occurredAt: attempt.createdAt,
        actorId: command.actorId,
        provenance: "PRODUCTION",
        payload: { operation: "CREATE", attempt },
      },
      publications: [publication(attempt, "SUBMIT", command.publicationId, attempt.createdAt)],
      expectedEventSequence: command.expectedEventSequence,
    });
    return structuredClone(attempt);
  }

  async transition(command: WorkAttemptTransition): Promise<WorkAttempt> {
    const current = await this.load(command.companyId, command.attemptId);
    if (!current) throw new Error("WORK_ATTEMPT_NOT_FOUND");
    const attempt = transitionAttempt(current, command);
    const connectorOperation = command.operation === "PAUSE" ? "PAUSE"
      : command.operation === "RESUME" ? "RESUME"
      : command.operation === "REQUEST_CANCEL" ? "CANCEL"
      : null;
    if (connectorOperation && !command.publicationId) {
      throw new Error("WORK_ATTEMPT_PUBLICATION_ID_REQUIRED");
    }
    await this.#store.commit({
      event: {
        id: command.eventId,
        companyId: command.companyId,
        type: "work-attempt.recorded",
        occurredAt: command.occurredAt,
        actorId: command.actorId,
        provenance: "PRODUCTION",
        payload: { operation: command.operation, attempt },
      },
      publications: connectorOperation
        ? [publication(
            attempt,
            connectorOperation,
            command.publicationId as Identifier,
            command.occurredAt,
            command.operation === "PAUSE" || command.operation === "RESUME"
              ? command.approvalRequestId
              : undefined,
          )]
        : [],
      expectedEventSequence: command.expectedEventSequence,
    });
    return structuredClone(attempt);
  }
}

function sameAttempt(left: WorkAttempt, right: WorkAttempt): boolean {
  return left.id === right.id &&
    left.companyId === right.companyId &&
    left.workId === right.workId &&
    left.agentId === right.agentId &&
    left.attemptNumber === right.attemptNumber &&
    left.idempotencyKey === right.idempotencyKey &&
    left.timeoutAt === right.timeoutAt &&
    left.createdAt === right.createdAt &&
    left.authority.responsibilityContractId === right.authority.responsibilityContractId &&
    left.authority.responsibilityContractRevision === right.authority.responsibilityContractRevision &&
    left.authority.accountableHumanId === right.authority.accountableHumanId &&
    left.authority.connectorId === right.authority.connectorId &&
    left.authority.connectorCapabilityDigest === right.authority.connectorCapabilityDigest &&
    JSON.stringify(left.authority.model ?? null) === JSON.stringify(right.authority.model ?? null) &&
    sameIds(left.authority.actionIds, right.authority.actionIds) &&
    sameIds(left.authority.permissionIds, right.authority.permissionIds) &&
    sameIds(left.authority.dataAuthorizationIds, right.authority.dataAuthorizationIds);
}

function sameIds(left: readonly Identifier[], right: readonly Identifier[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
