import type { Identifier, Principal } from "../core/control-plane.ts";
import type { OrganizationDraft } from "../core/organization.ts";

export interface OrganizationPrincipalPort {
  getOrganization(companyId: Identifier): Promise<OrganizationDraft | null>;
  listPrincipals(companyId: Identifier): Promise<readonly Principal[]>;
}

