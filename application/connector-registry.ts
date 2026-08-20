import type { Identifier } from "../core/control-plane.ts";
import { validateConnectorCatalog, type ConnectorRegistration } from "../core/connector.ts";
import type { ConnectorCatalogPort, ConnectorCatalogSnapshot } from "../ports/connector-catalog-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

export interface ReplaceConnectorCatalogInput {
  readonly companyId: Identifier;
  readonly expectedRevision: number;
  readonly connectors: readonly ConnectorRegistration[];
  readonly recordedAt: string;
}

export class ConnectorRegistry {
  readonly #identity: IdentityPort;
  readonly #store: ConnectorCatalogPort;

  constructor(dependencies: { readonly identity: IdentityPort; readonly store: ConnectorCatalogPort }) {
    this.#identity = dependencies.identity;
    this.#store = dependencies.store;
  }

  async replace(input: ReplaceConnectorCatalogInput): Promise<ConnectorCatalogSnapshot> {
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== input.companyId) throw new Error("TENANT_MISMATCH");
    const connectors = validateConnectorCatalog(input.connectors);
    if (connectors.some(({ companyId }) => companyId !== input.companyId)) {
      throw new Error("TENANT_MISMATCH");
    }
    const receipt = await this.#identity.authorize({
      companyId: input.companyId,
      action: "connector-catalog:replace",
      resourceId: input.companyId,
      reason: "Replace the versioned Company OS connector catalog",
    });
    if (receipt.principalId !== identity.actorId) {
      throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    }
    return this.#store.replace({
      ...input,
      actorId: identity.actorId,
      connectors,
    });
  }
}
