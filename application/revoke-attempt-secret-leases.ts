import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { SecretBrokerPort } from "../ports/secret-broker-port.ts";

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT", "OUTCOME_UNKNOWN"]);
const STABLE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/;

export interface SecretLeaseRevocationOutcome {
  readonly leaseId: Identifier;
  readonly status: "REVOKED" | "RETRY_PENDING";
  readonly code: string;
}

interface IssuedLease {
  readonly leaseId: Identifier;
  readonly workAttemptId: Identifier;
}

/** Revokes execution-edge Secret leases after their immutable Attempt stops running. */
export class RevokeAttemptSecretLeases {
  readonly #dependencies: {
    readonly events: EventDataStorePort;
    readonly broker: SecretBrokerPort;
    readonly now: () => string;
    readonly nextId: () => Identifier;
  };

  constructor(dependencies: {
    readonly events: EventDataStorePort;
    readonly broker: SecretBrokerPort;
    readonly now: () => string;
    readonly nextId: () => Identifier;
  }) { this.#dependencies = dependencies; }

  async execute(companyId: Identifier): Promise<readonly SecretLeaseRevocationOutcome[]> {
    const events = await this.#dependencies.events.read(companyId);
    const now = this.#dependencies.now();
    if (!Number.isFinite(Date.parse(now))) throw new Error("SECRET_LEASE_REVOCATION_TIME_INVALID");
    const attemptStatuses = new Map<Identifier, string>();
    const issued = new Map<Identifier, IssuedLease>();
    const requested = new Set<Identifier>();
    const revoked = new Set<Identifier>();
    const failures = new Map<Identifier, { readonly attemptCount: number; readonly nextAttemptAt: string }>();
    for (const event of events) {
      const payload = event.payload as Record<string, unknown>;
      if (event.type === "work-attempt.recorded") {
        const attempt = payload.attempt as { readonly id?: unknown; readonly status?: unknown } | undefined;
        if (typeof attempt?.id === "string" && typeof attempt.status === "string") attemptStatuses.set(attempt.id, attempt.status);
      }
      if (event.type === "secret.lease-issued" && typeof payload.leaseId === "string" &&
          typeof payload.workAttemptId === "string") {
        issued.set(payload.leaseId, { leaseId: payload.leaseId, workAttemptId: payload.workAttemptId });
      }
      if (event.type === "secret.lease-revocation-requested" && typeof payload.leaseId === "string") requested.add(payload.leaseId);
      if (event.type === "secret.lease-revoked" && typeof payload.leaseId === "string") revoked.add(payload.leaseId);
      if (event.type === "secret.lease-revocation-failed" && typeof payload.leaseId === "string" &&
          Number.isSafeInteger(payload.attemptCount) && typeof payload.nextAttemptAt === "string") {
        failures.set(payload.leaseId, { attemptCount: payload.attemptCount as number, nextAttemptAt: payload.nextAttemptAt });
      }
    }
    const outcomes: SecretLeaseRevocationOutcome[] = [];
    for (const lease of issued.values()) {
      if (revoked.has(lease.leaseId) || !TERMINAL.has(attemptStatuses.get(lease.workAttemptId) ?? "")) continue;
      const priorFailure = failures.get(lease.leaseId);
      if (priorFailure && Date.parse(now) < Date.parse(priorFailure.nextAttemptAt)) continue;
      if (!requested.has(lease.leaseId)) {
        await this.#append(companyId, "secret.lease-revocation-requested", {
          leaseId: lease.leaseId, workAttemptId: lease.workAttemptId, reasonCode: "WORK_ATTEMPT_TERMINATED",
        }, now);
      }
      try {
        await this.#dependencies.broker.revokeLease(companyId, lease.leaseId, "WORK_ATTEMPT_TERMINATED");
        await this.#append(companyId, "secret.lease-revoked", {
          leaseId: lease.leaseId, workAttemptId: lease.workAttemptId, reasonCode: "WORK_ATTEMPT_TERMINATED",
          revokedAt: now,
        }, now);
        outcomes.push({ leaseId: lease.leaseId, status: "REVOKED", code: "SECRET_LEASE_REVOKED" });
      } catch (error) {
        const code = error instanceof Error && STABLE_CODE.test(error.message)
          ? error.message : "SECRET_LEASE_REVOCATION_FAILED";
        const attemptCount = (priorFailure?.attemptCount ?? 0) + 1;
        const delaySeconds = Math.min(30 * 2 ** (attemptCount - 1), 900);
        await this.#append(companyId, "secret.lease-revocation-failed", {
          leaseId: lease.leaseId, workAttemptId: lease.workAttemptId, code,
          attemptCount, nextAttemptAt: new Date(Date.parse(now) + delaySeconds * 1_000).toISOString(),
        }, now);
        outcomes.push({ leaseId: lease.leaseId, status: "RETRY_PENDING", code });
      }
    }
    return outcomes;
  }

  async #append(companyId: Identifier, type: string, payload: unknown, occurredAt: string): Promise<void> {
    const current = await this.#dependencies.events.read(companyId);
    const event: CompanyDomainEvent = {
      id: this.#dependencies.nextId(), companyId, type, occurredAt,
      actorId: "company-os-secret-lease-supervisor", payload, provenance: "PRODUCTION",
    };
    await this.#dependencies.events.append(event, current.length);
  }
}
