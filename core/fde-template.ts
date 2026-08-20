import type { ConnectorRegistration } from "./connector.ts";
import { validateConnectorCatalog } from "./connector.ts";
import type { GovernanceCatalog } from "./governance-catalog.ts";
import { validateGovernanceCatalog } from "./governance-catalog.ts";
import type { OrganizationDraft } from "./organization.ts";
import { validateOrganizationDraft } from "./organization.ts";
import type { ResponsibilityContract } from "./responsibility.ts";
import { validateResponsibilityContracts } from "./responsibility.ts";

export interface FdeTemplate {
  readonly id: string;
  readonly version: string;
  readonly schemaVersion: 1;
  readonly name: string;
  readonly industryCode: string;
  readonly contentDigest: string;
  readonly trust: {
    readonly publisherId: string;
    readonly signatureReference: string;
  };
  readonly organization: OrganizationDraft;
  readonly responsibilityContracts: readonly ResponsibilityContract[];
  readonly connectors: readonly ConnectorRegistration[];
  readonly governance: GovernanceCatalog;
}

const REFERENCE = /^[a-z0-9][a-z0-9-]{0,127}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

export function validateFdeTemplate(template: FdeTemplate): FdeTemplate {
  if (!REFERENCE.test(template.id)) throw new Error("FDE_TEMPLATE_ID_INVALID");
  if (!SEMVER.test(template.version)) throw new Error("FDE_TEMPLATE_VERSION_INVALID");
  if (template.schemaVersion !== 1) throw new Error("FDE_TEMPLATE_SCHEMA_UNSUPPORTED");
  if (!template.name.trim() || template.name.length > 120 || !REFERENCE.test(template.industryCode)) {
    throw new Error("FDE_TEMPLATE_METADATA_INVALID");
  }
  if (!DIGEST.test(template.contentDigest) ||
      !REFERENCE.test(template.trust.publisherId) ||
      !REFERENCE.test(template.trust.signatureReference)) {
    throw new Error("FDE_TEMPLATE_TRUST_METADATA_INVALID");
  }
  const organization = validateOrganizationDraft(template.organization);
  const responsibilityContracts = validateResponsibilityContracts(
    template.responsibilityContracts,
    organization,
  );
  const connectors = validateConnectorCatalog(template.connectors);
  const connectorIds = new Set(connectors.map(({ id }) => id));
  if (connectors.some(({ companyId }) => companyId !== organization.company.id) ||
      organization.agents.some(({ runtimeConnectorId }) => !connectorIds.has(runtimeConnectorId))) {
    throw new Error("FDE_TEMPLATE_CONNECTOR_BINDING_INVALID");
  }
  const governance = validateGovernanceCatalog(template.governance);
  if (governance.companyId !== organization.company.id) throw new Error("FDE_TEMPLATE_TENANT_MISMATCH");
  return {
    ...template,
    name: template.name.trim(),
    organization,
    responsibilityContracts,
    connectors,
    governance,
  };
}
