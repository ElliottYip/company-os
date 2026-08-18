import type { Identifier } from "./control-plane.ts";

export type DataOperation = "READ" | "WRITE" | "EXPORT";
export type DataClassification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";

export interface DataAuthorizationContract {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly dataSourceId: Identifier;
  readonly authorizedAgentIds: readonly Identifier[];
  readonly authorizedOperations: readonly DataOperation[];
  readonly allowedPurposes: readonly string[];
  readonly maximumClassification: DataClassification;
  readonly allowedExportDestinations: readonly Identifier[];
  readonly validFrom: string;
  readonly validUntil: string;
  readonly status: "ACTIVE" | "SUSPENDED" | "REVOKED";
}

export interface GovernedDataAccessRequest {
  readonly companyId: Identifier;
  readonly workId: Identifier;
  readonly agentId: Identifier;
  readonly dataSourceId: Identifier;
  readonly operation: DataOperation;
  readonly purpose: string;
  readonly classification: DataClassification;
  readonly destinationId: Identifier | null;
  readonly contentDigest: string | null;
  readonly requestedAt: string;
}

export type DataPolicyDecision =
  | { readonly type: "GRANTED"; readonly contractId: Identifier }
  | { readonly type: "DENIED"; readonly policyCode: string };

const CLASSIFICATION_RANK: Record<DataClassification, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
};
const DIGEST = /^sha256:[a-z0-9-]{8,128}$/;

function deny(policyCode: string): DataPolicyDecision {
  return { type: "DENIED", policyCode };
}

export function evaluateDataAccess(
  contract: DataAuthorizationContract,
  request: GovernedDataAccessRequest,
): DataPolicyDecision {
  if (contract.status !== "ACTIVE") return deny("CONTRACT_INACTIVE");
  if (contract.companyId !== request.companyId) return deny("TENANT_MISMATCH");
  if (contract.dataSourceId !== request.dataSourceId) return deny("SOURCE_NOT_AUTHORIZED");
  if (!contract.authorizedAgentIds.includes(request.agentId)) return deny("AGENT_NOT_AUTHORIZED");
  if (!contract.authorizedOperations.includes(request.operation)) return deny("OPERATION_NOT_AUTHORIZED");
  if (!contract.allowedPurposes.includes(request.purpose)) return deny("PURPOSE_NOT_AUTHORIZED");
  if (
    !Number.isFinite(Date.parse(request.requestedAt)) ||
    Date.parse(request.requestedAt) < Date.parse(contract.validFrom) ||
    Date.parse(request.requestedAt) >= Date.parse(contract.validUntil)
  ) {
    return deny("CONTRACT_OUTSIDE_VALIDITY");
  }
  if (
    CLASSIFICATION_RANK[request.classification] >
      CLASSIFICATION_RANK[contract.maximumClassification]
  ) {
    return deny("CLASSIFICATION_EXCEEDS_CONTRACT");
  }
  if (request.operation === "EXPORT") {
    if (
      !request.destinationId ||
      !contract.allowedExportDestinations.includes(request.destinationId)
    ) {
      return deny("EXPORT_DESTINATION_NOT_AUTHORIZED");
    }
    if (!request.contentDigest || !DIGEST.test(request.contentDigest)) {
      return deny("EXPORT_DIGEST_REQUIRED");
    }
  } else if (request.destinationId || request.contentDigest) {
    return deny("EXPORT_FIELDS_NOT_ALLOWED");
  }
  return { type: "GRANTED", contractId: contract.id };
}
