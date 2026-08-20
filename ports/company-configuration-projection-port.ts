import type { ConnectorCatalogSnapshot } from "./connector-catalog-port.ts";
import type { GovernanceCatalogSnapshot } from "./governance-catalog-port.ts";
import type { ResponsibilityContractSnapshot } from "./responsibility-contract-port.ts";
import type { Identifier } from "../core/control-plane.ts";
import type { OrganizationDraft } from "../core/organization.ts";

export interface CompanyConfigurationProjection {
  readonly applicationId: Identifier;
  readonly templateId: string;
  readonly templateVersion: string;
  readonly organization: OrganizationDraft;
  readonly responsibility: ResponsibilityContractSnapshot;
  readonly connectors: ConnectorCatalogSnapshot;
  readonly governance: GovernanceCatalogSnapshot;
  readonly revisions: {
    readonly organization: number;
    readonly responsibility: number;
    readonly connectors: number;
    readonly governance: number;
  };
}

export interface CompanyConfigurationProjectionPort {
  load(companyId: Identifier): Promise<CompanyConfigurationProjection | null>;
}
