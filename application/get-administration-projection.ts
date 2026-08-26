import type { ConnectorRegistration } from "../core/connector.ts";
import type { DataAuthorizationContract, DataPolicyDecision } from "../core/data-governance.ts";
import type { Identifier } from "../core/control-plane.ts";
import type { ModelRoutingPolicy } from "../core/model-governance.ts";
import type { ConnectorCatalogPort } from "../ports/connector-catalog-port.ts";
import type { AgentExecutionPort } from "../ports/agent-execution-port.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { GovernanceCatalogPort } from "../ports/governance-catalog-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { SecretBrokerRuntimePort } from "../ports/secret-broker-runtime-port.ts";
import type { ModelProviderRuntimePort } from "../ports/model-provider-runtime-port.ts";
import type { ToolAccessCatalogPort } from "../ports/tool-access-catalog-port.ts";
import type { ToolAccessCatalog } from "../core/tool-access.ts";
import { summarizeBudgetPolicies, type UsageBudgetLedger, type BudgetPolicySummary } from "../core/usage-budget.ts";
import type { UsageBudgetStorePort } from "../ports/usage-budget-store-port.ts";
import type { DataConnectorPort } from "../ports/data-connector-port.ts";

interface SanitizedConnector extends Omit<ConnectorRegistration, "secretReferenceId"> {
  readonly secretConfigured: boolean;
  readonly runtimeHealth: "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "NOT_BOUND";
}

interface SanitizedModelPolicy extends Omit<ModelRoutingPolicy, "routes"> {
  readonly routes: readonly (Omit<ModelRoutingPolicy["routes"][number], "credentialReference"> & {
    readonly credentialConfigured: boolean;
  })[];
}

export interface AdministrationEgressDecision {
  readonly id: Identifier;
  readonly contractId: Identifier;
  readonly workId: Identifier;
  readonly agentId: Identifier;
  readonly dataSourceId: Identifier;
  readonly destinationId: Identifier | null;
  readonly contentDigest: string | null;
  readonly decision: DataPolicyDecision;
  readonly recordedAt: string;
}

export interface AdministrationProjection {
  readonly schemaVersion: 1;
  readonly mode: "PRODUCTION";
  readonly viewer: { readonly actorId: Identifier; readonly displayName: string };
  /** Operator-owned contract reference; it is not a deletion duration. */
  readonly retentionPolicyId: Identifier;
  readonly connectorCatalog: { readonly revision: number; readonly connectors: readonly SanitizedConnector[] };
  readonly runtimeConnectors: readonly {
    readonly connectorId: Identifier;
    readonly displayName: string;
    readonly protocolVersion: string;
    readonly maximumTimeoutSeconds: number;
    readonly supportsPause: boolean;
    readonly supportsResume: boolean;
    readonly supportsCancellation: boolean;
    readonly supportsEvidence: boolean;
    readonly health: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
    readonly registered: boolean;
  }[];
  readonly secretBrokerRuntime: {
    readonly brokerId: Identifier;
    readonly displayName: string;
    readonly protocolVersion: string;
    readonly supportedPurposes: readonly string[];
    readonly maximumLeaseSeconds: number;
    readonly health: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
    readonly managementSupported: boolean;
  } | null;
  readonly runtimeModelProviders: readonly {
    readonly providerAdapterId: Identifier;
    readonly displayName: string;
    readonly protocolVersion: string;
    readonly modelReferences: readonly Identifier[];
    readonly supportedResidencies: readonly string[];
    readonly health: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
  }[];
  readonly runtimeDataConnectors: readonly {
    readonly connectorId: Identifier;
    readonly displayName: string;
    readonly protocolVersion: string;
    readonly dataSourceIds: readonly Identifier[];
    readonly supportedOperations: readonly string[];
    readonly health: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
  }[];
  readonly governance: {
    readonly revision: number;
    readonly modelRoutingPolicies: readonly SanitizedModelPolicy[];
    readonly dataAuthorizationContracts: readonly DataAuthorizationContract[];
  };
  readonly toolAccess: ToolAccessCatalog;
  readonly usageBudget: {
    readonly ledger: UsageBudgetLedger;
    readonly policySummaries: readonly BudgetPolicySummary[];
    readonly totalReportedCostCents: number;
    readonly unpricedEventCount: number;
  };
  readonly egressDecisions: readonly AdministrationEgressDecision[];
  readonly generatedAt: string;
}

interface AdministrationProjectionDependencies {
  readonly identity: IdentityPort;
  readonly connectors: ConnectorCatalogPort;
  readonly governance: GovernanceCatalogPort;
  readonly events: EventDataStorePort;
  readonly executionPorts: readonly AgentExecutionPort[];
  readonly secretBroker: SecretBrokerRuntimePort | null;
  readonly modelProviders: readonly ModelProviderRuntimePort[];
  readonly toolAccess: ToolAccessCatalogPort;
  readonly usageBudget: UsageBudgetStorePort;
  readonly dataConnectors?: readonly DataConnectorPort[];
  readonly retentionPolicyId: Identifier;
}

export class GetAdministrationProjection {
  readonly #dependencies: AdministrationProjectionDependencies;

  constructor(dependencies: AdministrationProjectionDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(companyId: Identifier): Promise<AdministrationProjection> {
    const identity = await this.#dependencies.identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== companyId) throw new Error("TENANT_MISMATCH");
    const receipt = await this.#dependencies.identity.authorize({
      companyId, action: "administration:read", resourceId: companyId,
      reason: "Read sanitized Connector, model, data, and egress administration projection",
    });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    const [connectorCatalog, governance, toolAccess, usageBudget, events, executionPorts, secretBrokerRuntime, runtimeModelProviders, runtimeDataConnectors] = await Promise.all([
      this.#dependencies.connectors.load(companyId),
      this.#dependencies.governance.load(companyId),
      this.#dependencies.toolAccess.load(companyId),
      this.#dependencies.usageBudget.load(companyId),
      this.#dependencies.events.read(companyId, { types: ["data-egress.decision-recorded"] }),
      Promise.all(this.#dependencies.executionPorts.map(async (port) => {
        try {
          const capabilities = await port.capabilities();
          let health: "HEALTHY" | "DEGRADED" | "UNAVAILABLE" = "UNAVAILABLE";
          try { health = await port.health(); } catch { /* visible as unavailable */ }
          return { capabilities, health };
        } catch {
          return null;
        }
      })),
      (async () => {
        if (!this.#dependencies.secretBroker) return null;
        try {
          const capabilities = await this.#dependencies.secretBroker.capabilities();
          let health: "HEALTHY" | "DEGRADED" | "UNAVAILABLE" = "UNAVAILABLE";
          try { health = await this.#dependencies.secretBroker.health(); } catch { /* visible as unavailable */ }
          return { ...capabilities, health,
            managementSupported: typeof this.#dependencies.secretBroker.beginReferenceManagement === "function" &&
              typeof this.#dependencies.secretBroker.referenceManagementResult === "function" };
        } catch {
          return null;
        }
      })(),
      Promise.all(this.#dependencies.modelProviders.map(async (provider) => {
        try {
          const capabilities = await provider.capabilities();
          let health: "HEALTHY" | "DEGRADED" | "UNAVAILABLE" = "UNAVAILABLE";
          try { health = await provider.health(); } catch { /* visible as unavailable */ }
          return { ...capabilities, health };
        } catch { return null; }
      })),
      Promise.all((this.#dependencies.dataConnectors ?? []).map(async (connector) => {
        try {
          const capabilities = await connector.capabilities();
          let health: "HEALTHY" | "DEGRADED" | "UNAVAILABLE" = "UNAVAILABLE";
          try { health = await connector.health(); } catch { /* visible as unavailable */ }
          return { ...capabilities, health };
        } catch { return null; }
      })),
    ]);
    const healthByConnector = new Map(executionPorts.filter((entry) => entry !== null)
      .map((entry) => [entry.capabilities.connectorId, entry.health] as const));
    const registeredConnectorIds = new Set(connectorCatalog.connectors.map(({ id }) => id));
    const egressDecisions = events.map(({ payload }): AdministrationEgressDecision => {
      const record = payload as {
        readonly id: Identifier; readonly contractId: Identifier; readonly decision: DataPolicyDecision;
        readonly recordedAt: string; readonly request: {
          readonly workId: Identifier; readonly agentId: Identifier; readonly dataSourceId: Identifier;
          readonly destinationId: Identifier | null; readonly contentDigest: string | null;
        };
      };
      if (!record.id || !record.contractId || !record.request || !record.decision || !record.recordedAt) {
        throw new Error("ADMINISTRATION_EGRESS_PROJECTION_CORRUPT");
      }
      return {
        id: record.id, contractId: record.contractId, workId: record.request.workId,
        agentId: record.request.agentId, dataSourceId: record.request.dataSourceId,
        destinationId: record.request.destinationId, contentDigest: record.request.contentDigest,
        decision: structuredClone(record.decision), recordedAt: record.recordedAt,
      };
    });
    return {
      schemaVersion: 1,
      mode: "PRODUCTION",
      viewer: { actorId: identity.actorId, displayName: identity.displayName },
      retentionPolicyId: this.#dependencies.retentionPolicyId,
      connectorCatalog: {
        revision: connectorCatalog.revision,
        connectors: connectorCatalog.connectors.map(({ secretReferenceId, ...connector }) => ({
          ...connector,
          secretConfigured: secretReferenceId !== null,
          runtimeHealth: healthByConnector.get(connector.id) ?? "NOT_BOUND",
        })),
      },
      runtimeConnectors: executionPorts.filter((entry) => entry !== null).map(({ capabilities, health }) => ({
        ...capabilities,
        health,
        registered: registeredConnectorIds.has(capabilities.connectorId),
      })),
      secretBrokerRuntime,
      runtimeModelProviders: runtimeModelProviders.filter((entry) => entry !== null),
      runtimeDataConnectors: runtimeDataConnectors.filter((entry) => entry !== null),
      governance: {
        revision: governance.revision,
        modelRoutingPolicies: governance.modelRoutingPolicies.map((policy) => ({
          ...policy,
          routes: policy.routes.map(({ credentialReference, ...route }) => ({
            ...route, credentialConfigured: Boolean(credentialReference),
          })),
        })),
        dataAuthorizationContracts: structuredClone(governance.dataAuthorizationContracts),
      },
      toolAccess: structuredClone(toolAccess),
      usageBudget: {
        ledger: structuredClone(usageBudget),
        policySummaries: summarizeBudgetPolicies(usageBudget, receipt.authorizedAt),
        totalReportedCostCents: usageBudget.costEvents.reduce((total, event) => total + event.costCents, 0),
        unpricedEventCount: usageBudget.costEvents.filter(({ costStatus }) => costStatus === "unpriced").length,
      },
      egressDecisions,
      generatedAt: receipt.authorizedAt,
    };
  }
}
