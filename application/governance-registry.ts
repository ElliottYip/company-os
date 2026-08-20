import type { GovernanceCatalog } from "../core/governance-catalog.ts";
import { validateGovernanceCatalog } from "../core/governance-catalog.ts";
import type {
  GovernanceCatalogPort,
  GovernanceCatalogSnapshot,
} from "../ports/governance-catalog-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

export interface ReplaceGovernanceCatalogInput extends GovernanceCatalog {
  readonly expectedRevision: number;
  readonly recordedAt: string;
}

export class GovernanceRegistry {
  readonly #identity: IdentityPort;
  readonly #store: GovernanceCatalogPort;

  constructor(dependencies: { readonly identity: IdentityPort; readonly store: GovernanceCatalogPort }) {
    this.#identity = dependencies.identity;
    this.#store = dependencies.store;
  }

  async replace(input: ReplaceGovernanceCatalogInput): Promise<GovernanceCatalogSnapshot> {
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== input.companyId) throw new Error("TENANT_MISMATCH");
    const catalog = validateGovernanceCatalog(input);
    const receipt = await this.#identity.authorize({
      companyId: input.companyId,
      action: "governance-catalog:replace",
      resourceId: input.companyId,
      reason: "Replace Company OS model and data governance policy",
    });
    if (receipt.principalId !== identity.actorId) {
      throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    }
    return this.#store.replace({
      ...catalog,
      actorId: identity.actorId,
      expectedRevision: input.expectedRevision,
      recordedAt: input.recordedAt,
    });
  }
}
