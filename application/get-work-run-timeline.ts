import type { CompanyDomainEvent, Identifier, WorkObservation } from "../core/control-plane.ts";
import type { WorkAttempt } from "../core/work-attempt.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { WorkAttemptService } from "./work-attempt-service.ts";

export interface WorkRunTimelineItem {
  readonly sequence: number;
  readonly id: Identifier;
  readonly type: "attempt.state_changed" | "connector.observation" | "approval.decided";
  readonly occurredAt: string;
  readonly actorId: Identifier;
  readonly summary: string;
  readonly attributes: Readonly<Record<string, string | number | boolean | null>>;
}

export interface WorkRunTimelinePage {
  readonly schemaVersion: 1;
  readonly workId: Identifier;
  readonly attemptId: Identifier;
  readonly items: readonly WorkRunTimelineItem[];
  readonly nextSequence: number | null;
}

interface Dependencies {
  readonly identity: IdentityPort;
  readonly events: EventDataStorePort;
  readonly attempts: Pick<WorkAttemptService, "load">;
}

function attemptEvent(event: CompanyDomainEvent, attemptId: Identifier): WorkAttempt | null {
  if (event.type !== "work-attempt.recorded") return null;
  const candidate = (event.payload as { readonly attempt?: WorkAttempt }).attempt;
  return candidate?.id === attemptId ? candidate : null;
}

/** Projects a stable, secret-free activity stream for one immutable execution attempt. */
export class GetWorkRunTimeline {
  readonly #dependencies: Dependencies;

  constructor(dependencies: Dependencies) { this.#dependencies = dependencies; }

  async execute(input: {
    readonly companyId: Identifier;
    readonly workId: Identifier;
    readonly attemptId: Identifier;
    readonly afterSequence: number;
    readonly limit: number;
  }): Promise<WorkRunTimelinePage> {
    if (!Number.isSafeInteger(input.afterSequence) || input.afterSequence < 0 ||
        !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) {
      throw new Error("WORK_RUN_EVENT_PAGE_INVALID");
    }
    const identity = await this.#dependencies.identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== input.companyId) throw new Error("TENANT_MISMATCH");
    const receipt = await this.#dependencies.identity.authorize({
      companyId: input.companyId,
      action: "work:read",
      resourceId: input.workId,
      reason: "Read the sanitized execution timeline for one Work attempt",
    });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    const attempt = await this.#dependencies.attempts.load(input.companyId, input.attemptId);
    if (!attempt || attempt.workId !== input.workId) throw new Error("WORK_ATTEMPT_NOT_FOUND");

    const events = await this.#dependencies.events.read(input.companyId);
    const approvalIds = new Set(events.flatMap((event) => {
      const recorded = attemptEvent(event, input.attemptId);
      return recorded?.pendingApprovalId ? [recorded.pendingApprovalId] : [];
    }));
    const projected = events.flatMap((event, index) => {
      const sequence = index + 1;
      const item = this.#project(event, sequence, input, approvalIds);
      return item ? [item] : [];
    }).filter(({ sequence }) => sequence > input.afterSequence);
    const items = projected.slice(0, input.limit);
    return {
      schemaVersion: 1,
      workId: input.workId,
      attemptId: input.attemptId,
      items,
      nextSequence: projected.length > items.length ? items.at(-1)?.sequence ?? null : null,
    };
  }

  #project(
    event: CompanyDomainEvent,
    sequence: number,
    input: { readonly workId: Identifier; readonly attemptId: Identifier },
    approvalIds: ReadonlySet<Identifier>,
  ): WorkRunTimelineItem | null {
    const recorded = attemptEvent(event, input.attemptId);
    if (recorded && recorded.workId === input.workId) {
      const operation = (event.payload as { readonly operation?: unknown }).operation;
      return {
        sequence, id: event.id, type: "attempt.state_changed", occurredAt: event.occurredAt,
        actorId: event.actorId, summary: `Attempt ${recorded.attemptNumber}: ${recorded.status}`,
        attributes: {
          operation: typeof operation === "string" ? operation : "UNKNOWN",
          status: recorded.status,
          attemptNumber: recorded.attemptNumber,
        },
      };
    }
    if (event.type === "connector.observation.recorded") {
      const payload = event.payload as { readonly attemptId?: Identifier; readonly observation?: WorkObservation };
      const observation = payload.observation;
      if (payload.attemptId !== input.attemptId || observation?.workId !== input.workId) return null;
      return {
        sequence, id: event.id, type: "connector.observation", occurredAt: event.occurredAt,
        actorId: event.actorId, summary: observation.summary,
        attributes: {
          connectorSequence: observation.sequence,
          status: observation.status,
          evidenceCount: observation.evidenceRefs.length,
          resultReference: observation.resultReference ?? null,
        },
      };
    }
    if (event.type === "approval.decided") {
      const payload = event.payload as { readonly requestId?: unknown; readonly decision?: unknown };
      if (typeof payload.requestId !== "string" || !approvalIds.has(payload.requestId) ||
          event.correlationId !== input.workId || !["APPROVED", "REJECTED"].includes(String(payload.decision))) return null;
      return {
        sequence, id: event.id, type: "approval.decided", occurredAt: event.occurredAt,
        actorId: event.actorId, summary: `Approval ${String(payload.decision).toLowerCase()}`,
        attributes: { requestId: payload.requestId, decision: String(payload.decision) },
      };
    }
    return null;
  }
}
