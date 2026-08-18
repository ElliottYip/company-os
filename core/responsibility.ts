import type { Identifier } from "./control-plane.ts";
import type { OrganizationDraft } from "./organization.ts";

export const ACTION_CATALOG = [
  { id: "read-knowledge", label: "读取知识", critical: false },
  { id: "draft-content", label: "起草内容", critical: false },
  { id: "send-message", label: "发送消息", critical: false },
  { id: "edit-files", label: "编辑文件", critical: false },
  { id: "run-shell", label: "运行命令", critical: true },
  { id: "publish-content", label: "对外发布", critical: true },
  { id: "spend-money", label: "产生支出", critical: true },
  { id: "manage-identity", label: "管理身份", critical: true },
] as const;

export type ActionId = (typeof ACTION_CATALOG)[number]["id"];
export type ResponsibilityStatus = "DRAFT" | "ACTIVE" | "SUSPENDED" | "ENDED";

export interface ResponsibilityContract {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly agentId: Identifier;
  readonly accountableHumanId: Identifier;
  readonly backupHumanId: Identifier | null;
  readonly autonomyLevel: number;
  readonly allowedActions: readonly ActionId[];
  readonly approvalRequiredActions: readonly ActionId[];
  readonly escalationTimeoutSeconds: number | null;
  readonly status: ResponsibilityStatus;
}

const ACTION_IDS = new Set<string>(ACTION_CATALOG.map(({ id }) => id));
const CRITICAL_ACTIONS = new Map(
  ACTION_CATALOG.filter(({ critical }) => critical).map(({ id, label }) => [id, label]),
);

function uniqueActions(actions: readonly ActionId[], label: string): ActionId[] {
  const unique = new Set<ActionId>();
  for (const action of actions) {
    if (!ACTION_IDS.has(action)) throw new Error(`${label}包含未知动作`);
    if (unique.has(action)) throw new Error(`${label}不能包含重复动作`);
    unique.add(action);
  }
  return [...unique];
}

export function validateResponsibilityContracts(
  contracts: readonly ResponsibilityContract[],
  organization: OrganizationDraft,
): ResponsibilityContract[] {
  if (contracts.length !== organization.agents.length) {
    throw new Error("每个 Agent 恰好需要一份责任合同");
  }

  const humans = new Set(organization.humans.map(({ id }) => id));
  const byAgent = new Map(contracts.map((contract) => [contract.agentId, contract]));
  if (byAgent.size !== contracts.length) {
    throw new Error("每个 Agent 恰好需要一份责任合同");
  }

  return organization.agents.map((agent) => {
    const contract = byAgent.get(agent.id);
    if (!contract) throw new Error("每个 Agent 恰好需要一份责任合同");
    if (contract.companyId !== organization.company.id) {
      throw new Error(`“${agent.name}”的责任合同不属于当前公司`);
    }
    if (
      !humans.has(contract.accountableHumanId) ||
      contract.accountableHumanId !== agent.accountableHumanId
    ) {
      throw new Error(`“${agent.name}”的真人负责人不存在或不匹配`);
    }
    if (
      !Number.isInteger(contract.autonomyLevel) ||
      contract.autonomyLevel < 0 ||
      contract.autonomyLevel > 5
    ) {
      throw new Error(`“${agent.name}”的自主等级无效`);
    }

    const backupHumanId = contract.backupHumanId?.trim() || null;
    if (backupHumanId) {
      if (!humans.has(backupHumanId)) {
        throw new Error(`“${agent.name}”的备用负责人不存在`);
      }
      if (backupHumanId === contract.accountableHumanId) {
        throw new Error("备用负责人必须不同于主要负责人");
      }
    }
    if (contract.escalationTimeoutSeconds !== null) {
      if (!backupHumanId) throw new Error("设置升级超时前必须设置备用负责人");
      if (
        !Number.isInteger(contract.escalationTimeoutSeconds) ||
        contract.escalationTimeoutSeconds < 60 ||
        contract.escalationTimeoutSeconds > 604_800
      ) {
        throw new Error("升级超时必须在 60 秒到 7 天之间");
      }
    }

    const allowedActions = uniqueActions(contract.allowedActions, "允许动作");
    const approvalRequiredActions = uniqueActions(
      contract.approvalRequiredActions,
      "审批动作",
    );
    for (const action of approvalRequiredActions) {
      if (!allowedActions.includes(action)) {
        throw new Error("必须审批的动作也必须先被列为允许动作");
      }
    }
    for (const [action, label] of CRITICAL_ACTIONS) {
      if (
        allowedActions.includes(action as ActionId) &&
        !approvalRequiredActions.includes(action as ActionId)
      ) {
        throw new Error(`${label}必须由真人审批`);
      }
    }

    return { ...contract, backupHumanId, allowedActions, approvalRequiredActions };
  });
}

