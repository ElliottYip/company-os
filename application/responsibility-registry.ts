import type { Identifier } from "../core/control-plane.ts";
import {
  validateResponsibilityContracts,
  type ResponsibilityContract,
} from "../core/responsibility.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { OrganizationPrincipalPort } from "../ports/organization-principal-port.ts";
import type { ResponsibilityContractPort } from "../ports/responsibility-contract-port.ts";

export class ResponsibilityRegistry {
  readonly #identity: IdentityPort;
  readonly #organization: OrganizationPrincipalPort;
  readonly #contracts: ResponsibilityContractPort;
  readonly #now: () => string;

  constructor(dependencies: {
    readonly identity: IdentityPort;
    readonly organization: OrganizationPrincipalPort;
    readonly contracts: ResponsibilityContractPort;
    readonly now: () => string;
  }) {
    this.#identity = dependencies.identity;
    this.#organization = dependencies.organization;
    this.#contracts = dependencies.contracts;
    this.#now = dependencies.now;
  }

  async replace(
    companyId: Identifier,
    contracts: readonly ResponsibilityContract[],
    expectedRevision: number,
  ) {
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== companyId) throw new Error("TENANT_MISMATCH");
    const organization = await this.#organization.getOrganization(companyId);
    if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");
    const validated = validateResponsibilityContracts(contracts, organization);
    const receipt = await this.#identity.authorize({
      companyId,
      action: "responsibility:replace",
      resourceId: companyId,
      reason: "Replace company Agent responsibility contracts",
    });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    return this.#contracts.replace({
      companyId,
      actorId: identity.actorId,
      recordedAt: this.#now(),
      expectedRevision,
      contracts: validated,
    });
  }
}
