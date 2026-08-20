import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";
import type { SecretLeaseGrant, SecretLeaseIntent } from "../core/secret-governance.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { SecretBrokerPort } from "../ports/secret-broker-port.ts";

const REASON_CODE = /^[A-Z][A-Z0-9_]{2,63}$/;
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;

export class IssueSecretLease {
  readonly #identity: IdentityPort;
  readonly #broker: SecretBrokerPort;
  readonly #events: EventDataStorePort;
  readonly #now: () => string;
  readonly #nextId: () => Identifier;

  constructor(dependencies: {
    readonly identity: IdentityPort;
    readonly broker: SecretBrokerPort;
    readonly events: EventDataStorePort;
    readonly now: () => string;
    readonly nextId: () => Identifier;
  }) {
    this.#identity = dependencies.identity;
    this.#broker = dependencies.broker;
    this.#events = dependencies.events;
    this.#now = dependencies.now;
    this.#nextId = dependencies.nextId;
  }

  async execute(intent: SecretLeaseIntent): Promise<SecretLeaseGrant> {
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") {
      throw new Error("FORMAL_IDENTITY_REQUIRED");
    }
    if (identity.organizationId !== intent.companyId) throw new Error("TENANT_MISMATCH");
    if (!REASON_CODE.test(intent.reasonCode)) throw new Error("SECRET_LEASE_REASON_INVALID");
    const now = this.#now();
    const duration = Date.parse(intent.expiresAt) - Date.parse(now);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 15 * 60 * 1_000) {
      throw new Error("SECRET_LEASE_EXPIRY_INVALID");
    }
    const reference = await this.#broker.describe(intent.companyId, intent.secretReferenceId);
    if (!reference) throw new Error("SECRET_REFERENCE_NOT_FOUND");
    if (reference.companyId !== intent.companyId) throw new Error("TENANT_MISMATCH");
    if (reference.status !== "ACTIVE") throw new Error("SECRET_REFERENCE_INACTIVE");
    if (reference.currentVersion !== intent.expectedVersion) {
      throw new Error("SECRET_VERSION_MISMATCH");
    }
    const receipt = await this.#identity.authorize({
      companyId: intent.companyId,
      action: "secret:lease",
      resourceId: intent.secretReferenceId,
      reason: intent.reasonCode,
    });
    if (receipt.principalId !== identity.actorId) {
      throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    }
    await this.#append(intent.companyId, identity.actorId, "secret.access-authorized", {
      secretReferenceId: intent.secretReferenceId,
      version: intent.expectedVersion,
      consumerId: intent.consumerId,
      workAttemptId: intent.workAttemptId,
      reasonCode: intent.reasonCode,
      authorizationReceiptId: receipt.id,
      expiresAt: intent.expiresAt,
    });
    const result = await this.#broker.issueLease(structuredClone(intent), receipt.id);
    if (!result.ok) {
      await this.#append(intent.companyId, identity.actorId, "secret.lease-failed", {
        secretReferenceId: intent.secretReferenceId,
        workAttemptId: intent.workAttemptId,
        code: result.error.code,
        retryable: result.error.retryable,
      });
      throw new Error(`SECRET_LEASE_FAILED:${result.error.code}`);
    }
    const grant = result.value;
    if (grant.secretReferenceId !== intent.secretReferenceId ||
        grant.version !== intent.expectedVersion ||
        grant.consumerId !== intent.consumerId ||
        grant.workAttemptId !== intent.workAttemptId ||
        grant.expiresAt !== intent.expiresAt ||
        !SHA256_DIGEST.test(grant.attestationDigest)) {
      throw new Error("SECRET_LEASE_GRANT_INVALID");
    }
    await this.#append(intent.companyId, identity.actorId, "secret.lease-issued", {
      leaseId: grant.id,
      secretReferenceId: grant.secretReferenceId,
      version: grant.version,
      consumerId: grant.consumerId,
      workAttemptId: grant.workAttemptId,
      issuedAt: grant.issuedAt,
      expiresAt: grant.expiresAt,
      attestationDigest: grant.attestationDigest,
    });
    return structuredClone(grant);
  }

  async #append(companyId: Identifier, actorId: Identifier, type: string, payload: unknown) {
    const current = await this.#events.read(companyId);
    const event: CompanyDomainEvent = {
      id: this.#nextId(),
      companyId,
      type,
      occurredAt: this.#now(),
      actorId,
      payload,
      provenance: "PRODUCTION",
    };
    await this.#events.append(event, current.length);
  }
}
