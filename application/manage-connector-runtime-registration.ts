import type { ConnectorOperation, ConnectorRegistration } from "../core/connector.ts";
import type { Identifier } from "../core/control-plane.ts";
import type { AgentExecutionPort } from "../ports/agent-execution-port.ts";
import type { ConnectorCatalogPort, ConnectorCatalogSnapshot } from "../ports/connector-catalog-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

interface Dependencies {
  readonly identity: IdentityPort;
  readonly store: ConnectorCatalogPort;
  readonly executionPorts: readonly AgentExecutionPort[];
  readonly now: () => string;
}

export class ManageConnectorRuntimeRegistration {
  readonly #dependencies: Dependencies;
  constructor(dependencies: Dependencies) { this.#dependencies = dependencies; }

  async register(input: {
    readonly companyId: Identifier;
    readonly connectorId: Identifier;
    readonly executionResidency: "MANAGED_CLOUD" | "CUSTOMER_ENVIRONMENT";
    readonly expectedRevision: number;
  }): Promise<ConnectorCatalogSnapshot> {
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 ||
        !["MANAGED_CLOUD", "CUSTOMER_ENVIRONMENT"].includes(input.executionResidency)) {
      throw new Error("CONNECTOR_REGISTRATION_INPUT_INVALID");
    }
    const identity = await this.#identity(input.companyId);
    const snapshot = await this.#dependencies.store.load(input.companyId);
    if (snapshot.revision !== input.expectedRevision) throw new Error("CONNECTOR_CATALOG_REVISION_CONFLICT");
    if (snapshot.connectors.some(({ id }) => id === input.connectorId)) throw new Error("CONNECTOR_ALREADY_REGISTERED");
    const capabilities = await this.#capabilities(input.connectorId);
    const operations: ConnectorOperation[] = ["SUBMIT", "PROGRESS", "RESULT"];
    if (capabilities.supportsPause) operations.push("PAUSE", "RESUME");
    if (capabilities.supportsCancellation) operations.push("CANCEL");
    if (capabilities.supportsEvidence) operations.push("EVIDENCE");
    const connector: ConnectorRegistration = {
      id: capabilities.connectorId, companyId: input.companyId,
      displayName: capabilities.displayName, protocolVersion: "1.0",
      operations, maximumTimeoutSeconds: capabilities.maximumTimeoutSeconds,
      executionResidency: input.executionResidency, secretReferenceId: null, status: "ENABLED",
    };
    await this.#authorize(identity.actorId, input.companyId, "connector:register", input.connectorId);
    return this.#dependencies.store.replace({
      companyId: input.companyId, actorId: identity.actorId,
      expectedRevision: input.expectedRevision, recordedAt: this.#dependencies.now(),
      connectors: [...snapshot.connectors, connector],
    });
  }

  async setStatus(input: {
    readonly companyId: Identifier;
    readonly connectorId: Identifier;
    readonly status: "ENABLED" | "DISABLED";
    readonly expectedRevision: number;
  }): Promise<ConnectorCatalogSnapshot> {
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 ||
        !["ENABLED", "DISABLED"].includes(input.status)) {
      throw new Error("CONNECTOR_STATUS_INPUT_INVALID");
    }
    const identity = await this.#identity(input.companyId);
    const snapshot = await this.#dependencies.store.load(input.companyId);
    if (snapshot.revision !== input.expectedRevision) throw new Error("CONNECTOR_CATALOG_REVISION_CONFLICT");
    const connector = snapshot.connectors.find(({ id }) => id === input.connectorId);
    if (!connector) throw new Error("CONNECTOR_NOT_REGISTERED");
    if (connector.status === input.status) return snapshot;
    await this.#authorize(identity.actorId, input.companyId, "connector:update", input.connectorId);
    return this.#dependencies.store.replace({
      companyId: input.companyId, actorId: identity.actorId,
      expectedRevision: input.expectedRevision, recordedAt: this.#dependencies.now(),
      connectors: snapshot.connectors.map((candidate) => candidate.id === input.connectorId
        ? { ...candidate, status: input.status } : candidate),
    });
  }

  async #identity(companyId: Identifier) {
    const identity = await this.#dependencies.identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== companyId) throw new Error("TENANT_MISMATCH");
    return identity;
  }

  async #authorize(actorId: Identifier, companyId: Identifier, action: string, resourceId: Identifier): Promise<void> {
    const receipt = await this.#dependencies.identity.authorize({
      companyId, action, resourceId, reason: `${action} installed Connector runtime`,
    });
    if (receipt.principalId !== actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
  }

  async #capabilities(connectorId: Identifier) {
    for (const port of this.#dependencies.executionPorts) {
      const capabilities = await port.capabilities();
      if (capabilities.connectorId === connectorId) return capabilities;
    }
    throw new Error("AGENT_EXECUTION_PORT_NOT_REGISTERED");
  }
}
