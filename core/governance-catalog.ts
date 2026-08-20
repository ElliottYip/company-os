import type { Identifier } from "./control-plane.ts";
import type { DataAuthorizationContract } from "./data-governance.ts";
import type { ModelRoutingPolicy } from "./model-governance.ts";

export interface GovernanceCatalog {
  readonly companyId: Identifier;
  readonly modelRoutingPolicies: readonly ModelRoutingPolicy[];
  readonly dataAuthorizationContracts: readonly DataAuthorizationContract[];
}

const REFERENCE = /^[a-z0-9][a-z0-9-]{0,127}$/;

function unique<T extends string>(values: readonly T[], code: string): readonly T[] {
  if (!values.length || values.some((value) => !value.trim()) || new Set(values).size !== values.length) {
    throw new Error(code);
  }
  return [...values];
}

export function validateGovernanceCatalog(catalog: GovernanceCatalog): GovernanceCatalog {
  if (!REFERENCE.test(catalog.companyId)) throw new Error("GOVERNANCE_COMPANY_ID_INVALID");
  unique(catalog.modelRoutingPolicies.map(({ id }) => id), "MODEL_POLICY_IDS_INVALID");
  unique(
    catalog.dataAuthorizationContracts.map(({ id }) => id),
    "DATA_CONTRACT_IDS_INVALID",
  );
  const modelRoutingPolicies = catalog.modelRoutingPolicies.map((policy) => {
    if (policy.companyId !== catalog.companyId || !REFERENCE.test(policy.id) || !policy.routes.length) {
      throw new Error("MODEL_POLICY_INVALID");
    }
    unique(policy.routes.map(({ id }) => id), "MODEL_ROUTE_IDS_INVALID");
    return {
      ...policy,
      routes: policy.routes.map((route) => {
        if (![route.id, route.providerAdapterId, route.modelReference, route.credentialReference]
          .every((value) => REFERENCE.test(value))) {
          throw new Error("MODEL_ROUTE_REFERENCE_INVALID");
        }
        return {
          ...route,
          allowedDataClassifications: unique(
            route.allowedDataClassifications,
            "MODEL_ROUTE_CLASSIFICATIONS_INVALID",
          ),
        };
      }),
    };
  });
  const dataAuthorizationContracts = catalog.dataAuthorizationContracts.map((contract) => {
    if (contract.companyId !== catalog.companyId ||
        !REFERENCE.test(contract.id) || !REFERENCE.test(contract.dataSourceId)) {
      throw new Error("DATA_CONTRACT_INVALID");
    }
    const validFrom = Date.parse(contract.validFrom);
    const validUntil = Date.parse(contract.validUntil);
    if (!Number.isFinite(validFrom) || !Number.isFinite(validUntil) || validUntil <= validFrom) {
      throw new Error("DATA_CONTRACT_VALIDITY_INVALID");
    }
    return {
      ...contract,
      authorizedAgentIds: unique(contract.authorizedAgentIds, "DATA_CONTRACT_AGENTS_INVALID"),
      authorizedOperations: unique(
        contract.authorizedOperations,
        "DATA_CONTRACT_OPERATIONS_INVALID",
      ),
      allowedPurposes: unique(contract.allowedPurposes, "DATA_CONTRACT_PURPOSES_INVALID"),
      allowedExportDestinations: [...new Set(contract.allowedExportDestinations)],
    };
  });
  return {
    companyId: catalog.companyId,
    modelRoutingPolicies,
    dataAuthorizationContracts,
  };
}
