import type { CompanyStructure } from "../core/company-structure.ts";
import type { Identifier } from "../core/control-plane.ts";

export interface CompanyStructurePort {
  load(companyId: Identifier): Promise<CompanyStructure | null>;
}
