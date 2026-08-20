import type {
  CompanyOSAssignmentOptions,
  CompanyOSWorkAssignment,
} from "./application-client.ts";

export interface FormalAssignmentFields {
  readonly title: string;
  readonly goal: string;
  readonly agentId: string;
}

export function createFormalAssignment(
  options: CompanyOSAssignmentOptions,
  fields: FormalAssignmentFields,
): CompanyOSWorkAssignment {
  const title = fields.title.trim();
  const goal = fields.goal.trim();
  if (!title || !goal) throw new Error("FORMAL_WORK_INPUT_REQUIRED");
  const agent = options.agents.find(({ id }) => id === fields.agentId);
  if (!agent) throw new Error("FORMAL_AGENT_NOT_ALLOWED");
  if (!agent.allowedActionIds.length) throw new Error("FORMAL_AGENT_HAS_NO_ALLOWED_ACTIONS");
  return {
    title,
    goal,
    agentId: agent.id,
    departmentId: agent.departmentId,
    requestedBy: options.viewerId,
    actionIds: [...agent.allowedActionIds],
  };
}

export interface FormalWebFailure {
  readonly kind: "UNAUTHORIZED" | "FORBIDDEN" | "OFFLINE" | "EMPTY" | "FAILURE";
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
  if (error instanceof TypeError || code === "FORMAL_API_REQUEST_FAILED") {
    return { kind: "OFFLINE", code: "FORMAL_API_UNREACHABLE", copy: "暂时无法连接 Company OS 服务。" };
  }
  if (["ORGANIZATION_NOT_FOUND", "APPROVAL_REQUEST_NOT_FOUND"].includes(code)) {
    return { kind: "EMPTY", code, copy: "当前还没有可显示的正式数据。" };
  }
  return { kind: "FAILURE", code, copy: "正式控制面暂时无法完成此操作。" };
}
