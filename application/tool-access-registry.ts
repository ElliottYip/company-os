import type { Identifier } from "../core/control-plane.ts";
import { validateToolAccessCatalog, type ToolAccessCatalog } from "../core/tool-access.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { ToolAccessCatalogPort } from "../ports/tool-access-catalog-port.ts";

export class ToolAccessRegistry {
  readonly #identity: IdentityPort; readonly #store: ToolAccessCatalogPort; readonly #now: () => string;
  constructor(identity: IdentityPort, store: ToolAccessCatalogPort, now: () => string) {
    this.#identity = identity; this.#store = store; this.#now = now;
  }
  async load(companyId: Identifier) { await this.authorize(companyId, "tool-access:read"); return this.#store.load(companyId); }
  async replace(companyId: Identifier, input: Omit<ToolAccessCatalog, "companyId">, expectedRevision: number) {
    const identity = await this.authorize(companyId, "tool-access:update");
    const catalog = validateToolAccessCatalog({ ...input, companyId });
    if (catalog.revision !== expectedRevision) throw new Error("TOOL_ACCESS_REVISION_CONFLICT");
    return this.#store.replace(catalog, expectedRevision, identity.actorId, this.#now());
  }
  async authorize(companyId: Identifier, action: string) {
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== companyId) throw new Error("TENANT_MISMATCH");
    const receipt = await this.#identity.authorize({ companyId, action, resourceId: companyId,
      reason: "Manage tool profiles, bindings, and policies" });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    return identity;
  }
}
