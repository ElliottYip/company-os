import assert from "node:assert/strict";
import test from "node:test";

import {
  addAgentColleague,
  addHumanColleague,
  createOrganizationSetupDraft,
  updateAgentProfile,
  updateHumanProfile,
  upsertDepartment,
} from "../web/product-onboarding/onboarding-model.ts";

test("first-run setup creates a valid company with one accountable human", () => {
  const organization = createOrganizationSetupDraft({
    companyName: "海星工作室",
    companyPurpose: "让真人与 Agent 协作交付客户项目",
    departmentName: "客户成功部",
    humanName: "陈晨",
    humanTitle: "Agent Boss",
    agentName: "客户洞察助理",
    agentRole: "整理客户反馈并提交证据",
  });

  assert.equal(organization.company.name, "海星工作室");
  assert.equal(organization.departments.length, 1);
  assert.equal(organization.humans[0]?.name, "陈晨");
  assert.equal(organization.agents.length, 1);
  assert.equal(organization.agents[0]?.name, "客户洞察助理");
  assert.equal(organization.agents[0]?.accountableHumanId, organization.humans[0]?.id);
});

test("organization editor adds humans and Agents without breaking responsibility ownership", () => {
  const initial = createOrganizationSetupDraft({
    companyName: "海星工作室",
    companyPurpose: "客户交付",
    departmentName: "交付部",
    humanName: "陈晨",
    humanTitle: "负责人",
  });
  const withHuman = addHumanColleague(initial, {
    name: "周舟",
    title: "财务负责人",
    departmentId: initial.departments[0]!.id,
  });
  const withAgent = addAgentColleague(withHuman, {
    name: "账单核对 Agent",
    role: "核对每月账单并形成证据",
    departmentId: initial.departments[0]!.id,
    accountableHumanId: withHuman.humans[1]!.id,
    runtimeConnectorId: "connector-codex",
    autonomyLevel: 1,
    avatarId: "fish-fizz",
  });

  assert.equal(withAgent.humans.length, 2);
  assert.equal(withAgent.agents.length, 2);
  assert.equal(withAgent.agents[1]?.accountableHumanId, withHuman.humans[1]?.id);
});

test("organization editor rejects missing accountable humans and unknown departments", () => {
  const initial = createOrganizationSetupDraft({
    companyName: "海星工作室",
    companyPurpose: "客户交付",
    departmentName: "交付部",
    humanName: "陈晨",
    humanTitle: "负责人",
  });

  assert.throws(() => addAgentColleague(initial, {
    name: "无主 Agent",
    role: "不应被创建",
    departmentId: "unknown-department",
    accountableHumanId: "unknown-human",
    runtimeConnectorId: "connector-codex",
    autonomyLevel: 2,
    avatarId: "fish-bumble",
  }));
});

test("department lifecycle keeps opaque IDs stable while adding and editing boundaries", () => {
  const initial = createOrganizationSetupDraft({
    companyName: "Northstar", companyPurpose: "Customer delivery",
    departmentName: "Operations", humanName: "Alex", humanTitle: "Owner",
  });
  const expanded = upsertDepartment(initial, { name: "Finance", mandate: "Own financial controls" });
  const finance = expanded.departments[1]!;
  assert.match(finance.id, /^department-finance/);

  const revised = upsertDepartment(expanded, {
    departmentId: finance.id, name: "Finance & Risk", mandate: "Own financial and risk controls",
  });
  assert.equal(revised.departments[1]?.id, finance.id);
  assert.equal(revised.departments[1]?.name, "Finance & Risk");
  assert.throws(() => upsertDepartment(revised, {
    departmentId: "department-missing", name: "Missing", mandate: "",
  }), /DEPARTMENT_NOT_FOUND/);
});

test("principal profile editing preserves opaque identity and responsibility-owned fields", () => {
  const initial = createOrganizationSetupDraft({
    companyName: "Northstar", companyPurpose: "Customer delivery",
    departmentName: "Operations", humanName: "Alex", humanTitle: "Owner",
  });
  const expanded = upsertDepartment(initial, { name: "Finance", mandate: "Own financial controls" });
  const human = expanded.humans[0]!;
  const agent = expanded.agents[0]!;
  const movedHuman = updateHumanProfile(expanded, {
    humanId: human.id, name: "Alex Chen", title: "Operations Director",
    departmentId: expanded.departments[1]!.id,
  });
  const movedAgent = updateAgentProfile(movedHuman, {
    agentId: agent.id, name: "Research Analyst", role: "Evidence-backed research",
    departmentId: expanded.departments[1]!.id,
  });

  assert.equal(movedAgent.humans[0]?.id, human.id);
  assert.equal(movedAgent.agents[0]?.id, agent.id);
  assert.equal(movedAgent.agents[0]?.accountableHumanId, agent.accountableHumanId);
  assert.equal(movedAgent.agents[0]?.runtimeConnectorId, agent.runtimeConnectorId);
  assert.equal(movedAgent.agents[0]?.autonomyLevel, agent.autonomyLevel);
  assert.throws(() => updateHumanProfile(expanded, {
    humanId: "human-missing", name: "Missing", title: "Missing",
    departmentId: expanded.departments[0]!.id,
  }), /HUMAN_NOT_FOUND/);
});
