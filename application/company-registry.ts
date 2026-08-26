import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";
import {
  validateCompanyStructure,
  type CompanyStructure,
} from "../core/company-structure.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

interface Dependencies {
  readonly identity: IdentityPort;
  readonly events: EventDataStorePort;
  readonly now: () => string;
  readonly nextId: () => Identifier;
}

export class CompanyRegistry {
  readonly #dependencies: Dependencies;

  constructor(dependencies: Dependencies) {
    this.#dependencies = dependencies;
  }

  async register(input: CompanyStructure): Promise<CompanyStructure> {
    const structure = validateCompanyStructure(input);
    const identity = await this.#identityFor(structure.organization.company.id);
    const existing = await this.#dependencies.events.read(identity.organizationId);
    if (existing.some(({ type }) => type === "organization.registered")) {
      throw new Error("ORGANIZATION_ALREADY_REGISTERED");
    }
    const receipt = await this.#dependencies.identity.authorize({
      companyId: identity.organizationId,
      action: "organization:register",
      resourceId: identity.organizationId,
      reason: "Register the initial company structure",
    });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    const event: CompanyDomainEvent = {
      id: this.#dependencies.nextId(),
      companyId: identity.organizationId,
      type: "organization.registered",
      occurredAt: this.#dependencies.now(),
      actorId: identity.actorId,
      payload: { structure, authorizationReceiptId: receipt.id },
      provenance: "PRODUCTION",
    };
    await this.#dependencies.events.append(event, existing.length);
    return structuredClone(structure);
  }

  async get(companyId: Identifier): Promise<CompanyStructure | null> {
    await this.#identityFor(companyId);
    const event = (await this.#dependencies.events.read(companyId, {
      types: ["organization.registered", "organization.revised"],
    })).at(-1);
    if (!event) return null;
    const payload = event.payload as { readonly structure?: CompanyStructure };
    if (!payload.structure) throw new Error("Stored company structure is invalid.");
    return validateCompanyStructure(payload.structure);
  }

  async #identityFor(companyId: Identifier) {
    const identity = await this.#dependencies.identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== companyId) throw new Error("TENANT_MISMATCH");
    return identity;
  }
}
