import type { ConnectorRegistration } from "../core/connector.ts";
import type { DataAuthorizationContract, DataPolicyDecision } from "../core/data-governance.ts";
import type { Identifier } from "../core/control-plane.ts";
import type { ModelRoutingPolicy } from "../core/model-governance.ts";
import type { ConnectorCatalogPort } from "../ports/connector-catalog-port.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { GovernanceCatalogPort } from "../ports/governance-catalog-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

interface SanitizedConnector extends Omit<ConnectorRegistration, "secretReferenceId"> {
  readonly secretConfigured: boolean;
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
  readonly connectorCatalog: { readonly revision: number; readonly connectors: readonly SanitizedConnector[] };
  readonly governance: {
    readonly revision: number;
    readonly modelRoutingPolicies: readonly SanitizedModelPolicy[];
    readonly dataAuthorizationContracts: readonly DataAuthorizationContract[];
  };
  readonly egressDecisions: readonly AdministrationEgressDecision[];
  readonly generatedAt: string;
}

interface AdministrationProjectionDependencies {
  readonly identity: IdentityPort;
  readonly connectors: ConnectorCatalogPort;
  readonly governance: GovernanceCatalogPort;
  readonly events: EventDataStorePort;
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
    const [connectorCatalog, governance, events] = await Promise.all([
      this.#dependencies.connectors.load(companyId),
      this.#dependencies.governance.load(companyId),
      this.#dependencies.events.read(companyId, { types: ["data-egress.decision-recorded"] }),
    ]);
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
      connectorCatalog: {
        revision: connectorCatalog.revision,
        connectors: connectorCatalog.connectors.map(({ secretReferenceId, ...connector }) => ({
          ...connector, secretConfigured: secretReferenceId !== null,
        })),
      },
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
      egressDecisions,
      generatedAt: receipt.authorizedAt,
    };
  }
}
