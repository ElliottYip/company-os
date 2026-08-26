import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";
import type { CompanyLifecycleStorePort, ArchivedCompanyRecord } from "../ports/company-lifecycle-store-port.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { DurableControlPlaneStorePort } from "../ports/durable-control-plane-store-port.ts";

const IDENTIFIER = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const TERMINAL_ATTEMPTS = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"]);

export interface ArchiveCompanyInput {
  readonly companyId: Identifier;
  readonly expectedStatus: "active";
  readonly exportDigest: string;
  readonly retentionPolicyId: Identifier;
  readonly reason: string;
}

/**
 * Closes a formal company without deleting its evidence. Export integrity is
 * bound into the closure event so an administrator can prove what was taken
 * out before access was revoked.
 */
export class ArchiveCompany {
  readonly #identity: IdentityPort;
  readonly #events: EventDataStorePort;
  readonly #lifecycle: CompanyLifecycleStorePort;
  readonly #portability: Pick<DurableControlPlaneStorePort, "exportBackup">;
  readonly #now: () => string;
  readonly #nextId: () => Identifier;
  readonly #retentionPolicyId: Identifier;

  constructor(dependencies: {
    readonly identity: IdentityPort;
    readonly events: EventDataStorePort;
    readonly lifecycle: CompanyLifecycleStorePort;
    readonly portability: Pick<DurableControlPlaneStorePort, "exportBackup">;
    readonly now: () => string;
    readonly nextId: () => Identifier;
    readonly retentionPolicyId: Identifier;
  }) {
    this.#identity = dependencies.identity;
    this.#events = dependencies.events;
    this.#lifecycle = dependencies.lifecycle;
    this.#portability = dependencies.portability;
    this.#now = dependencies.now;
    this.#nextId = dependencies.nextId;
    if (!IDENTIFIER.test(dependencies.retentionPolicyId)) throw new Error("RETENTION_POLICY_ID_INVALID");
    this.#retentionPolicyId = dependencies.retentionPolicyId;
  }

  async execute(input: ArchiveCompanyInput): Promise<ArchivedCompanyRecord> {
    if (input.expectedStatus !== "active" || !IDENTIFIER.test(input.companyId) ||
        !IDENTIFIER.test(input.retentionPolicyId) || !DIGEST.test(input.exportDigest) ||
        !input.reason.trim() || [...input.reason.trim()].length > 1_000) {
      throw new Error("COMPANY_ARCHIVE_COMMAND_INVALID");
    }
    if (input.retentionPolicyId !== this.#retentionPolicyId) {
      throw new Error("COMPANY_ARCHIVE_RETENTION_POLICY_MISMATCH");
    }
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== input.companyId) throw new Error("TENANT_MISMATCH");
    const events = await this.#events.read(input.companyId);
    if (!events.some(({ type }) => type === "organization.registered" || type === "organization.revised")) {
      throw new Error("ORGANIZATION_NOT_FOUND");
    }
    assertNoPendingApproval(events);
    assertNoUnresolvedWork(events);
    const backup = JSON.parse(await this.#portability.exportBackup(input.companyId)) as { digest?: unknown };
    if (backup.digest !== input.exportDigest) throw new Error("COMPANY_ARCHIVE_EXPORT_STALE");
    const receipt = await this.#identity.authorize({
      companyId: input.companyId,
      action: "company-portability:archive",
      resourceId: input.companyId,
      reason: input.reason.trim(),
    });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    const archivedAt = this.#now();
    if (!Number.isFinite(Date.parse(archivedAt))) throw new Error("COMPANY_ARCHIVE_TIMESTAMP_INVALID");
    const event: CompanyDomainEvent = {
      id: this.#nextId(), companyId: input.companyId, type: "company.lifecycle.archived",
      occurredAt: archivedAt, actorId: identity.actorId,
      payload: {
        previousStatus: "active", status: "archived", exportDigest: input.exportDigest,
        retentionPolicyId: input.retentionPolicyId, reason: input.reason.trim(),
        authorizationReceiptId: receipt.id,
      },
      provenance: "PRODUCTION",
    };
    return this.#lifecycle.archiveCompanyAtomically({
      companyId: input.companyId, actorUserId: identity.actorId, expectedStatus: "active",
      exportDigest: input.exportDigest, retentionPolicyId: input.retentionPolicyId,
      archivedAt, event, expectedEventSequence: events.length,
    });
  }
}

function assertNoPendingApproval(events: readonly CompanyDomainEvent[]): void {
  const decided = new Set(events.flatMap(({ type, payload }) => type === "approval.publication.decided"
    ? [String((payload as { decision?: { requestId?: unknown } }).decision?.requestId ?? "")] : []));
  const pending = events.some(({ type, payload }) => type === "approval.publication.requested" && (() => {
    const id = (payload as { request?: { id?: unknown } }).request?.id;
    return typeof id === "string" && !decided.has(id);
  })());
  if (pending) throw new Error("COMPANY_ARCHIVE_PENDING_APPROVAL");
}

function assertNoUnresolvedWork(events: readonly CompanyDomainEvent[]): void {
  const latestAttempts = new Map<Identifier, string>();
  for (const event of events) {
    if (event.type !== "work-attempt.recorded") continue;
    const attempt = (event.payload as { attempt?: { id?: unknown; status?: unknown } }).attempt;
    if (typeof attempt?.id === "string" && typeof attempt.status === "string") {
      latestAttempts.set(attempt.id, attempt.status);
    }
  }
  if ([...latestAttempts.values()].some((status) => !TERMINAL_ATTEMPTS.has(status))) {
    throw new Error("COMPANY_ARCHIVE_UNRESOLVED_WORK");
  }
}
