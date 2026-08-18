import type { OrganizationDraft } from "../../core/organization.ts";

export const DEMO_COMPANY: OrganizationDraft = Object.freeze({
  company: Object.freeze({
    id: "demo-company",
    name: "珊瑚实验室",
    purpose: "确定性 Company OS 演示公司",
    locale: "zh-CN",
  }),
  departments: Object.freeze([
    Object.freeze({ id: "operations", name: "运营部", mandate: "安全交付" }),
  ]),
  humans: Object.freeze([
    Object.freeze({
      id: "demo-boss",
      name: "林澄",
      title: "Agent Boss（演示）",
      departmentId: "operations",
      avatarId: "clay-human-placeholder",
    }),
  ]),
  agents: Object.freeze([
    Object.freeze({
      id: "demo-researcher",
      name: "市场研究员（演示）",
      role: "形成带证据的市场简报",
      departmentId: "operations",
      accountableHumanId: "demo-boss",
      runtimeConnectorId: "fixture-reference-one",
      avatarId: "fish-bumble",
      autonomyLevel: 2,
    }),
    Object.freeze({
      id: "demo-operator",
      name: "运营协作者（演示）",
      role: "模拟运营进度",
      departmentId: "operations",
      accountableHumanId: "demo-boss",
      runtimeConnectorId: "fixture-reference-two",
      avatarId: "fish-fizz",
      autonomyLevel: 1,
    }),
  ]),
});

