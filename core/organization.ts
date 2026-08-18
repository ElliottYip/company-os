import type { Identifier } from "./control-plane.ts";

export interface CompanyDraft {
  readonly id: Identifier;
  readonly name: string;
  readonly purpose: string;
  readonly locale: string;
}

export interface DepartmentDraft {
  readonly id: Identifier;
  readonly name: string;
  readonly mandate: string;
}

export interface HumanDraft {
  readonly id: Identifier;
  readonly name: string;
  readonly title: string;
  readonly departmentId: Identifier;
  readonly avatarId: Identifier;
}

export interface AgentDraft {
  readonly id: Identifier;
  readonly name: string;
  readonly role: string;
  readonly departmentId: Identifier;
  readonly accountableHumanId: Identifier;
  readonly runtimeConnectorId: Identifier;
  readonly avatarId: Identifier;
  readonly autonomyLevel: number;
}

export interface OrganizationDraft {
  readonly company: CompanyDraft;
  readonly departments: readonly DepartmentDraft[];
  readonly humans: readonly HumanDraft[];
  readonly agents: readonly AgentDraft[];
}

const PORTABLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

function required(value: string, label: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label}不能为空`);
  if ([...normalized].length > maximum) {
    throw new Error(`${label}不能超过 ${maximum} 个字符`);
  }
  return normalized;
}

function portableId(value: string, label: string): Identifier {
  const normalized = value.trim();
  if (!PORTABLE_ID.test(normalized)) throw new Error(`${label} 无效`);
  return normalized;
}

function uniqueId(
  id: Identifier,
  ids: Set<Identifier>,
  label: string,
): Identifier {
  if (ids.has(id)) throw new Error(`${label}不能重复`);
  ids.add(id);
  return id;
}

export function validateOrganizationDraft(
  draft: OrganizationDraft,
): OrganizationDraft {
  if (draft.departments.length < 1 || draft.departments.length > 64) {
    throw new Error("公司必须包含 1–64 个部门");
  }
  if (!draft.humans.length) throw new Error("至少添加一位真人负责人");
  if (!draft.agents.length) throw new Error("至少添加一位 Agent 同事");

  const departmentIds = new Set<Identifier>();
  const departments = draft.departments.map((department, index) => {
    const id = uniqueId(
      portableId(department.id, `第 ${index + 1} 个部门 ID`),
      departmentIds,
      "部门 ID",
    );
    const mandate = department.mandate.trim();
    if ([...mandate].length > 2_000) {
      throw new Error(`“${department.name || index + 1}”的职责范围过长`);
    }
    return {
      id,
      name: required(department.name, `第 ${index + 1} 个部门名称`, 120),
      mandate,
    };
  });

  const humanIds = new Set<Identifier>();
  const humans = draft.humans.map((human, index) => {
    const id = uniqueId(
      portableId(human.id, `第 ${index + 1} 位真人 ID`),
      humanIds,
      "真人 ID",
    );
    if (!departmentIds.has(human.departmentId)) {
      throw new Error(`真人“${human.name || index + 1}”指向不存在的部门`);
    }
    return {
      ...human,
      id,
      name: required(human.name, `第 ${index + 1} 位真人姓名`, 120),
      title: required(human.title, `第 ${index + 1} 位真人职责`, 120),
      avatarId: portableId(human.avatarId, "真人形象 ID"),
    };
  });

  const agentIds = new Set<Identifier>();
  const agents = draft.agents.map((agent, index) => {
    const id = uniqueId(
      portableId(agent.id, `第 ${index + 1} 位 Agent ID`),
      agentIds,
      "Agent ID",
    );
    if (!departmentIds.has(agent.departmentId)) {
      throw new Error(`Agent “${agent.name || index + 1}”指向不存在的部门`);
    }
    if (!humanIds.has(agent.accountableHumanId)) {
      throw new Error(`Agent “${agent.name || index + 1}”指向不存在的真人负责人`);
    }
    if (
      !Number.isInteger(agent.autonomyLevel) ||
      agent.autonomyLevel < 0 ||
      agent.autonomyLevel > 5
    ) {
      throw new Error(`Agent “${agent.name || index + 1}”的自主等级必须为 0–5`);
    }
    return {
      ...agent,
      id,
      name: required(agent.name, `第 ${index + 1} 位 Agent 名称`, 120),
      role: required(agent.role, `第 ${index + 1} 位 Agent 岗位`, 120),
      runtimeConnectorId: portableId(
        agent.runtimeConnectorId,
        "Agent 运行连接器 ID",
      ),
      avatarId: portableId(agent.avatarId, "Agent 形象 ID"),
    };
  });

  return {
    company: {
      id: portableId(draft.company.id, "公司 ID"),
      name: required(draft.company.name, "公司名称", 120),
      purpose: draft.company.purpose.trim(),
      locale: required(draft.company.locale, "公司语言", 32),
    },
    departments,
    humans,
    agents,
  };
}

