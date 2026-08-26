import type { Identifier } from "../core/control-plane.ts";
import type { WorkAttempt, WorkAttemptStatus } from "../core/work-attempt.ts";
import type { DurableControlPlaneStorePort } from "../ports/durable-control-plane-store-port.ts";
import { WorkAttemptService } from "./work-attempt-service.ts";

const TERMINAL = new Set<WorkAttemptStatus>([
  "SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT", "OUTCOME_UNKNOWN",
]);

export interface WorkAttemptRecoveryOutcome {
  readonly attemptId: Identifier;
  readonly operation: "TIME_OUT" | "EXPIRE_LEASE";
  readonly status: WorkAttemptStatus;
}

/**
 * Converts expired durable execution authority into an explicit safe state.
 * Work that may have reached an external system becomes OUTCOME_UNKNOWN and is
 * never silently retried; queued/leased work can time out without inventing an
 * external result.
 */
export class RecoverExpiredWorkAttempts {
  readonly #store: DurableControlPlaneStorePort;
  readonly #attempts: WorkAttemptService;
  readonly #now: () => string;
  readonly #nextId: () => Identifier;

  constructor(dependencies: {
    readonly store: DurableControlPlaneStorePort;
    readonly now: () => string;
    readonly nextId: () => Identifier;
  }) {
    this.#store = dependencies.store;
    this.#attempts = new WorkAttemptService(dependencies.store);
    this.#now = dependencies.now;
    this.#nextId = dependencies.nextId;
  }

  async execute(companyId: Identifier): Promise<readonly WorkAttemptRecoveryOutcome[]> {
    const now = this.#now();
    if (!Number.isFinite(Date.parse(now))) throw new Error("WORK_ATTEMPT_RECOVERY_TIME_INVALID");
    const outcomes: WorkAttemptRecoveryOutcome[] = [];
    for (const attempt of await this.#attempts.list(companyId)) {
      const operation = this.#operation(attempt, now);
      if (!operation) continue;
      const recovered = await this.#attempts.transition({
        companyId,
        attemptId: attempt.id,
        operation,
        eventId: this.#nextId(),
        actorId: "company-os-recovery",
        occurredAt: now,
        expectedEventSequence: (await this.#store.read(companyId)).length,
      });
      outcomes.push({ attemptId: attempt.id, operation, status: recovered.status });
    }
    return outcomes;
  }

  #operation(attempt: WorkAttempt, now: string): "TIME_OUT" | "EXPIRE_LEASE" | null {
    if (TERMINAL.has(attempt.status)) return null;
    if (Date.parse(now) >= Date.parse(attempt.timeoutAt)) return "TIME_OUT";
    if (attempt.lease && Date.parse(now) >= Date.parse(attempt.lease.expiresAt)) return "EXPIRE_LEASE";
    return null;
  }
}
