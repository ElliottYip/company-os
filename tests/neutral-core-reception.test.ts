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

