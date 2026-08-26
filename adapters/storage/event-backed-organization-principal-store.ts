import { validateCompanyStructure, type CompanyStructure } from "../../core/company-structure.ts";
import type { Identifier, Principal } from "../../core/control-plane.ts";
import type { OrganizationDraft } from "../../core/organization.ts";
import type { EventDataStorePort } from "../../ports/event-data-store-port.ts";
import type { OrganizationPrincipalPort } from "../../ports/organization-principal-port.ts";
import type { CompanyStructurePort } from "../../ports/company-structure-port.ts";

export class EventBackedOrganizationPrincipalStore implements OrganizationPrincipalPort, CompanyStructurePort {
  readonly #events: EventDataStorePort;

  constructor(events: EventDataStorePort) {
    this.#events = events;
  }

  async getOrganization(companyId: Identifier): Promise<OrganizationDraft | null> {
    return (await this.load(companyId))?.organization ?? null;
  }

  async load(companyId: Identifier): Promise<CompanyStructure | null> {
    const event = (await this.#events.read(companyId, {
      types: ["organization.registered", "organization.revised"],
    })).at(-1);
    if (!event) return null;
    const structure = (event.payload as { readonly structure?: CompanyStructure }).structure;
    if (!structure) throw new Error("ORGANIZATION_PROJECTION_CORRUPT");
    return structuredClone(validateCompanyStructure(structure));
  }

  async listPrincipals(companyId: Identifier): Promise<readonly Principal[]> {
    const organization = await this.getOrganization(companyId);
    if (!organization) return [];
    return [
      ...organization.humans.map((human) => ({
        id: human.id,
        kind: "HUMAN" as const,
        displayName: human.name,
      })),
      ...organization.agents.map((agent) => ({
        id: agent.id,
        kind: "SERVICE" as const,
        displayName: agent.name,
      })),
    ];
  }
}
