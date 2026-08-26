import type {
  DataAuthorizationContract,
  DataClassification,
  DataOperation,
} from "../core/data-governance.ts";
import { validateGovernanceCatalog } from "../core/governance-catalog.ts";
import type { Identifier } from "../core/control-plane.ts";
import type { CompanyStructurePort } from "../ports/company-structure-port.ts";
import type { GovernanceCatalogPort, GovernanceCatalogSnapshot } from "../ports/governance-catalog-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

interface Dependencies {
  readonly identity: IdentityPort;
  readonly structure: CompanyStructurePort;
  readonly store: GovernanceCatalogPort;
  readonly now: () => string;
}

export interface CreateDataAuthorizationContractInput {
  readonly companyId: Identifier;
  readonly id: Identifier;
  readonly dataSourceId: Identifier;
  readonly authorizedAgentIds: readonly Identifier[];
  readonly authorizedOperations: readonly DataOperation[];
  readonly allowedPurposes: readonly string[];
  readonly maximumClassification: DataClassification;
  readonly allowedExportDestinations: readonly Identifier[];
  readonly validUntil: string;
  readonly expectedRevision: number;
}

/**
 * Company-scoped grant lifecycle: create active, pause/resume without deleting
 * the record, and terminal revoke. Upstream provenance lives in docs only.
 */
export class ManageDataAuthorizationContract {
  readonly #dependencies: Dependencies;

  constructor(dependencies: Dependencies) { this.#dependencies = dependencies; }

  async create(input: CreateDataAuthorizationContractInput): Promise<GovernanceCatalogSnapshot> {
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw new Error("DATA_AUTHORIZATION_INPUT_INVALID");
    }
    const identity = await this.#identity(input.companyId);
    const snapshot = await this.#dependencies.store.load(input.companyId);
    if (snapshot.revision !== input.expectedRevision) throw new Error("GOVERNANCE_CATALOG_REVISION_CONFLICT");
    if (snapshot.dataAuthorizationContracts.some(({ id }) => id === input.id)) {
      throw new Error("DATA_AUTHORIZATION_ALREADY_EXISTS");
    }
    const structure = await this.#dependencies.structure.load(input.companyId);
    if (!structure) throw new Error("COMPANY_STRUCTURE_NOT_FOUND");
    const agents = new Set(structure.organization.agents.map(({ id }) => id));
    if (input.authorizedAgentIds.some((id) => !agents.has(id))) {
      throw new Error("DATA_AUTHORIZATION_AGENT_NOT_FOUND");
    }
    const contract: DataAuthorizationContract = {
      id: input.id,
      companyId: input.companyId,
      dataSourceId: input.dataSourceId,
      authorizedAgentIds: [...input.authorizedAgentIds],
      authorizedOperations: [...input.authorizedOperations],
      allowedPurposes: [...input.allowedPurposes],
      maximumClassification: input.maximumClassification,
      allowedExportDestinations: [...input.allowedExportDestinations],
      validFrom: this.#dependencies.now(),
      validUntil: input.validUntil,
      status: "ACTIVE",
    };
    const catalog = validateGovernanceCatalog({
      companyId: input.companyId,
      modelRoutingPolicies: snapshot.modelRoutingPolicies,
      dataAuthorizationContracts: [...snapshot.dataAuthorizationContracts, contract],
    });
    await this.#authorize(identity.actorId, input.companyId, "data-authorization:create", input.id);
    return this.#dependencies.store.replace({
      ...catalog,
      actorId: identity.actorId,
      expectedRevision: input.expectedRevision,
      recordedAt: this.#dependencies.now(),
    });
  }

  async setStatus(input: {
    readonly companyId: Identifier;
    readonly contractId: Identifier;
    readonly status: DataAuthorizationContract["status"];
    readonly expectedRevision: number;
  }): Promise<GovernanceCatalogSnapshot> {
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 ||
        !["ACTIVE", "SUSPENDED", "REVOKED"].includes(input.status)) {
      throw new Error("DATA_AUTHORIZATION_STATUS_INPUT_INVALID");
    }
    const identity = await this.#identity(input.companyId);
    const snapshot = await this.#dependencies.store.load(input.companyId);
    if (snapshot.revision !== input.expectedRevision) throw new Error("GOVERNANCE_CATALOG_REVISION_CONFLICT");
    const current = snapshot.dataAuthorizationContracts.find(({ id }) => id === input.contractId);
    if (!current) throw new Error("DATA_AUTHORIZATION_NOT_FOUND");
    if (current.status === "REVOKED" && input.status !== "REVOKED") {
      throw new Error("DATA_AUTHORIZATION_REVOKED_TERMINAL");
    }
    if (current.status === input.status) return snapshot;
    await this.#authorize(identity.actorId, input.companyId, "data-authorization:update", input.contractId);
    return this.#dependencies.store.replace({
      companyId: input.companyId,
      modelRoutingPolicies: snapshot.modelRoutingPolicies,
      dataAuthorizationContracts: snapshot.dataAuthorizationContracts.map((contract) =>
        contract.id === input.contractId ? { ...contract, status: input.status } : contract),
      actorId: identity.actorId,
      expectedRevision: input.expectedRevision,
      recordedAt: this.#dependencies.now(),
    });
  }

  async #identity(companyId: Identifier) {
    const identity = await this.#dependencies.identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== companyId) throw new Error("TENANT_MISMATCH");
    return identity;
  }

  async #authorize(actorId: Identifier, companyId: Identifier, action: string, resourceId: Identifier) {
    const receipt = await this.#dependencies.identity.authorize({
      companyId,
      action,
      resourceId,
      reason: `${action} company-scoped data access grant`,
    });
    if (receipt.principalId !== actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
  }
}
