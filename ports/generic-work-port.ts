import type { Identifier } from "../core/control-plane.ts";

export type GenericWorkStatus =
  | "PENDING"
  | "READY"
  | "RUNNING"
  | "PAUSED"
  | "AWAITING_APPROVAL"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export interface GenericWorkRecord {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly title: string;
  readonly goalId: Identifier | null;
  readonly assigneeId: Identifier | null;
  readonly status: GenericWorkStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface GenericRunEvent {
  /** Stable within one run and safe to persist as an opaque resume cursor. */
  readonly sequence: number;
  readonly runId: Identifier;
  readonly workId: Identifier;
  readonly type: string;
  readonly occurredAt: string;
  /** Sanitized projection data only; never credentials, vendor sessions, or private reasoning. */
  readonly attributes: Readonly<Record<string, string | number | boolean | null>>;
}

export interface GenericWorkPage {
  readonly items: readonly GenericWorkRecord[];
  readonly nextCursor: string | null;
}

export interface GenericRunEventPage {
  readonly items: readonly GenericRunEvent[];
  readonly nextSequence: number | null;
}

export interface GenericWorkFailure {
  readonly code: string;
  readonly category:
    | "INVALID_REQUEST"
    | "UNAUTHENTICATED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "RATE_LIMITED"
    | "INFRASTRUCTURE_UNAVAILABLE"
    | "UNKNOWN";
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
}

export type GenericWorkResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: GenericWorkFailure };

export interface CreateGenericWorkCommand {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly title: string;
  readonly description: string;
  readonly goalId: Identifier | null;
  readonly assigneeId: Identifier | null;
  readonly idempotencyKey: string;
}

export interface CancelGenericRunCommand {
  readonly companyId: Identifier;
  readonly runId: Identifier;
  readonly idempotencyKey: string;
}

/**
 * Company OS-owned boundary for canonical work records and run events.
 *
 * Company OS core owns responsibility, data authorization, and exact approval
 * semantics. Replaceable Company OS adapters own persistence and scheduling;
 * no external product is the canonical owner of these records.
 */
export interface GenericWorkPort {
  createWork(command: CreateGenericWorkCommand): Promise<GenericWorkResult<GenericWorkRecord>>;
  getWork(companyId: Identifier, workId: Identifier): Promise<GenericWorkResult<GenericWorkRecord>>;
  listWork(query: {
    readonly companyId: Identifier;
    readonly cursor?: string;
    readonly limit: number;
  }): Promise<GenericWorkResult<GenericWorkPage>>;
  cancelRun(command: CancelGenericRunCommand): Promise<GenericWorkResult<void>>;
  listRunEvents(query: {
    readonly companyId: Identifier;
    readonly runId: Identifier;
    readonly afterSequence: number;
    readonly limit: number;
  }): Promise<GenericWorkResult<GenericRunEventPage>>;
}
