import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";
import type {
  SecretReference,
  SecretReferenceManagementIntent,
  SecretReferenceManagementResult,
  SecretReferenceManagementSession,
} from "../core/secret-governance.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { SecretBrokerManagementPort } from "../ports/secret-broker-management-port.ts";
import type { SecretBrokerPort } from "../ports/secret-broker-port.ts";

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const CODE = /^[A-Z][A-Z0-9_]{2,95}$/;
const OPERATIONS = new Set(["CREATE", "ROTATE", "SUSPEND", "REVOKE"]);
const PURPOSES = new Set(["MODEL_PROVIDER", "DATA_CONNECTOR", "AGENT_CONNECTOR", "IDENTITY_ADAPTER"]);

export class ManageSecretReference {
  readonly #identity: IdentityPort;
  readonly #broker: SecretBrokerPort & SecretBrokerManagementPort;
  readonly #events: EventDataStorePort;
  readonly #now: () => string;
  readonly #nextId: () => Identifier;

  constructor(dependencies: {
    readonly identity: IdentityPort;
    readonly broker: SecretBrokerPort & SecretBrokerManagementPort;
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

  async begin(intent: SecretReferenceManagementIntent): Promise<SecretReferenceManagementSession> {
    validateIntent(intent);
    const identity = await this.#formalIdentity(intent.companyId);
    const existing = await this.#broker.describe(intent.companyId, intent.referenceId);
    validateExistingReference(intent, existing);
    const receipt = await this.#identity.authorize({
      companyId: intent.companyId,
      action: `secret:reference:${intent.operation.toLowerCase()}`,
      resourceId: intent.referenceId,
      reason: `SECRET_REFERENCE_${intent.operation}`,
    });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    const session = await this.#broker.beginReferenceManagement(structuredClone(intent), receipt.id);
    validateSession(intent, session, this.#now());
    await this.#append(intent.companyId, identity.actorId, "secret.reference-management-started", {
      sessionId: session.id,
      referenceId: intent.referenceId,
      operation: intent.operation,
      purpose: intent.purpose,
      providerAdapterId: intent.providerAdapterId,
      expectedVersion: intent.expectedVersion,
      authorizationReceiptId: receipt.id,
      expiresAt: session.expiresAt,
    });
    return structuredClone(session);
  }

  async confirm(companyId: Identifier, sessionId: Identifier): Promise<SecretReferenceManagementResult> {
    if (!ID.test(companyId) || !ID.test(sessionId)) throw new Error("SECRET_MANAGEMENT_SESSION_INVALID");
    const identity = await this.#formalIdentity(companyId);
    const events = await this.#events.read(companyId);
    const completed = events.find((event) => event.type === "secret.reference-management-completed" &&
      payload(event).sessionId === sessionId);
    if (completed) return { status: "COMPLETED", reference: payload(completed).reference as SecretReference };
    const started = events.findLast((event) => event.type === "secret.reference-management-started" &&
      payload(event).sessionId === sessionId);
    if (!started) throw new Error("SECRET_MANAGEMENT_SESSION_NOT_FOUND");
    const startedPayload = payload(started);
    const receipt = await this.#identity.authorize({ companyId, action: "secret:reference:read",
      resourceId: String(startedPayload.referenceId), reason: "SECRET_REFERENCE_CONFIRM" });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    const result = await this.#broker.referenceManagementResult(companyId, sessionId);
    validateResult(companyId, startedPayload, result);
    if (result.status === "PENDING") return result;
    if (result.status === "FAILED") {
      await this.#append(companyId, identity.actorId, "secret.reference-management-failed", {
        sessionId, referenceId: startedPayload.referenceId, code: result.code, retryable: result.retryable,
      });
      return structuredClone(result);
    }
    await this.#append(companyId, identity.actorId, "secret.reference-management-completed", {
      sessionId,
      reference: result.reference,
    });
    return structuredClone(result);
  }

  async #formalIdentity(companyId: Identifier) {
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== companyId) throw new Error("TENANT_MISMATCH");
    return identity;
  }

  async #append(companyId: Identifier, actorId: Identifier, type: string, payloadValue: unknown) {
    const current = await this.#events.read(companyId);
    const event: CompanyDomainEvent = { id: this.#nextId(), companyId, type, occurredAt: this.#now(),
      actorId, payload: payloadValue, provenance: "PRODUCTION" };
    await this.#events.append(event, current.length);
  }
}

function validateIntent(intent: SecretReferenceManagementIntent): void {
  if (!ID.test(intent.companyId) || !ID.test(intent.referenceId) || !ID.test(intent.providerAdapterId)) {
    throw new Error("SECRET_REFERENCE_INTENT_INVALID");
  }
  if (!OPERATIONS.has(intent.operation) || !PURPOSES.has(intent.purpose)) {
    throw new Error("SECRET_REFERENCE_INTENT_INVALID");
  }
  if (intent.operation === "CREATE" ? intent.expectedVersion !== null :
      !Number.isSafeInteger(intent.expectedVersion) || Number(intent.expectedVersion) < 1) {
    throw new Error("SECRET_REFERENCE_VERSION_INVALID");
  }
}

function validateExistingReference(intent: SecretReferenceManagementIntent, reference: SecretReference | null): void {
  if (intent.operation === "CREATE") {
    if (reference) throw new Error("SECRET_REFERENCE_ALREADY_EXISTS");
    return;
  }
  if (!reference) throw new Error("SECRET_REFERENCE_NOT_FOUND");
  if (reference.companyId !== intent.companyId) throw new Error("TENANT_MISMATCH");
  if (reference.currentVersion !== intent.expectedVersion) throw new Error("SECRET_VERSION_MISMATCH");
  if (reference.purpose !== intent.purpose || reference.providerAdapterId !== intent.providerAdapterId) {
    throw new Error("SECRET_REFERENCE_BINDING_MISMATCH");
  }
  if (reference.status === "REVOKED") throw new Error("SECRET_REFERENCE_REVOKED");
}

function validateSession(intent: SecretReferenceManagementIntent, session: SecretReferenceManagementSession, now: string): void {
  if (!ID.test(session.id) || session.companyId !== intent.companyId || session.referenceId !== intent.referenceId ||
      session.operation !== intent.operation || Date.parse(session.expiresAt) <= Date.parse(now)) {
    throw new Error("SECRET_MANAGEMENT_SESSION_INVALID");
  }
  let url: URL;
  try { url = new URL(session.managementUrl); } catch { throw new Error("SECRET_MANAGEMENT_URL_INVALID"); }
  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) {
    throw new Error("SECRET_MANAGEMENT_URL_INVALID");
  }
}

function validateResult(companyId: Identifier, started: Record<string, unknown>, result: SecretReferenceManagementResult): void {
  if (result.status === "PENDING") return;
  if (result.status === "FAILED") {
    if (!CODE.test(result.code) || typeof result.retryable !== "boolean") throw new Error("SECRET_MANAGEMENT_RESULT_INVALID");
    return;
  }
  const reference = result.reference;
  if (reference.companyId !== companyId || reference.id !== started.referenceId || reference.purpose !== started.purpose ||
      reference.providerAdapterId !== started.providerAdapterId) throw new Error("SECRET_MANAGEMENT_RESULT_INVALID");
  const operation = started.operation;
  const expected = started.expectedVersion;
  if ((operation === "CREATE" && (reference.currentVersion !== 1 || reference.status !== "ACTIVE")) ||
      (operation === "ROTATE" && (reference.currentVersion !== Number(expected) + 1 || reference.status !== "ACTIVE")) ||
      (operation === "SUSPEND" && (reference.currentVersion !== expected || reference.status !== "SUSPENDED")) ||
      (operation === "REVOKE" && (reference.currentVersion !== expected || reference.status !== "REVOKED"))) {
    throw new Error("SECRET_MANAGEMENT_RESULT_INVALID");
  }
}

function payload(event: CompanyDomainEvent): Record<string, unknown> {
  return event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
    ? event.payload as Record<string, unknown> : {};
}
