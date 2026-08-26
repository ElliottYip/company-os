import type {
  CompanyOSAssignmentOptions,
  CompanyOSWorkAssignment,
} from "./application-client.ts";
import type { DataAuthorizationContract, DataClassification, DataOperation } from "../core/data-governance.ts";
import type { ModelRoutingIntent } from "../core/model-governance.ts";
import type { AdministrationProjection } from "../application/get-administration-projection.ts";

export interface FormalAssignmentFields {
  readonly title: string;
  readonly goal: string;
  readonly agentId: string;
  readonly dataAccess?: {
    readonly contractId: string;
    readonly operation: DataOperation;
    readonly purpose: string;
    readonly classification: DataClassification;
    readonly destinationId: string;
    readonly contentDigest: string;
  };
  readonly modelRouting?: ModelRoutingIntent;
}

const CLASSIFICATION_RANK: Record<DataClassification, number> = {
  PUBLIC: 0, INTERNAL: 1, CONFIDENTIAL: 2, RESTRICTED: 3,
};

export function createFormalAssignment(
  options: CompanyOSAssignmentOptions,
  fields: FormalAssignmentFields,
  dataContracts: readonly DataAuthorizationContract[] = [],
  modelPolicies: AdministrationProjection["governance"]["modelRoutingPolicies"] = [],
): CompanyOSWorkAssignment {
  const title = fields.title.trim();
  const goal = fields.goal.trim();
  if (!title || !goal) throw new Error("FORMAL_WORK_INPUT_REQUIRED");
  const agent = options.agents.find(({ id }) => id === fields.agentId);
  if (!agent) throw new Error("FORMAL_AGENT_NOT_ALLOWED");
  if (!agent.allowedActionIds.length) throw new Error("FORMAL_AGENT_HAS_NO_ALLOWED_ACTIONS");
  const dataAccess = fields.dataAccess?.contractId ? fields.dataAccess : null;
  let preparedDataAccess: NonNullable<CompanyOSWorkAssignment["executionPreparation"]>["dataAccess"] = [];
  if (dataAccess) {
    const contract = dataContracts.find(({ id }) => id === dataAccess.contractId);
    if (!contract || contract.status !== "ACTIVE" || !contract.authorizedAgentIds.includes(agent.id)) {
      throw new Error("FORMAL_DATA_CONTRACT_NOT_ALLOWED");
    }
    const purpose = dataAccess.purpose.trim();
    const destinationId = dataAccess.destinationId.trim();
    const contentDigest = dataAccess.contentDigest.trim();
    if (!contract.authorizedOperations.includes(dataAccess.operation) ||
        !contract.allowedPurposes.includes(purpose) ||
        CLASSIFICATION_RANK[dataAccess.classification] > CLASSIFICATION_RANK[contract.maximumClassification] ||
        (dataAccess.operation === "EXPORT"
          ? (!destinationId || !contract.allowedExportDestinations.includes(destinationId) || !/^sha256:[a-z0-9-]{8,128}$/.test(contentDigest))
          : Boolean(destinationId || contentDigest))) {
      throw new Error("FORMAL_DATA_ACCESS_NOT_ALLOWED");
    }
    preparedDataAccess = [{
        requestId: `data-request-${crypto.randomUUID()}`,
        contractId: contract.id,
        dataSourceId: contract.dataSourceId,
        operation: dataAccess.operation,
        purpose,
        classification: dataAccess.classification,
        destinationId: destinationId || null,
        contentDigest: contentDigest || null,
      }];
  }
  const modelRouting = fields.modelRouting ?? null;
  if (modelRouting) {
    const policy = modelPolicies.find(({ id, companyId }) =>
      id === modelRouting.policyId && companyId === modelRouting.companyId);
    const eligible = policy?.routes.some((route) => route.enabled && route.credentialConfigured &&
      route.residency === modelRouting.requiredResidency &&
      route.allowedDataClassifications.includes(modelRouting.classification));
    if (!eligible || (dataAccess && dataAccess.classification !== modelRouting.classification)) {
      throw new Error("FORMAL_MODEL_ROUTE_NOT_ALLOWED");
    }
  }
  const executionPreparation: CompanyOSWorkAssignment["executionPreparation"] =
    preparedDataAccess.length || modelRouting
      ? { dataAccess: preparedDataAccess, secretLeases: [],
          ...(modelRouting ? { modelRouting: structuredClone(modelRouting) } : {}) }
      : undefined;
  return {
    title,
    goal,
    agentId: agent.id,
    departmentId: agent.departmentId,
    requestedBy: options.viewerId,
    actionIds: [...agent.allowedActionIds],
    ...(executionPreparation ? { executionPreparation } : {}),
  };
}

export interface FormalWebFailure {
  readonly kind: "UNAUTHORIZED" | "FORBIDDEN" | "OFFLINE" | "EMPTY" | "LIMIT" | "FAILURE";
  readonly code: string;
  readonly copy: string;
}

export function formalWebFailure(error: unknown): FormalWebFailure {
  const code = error instanceof Error ? error.message : "FORMAL_API_REQUEST_FAILED";
  if (code === "FORMAL_IDENTITY_REQUIRED") {
    return { kind: "UNAUTHORIZED", code, copy: "需要正式登录后才能进入这家公司。" };
  }
  if (["TENANT_MISMATCH", "AUTHORIZATION_PRINCIPAL_MISMATCH"].includes(code)) {
    return { kind: "FORBIDDEN", code, copy: "当前身份无权访问这家公司。" };
  }
  if (code === "BUDGET_HARD_STOP") {
    return { kind: "LIMIT", code, copy: "已达到适用预算上限，无法创建新的工作。" };
  }
  if (error instanceof TypeError || [
    "FORMAL_API_REQUEST_FAILED",
    "FORMAL_API_UNREACHABLE",
    "FORMAL_API_REQUEST_TIMEOUT",
  ].includes(code)) {
    return { kind: "OFFLINE", code: "FORMAL_API_UNREACHABLE", copy: "暂时无法连接 Company OS 服务。" };
  }
  if (["ORGANIZATION_NOT_FOUND", "APPROVAL_REQUEST_NOT_FOUND"].includes(code)) {
    return { kind: "EMPTY", code, copy: "当前还没有可显示的正式数据。" };
  }
  return { kind: "FAILURE", code, copy: "正式控制面暂时无法完成此操作。" };
}
