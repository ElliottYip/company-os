import assert from "node:assert/strict";
import test from "node:test";

import { validateOrganizationDraft } from "../core/organization.ts";
import { validateResponsibilityContracts } from "../core/responsibility.ts";
import { validateWorkDraft } from "../core/work.ts";

const organization = {
  company: { id: "tide-studio", name: "潮汐", purpose: "真人负责", locale: "zh-CN" },
  departments: [{ id: "growth", name: "增长", mandate: "形成证据" }],
  humans: [{
    id: "owner",
    name: "张颖",
    title: "负责人",
    departmentId: "growth",
    avatarId: "clay-sunrise",
  }],
  agents: [{
    id: "researcher",
    name: "研究员",
    role: "市场研究",
    departmentId: "growth",
    accountableHumanId: "owner",
    runtimeConnectorId: "runtime-primary",
    avatarId: "fish-ocean",
    autonomyLevel: 2,
  }],
};

const contract = {
  id: "contract-researcher",
  companyId: "tide-studio",
  agentId: "researcher",
  accountableHumanId: "owner",
  backupHumanId: null,
  autonomyLevel: 2,
  allowedActions: ["read-knowledge", "publish-content"],
  approvalRequiredActions: ["publish-content"],
  escalationTimeoutSeconds: null,
  status: "active",
} as const;

test("received organization core keeps opaque portable IDs and accountable humans", () => {
  const value = validateOrganizationDraft(organization);
  assert.equal(value.agents[0]?.accountableHumanId, "owner");

  assert.throws(
    () => validateOrganizationDraft({
      ...organization,
      company: { ...organization.company, id: "vendor:session:123" },
    }),
    /公司 ID 无效/,
  );
});

test("every received agent must reference an existing human and department", () => {
  assert.throws(
    () => validateOrganizationDraft({
      ...organization,
      agents: [{ ...organization.agents[0]!, accountableHumanId: "missing" }],
    }),
    /指向不存在的真人负责人/,
  );
  assert.throws(
    () => validateOrganizationDraft({
      ...organization,
      agents: [{ ...organization.agents[0]!, departmentId: "missing" }],
    }),
    /指向不存在的部门/,
  );
});

test("received responsibility core requires human approval for critical actions", () => {
  const value = validateResponsibilityContracts([contract], organization);
  assert.equal(value[0]?.approvalRequiredActions[0], "publish-content");

  assert.throws(
    () => validateResponsibilityContracts([{
      ...contract,
      approvalRequiredActions: [],
    }], organization),
    /对外发布必须由真人审批/,
  );
});

test("every agent receives exactly one responsibility contract", () => {
  assert.throws(
    () => validateResponsibilityContracts([], organization),
    /每个 Agent 恰好需要一份责任合同/,
  );
});

test("escalation requires a distinct valid backup human", () => {
  const withBackup = {
    ...organization,
    humans: [
      ...organization.humans,
      {
        id: "backup",
        name: "李航",
        title: "备用负责人",
        departmentId: "growth",
        avatarId: "clay-ocean",
      },
    ],
  };
  assert.throws(
    () => validateResponsibilityContracts([{
      ...contract,
      backupHumanId: "owner",
      escalationTimeoutSeconds: 300,
    }], withBackup),
    /备用负责人必须不同于主要负责人/,
  );
});

test("staged work candidate resolves responsibility without vendor session data", () => {
  const work = validateWorkDraft({
    id: "work-market-brief",
    companyId: "tide-studio",
    title: "市场简报",
    goal: "形成带证据的市场简报",
    scope: "agent",
    departmentId: "growth",
    projectId: null,
    agentId: "researcher",
    requestedBy: "owner",
    actionIds: ["read-knowledge"],
    parentWorkId: null,
  }, organization, [contract], []);

  assert.equal(work.accountableHumanId, "owner");
  assert.equal(work.runtimeConnectorId, "runtime-primary");
  assert.equal(work.status, "PENDING");
  assert.equal("session" in work, false);
});

test("received work rejects actions outside its responsibility contract", () => {
  assert.throws(
    () => validateWorkDraft({
      id: "work-publish",
      companyId: "tide-studio",
      title: "发布",
      goal: "发布一份不被合同允许的内容",
      scope: "agent",
      departmentId: "growth",
      projectId: null,
      agentId: "researcher",
      requestedBy: "owner",
      actionIds: ["spend-money"],
      parentWorkId: null,
    }, organization, [contract], []),
    /责任合同不允许动作 spend-money/,
  );
});

test("received work rejects outsider initiators and cyclic delegation", () => {
  const base = validateWorkDraft({
    id: "work-parent",
    companyId: "tide-studio",
    title: "市场简报",
    goal: "形成带证据的市场简报",
    scope: "agent",
    departmentId: "growth",
    projectId: null,
    agentId: "researcher",
    requestedBy: "owner",
    actionIds: ["read-knowledge"],
    parentWorkId: null,
  }, organization, [contract], []);

  assert.throws(
    () => validateWorkDraft({
      ...base,
      id: "work-outsider",
      requestedBy: "outsider",
      status: undefined,
    }, organization, [contract], []),
    /工作发起人不是当前公司的真人/,
  );

  assert.throws(
    () => validateWorkDraft({
      ...base,
      id: "work-child",
      parentWorkId: "work-parent",
      status: undefined,
    }, organization, [contract], [{ ...base, parentWorkId: "work-child" }]),
    /工作不能形成循环委派/,
  );
});
