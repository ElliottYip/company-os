import type { Identifier, WorkStatus } from "./control-plane.ts";
import type { OrganizationDraft } from "./organization.ts";
import type { ActionId, ResponsibilityContract } from "./responsibility.ts";

export type WorkScope = "AGENT" | "DEPARTMENT" | "PROJECT";

export interface WorkDraft {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly title: string;
  readonly goal: string;
  readonly scope: "agent" | "department" | "project" | WorkScope;
  readonly departmentId: Identifier;
  readonly projectId: Identifier | null;
  readonly agentId: Identifier;
  readonly requestedBy: Identifier;
  readonly actionIds: readonly ActionId[];
  readonly parentWorkId: Identifier | null;
}

export interface WorkItem extends Omit<WorkDraft, "scope"> {
  readonly scope: WorkScope;
  readonly accountableHumanId: Identifier;
  readonly responsibilityContractId: Identifier;
  readonly runtimeConnectorId: Identifier;
  readonly status: WorkStatus;
}

const PORTABLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

function required(value: string, label: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized || [...normalized].length > maximum) {
    throw new Error(`${label}必须包含 1–${maximum} 个字符`);
  }
  return normalized;
}

function validId(id: string, label: string): Identifier {
  const normalized = id.trim();
  if (!PORTABLE_ID.test(normalized)) throw new Error(`${label}无效`);
  return normalized;
}

function normalizeScope(scope: WorkDraft["scope"]): WorkScope {
  return scope.toUpperCase() as WorkScope;
}

export function validateWorkDraft(
  draft: WorkDraft,
  organization: OrganizationDraft,
  contracts: readonly ResponsibilityContract[],
  existing: readonly WorkItem[],
): WorkItem {
  const id = validId(draft.id, "工作 ID");
  if (draft.companyId !== organization.company.id) {
    throw new Error("工作不属于当前公司");
  }
  if (!organization.humans.some(({ id: humanId }) => humanId === draft.requestedBy)) {
    throw new Error("工作发起人不是当前公司的真人");
  }
  if (!organization.departments.some(({ id: value }) => value === draft.departmentId)) {
    throw new Error("工作指向不存在的部门");
  }

  const agent = organization.agents.find(({ id: value }) => value === draft.agentId);
  if (!agent || agent.departmentId !== draft.departmentId) {
    throw new Error("执行 Agent 不属于所选部门");
  }
  const contract = contracts.find((candidate) =>
    candidate.agentId === agent.id &&
    candidate.companyId === draft.companyId &&
    candidate.status.toUpperCase() === "ACTIVE"
  );
  if (!contract || contract.accountableHumanId !== agent.accountableHumanId) {
    throw new Error("执行 Agent 没有有效责任合同");
  }

  if (!draft.actionIds.length) throw new Error("工作至少需要一个动作");
  const actionIds = [...new Set(draft.actionIds)];
  if (actionIds.length !== draft.actionIds.length) {
    throw new Error("工作动作不能重复");
  }
  for (const actionId of actionIds) {
    if (!contract.allowedActions.includes(actionId)) {
      throw new Error(`责任合同不允许动作 ${actionId}`);
    }
  }

  const scope = normalizeScope(draft.scope);
  if (scope === "PROJECT" && !draft.projectId) {
    throw new Error("项目工作必须关联项目");
  }
  if (scope !== "PROJECT" && draft.projectId) {
    throw new Error("只有项目工作可以关联项目");
  }

  const parentWorkId = draft.parentWorkId
    ? validId(draft.parentWorkId, "上级工作 ID")
    : null;
  if (parentWorkId) {
    const byId = new Map(existing.map((work) => [work.id, work]));
    let cursor = byId.get(parentWorkId);
    if (!cursor || cursor.companyId !== draft.companyId) {
      throw new Error("上级工作不存在于当前公司");
    }
    const visited = new Set<Identifier>([id]);
    while (cursor) {
      if (visited.has(cursor.id)) throw new Error("工作不能形成循环委派");
      visited.add(cursor.id);
      if (cursor.parentWorkId === id) throw new Error("工作不能形成循环委派");
      cursor = cursor.parentWorkId ? byId.get(cursor.parentWorkId) : undefined;
    }
  }

  return {
    ...draft,
    id,
    title: required(draft.title, "工作标题", 120),
    goal: required(draft.goal, "工作目标", 10_000),
    scope,
    actionIds,
    parentWorkId,
    accountableHumanId: contract.accountableHumanId,
    responsibilityContractId: contract.id,
    runtimeConnectorId: agent.runtimeConnectorId,
    status: "PENDING",
  };
}

