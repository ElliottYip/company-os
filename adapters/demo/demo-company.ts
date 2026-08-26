import type { OrganizationDraft } from "../../core/organization.ts";

export const DEMO_COMPANY: OrganizationDraft = Object.freeze({
  company: Object.freeze({
    id: "demo-company",
    name: "Coral Lab",
    purpose: "Deterministic Company OS demo company",
    locale: "en",
  }),
  departments: Object.freeze([
    Object.freeze({ id: "operations", name: "Operations", mandate: "Safe delivery" }),
  ]),
  humans: Object.freeze([
    Object.freeze({
      id: "demo-boss",
      name: "Lin Cheng",
      title: "Agent Boss (demo)",
      departmentId: "operations",
      avatarId: "clay-human-placeholder",
    }),
    Object.freeze({
      id: "demo-product-boss",
      name: "Lu Yao",
      title: "Product Lead (demo)",
      departmentId: "operations",
      avatarId: "clay-human-product",
    }),
    Object.freeze({
      id: "demo-finance-boss",
      name: "Zhou Ning",
      title: "Finance Lead (demo)",
      departmentId: "operations",
      avatarId: "clay-human-finance",
    }),
  ]),
  agents: Object.freeze([
    Object.freeze({
      id: "demo-researcher",
      name: "Market Researcher (demo)",
      role: "Create evidence-backed market briefs",
      departmentId: "operations",
      accountableHumanId: "demo-boss",
      runtimeConnectorId: "fixture-reference-one",
      avatarId: "fish-bumble",
      autonomyLevel: 2,
    }),
    Object.freeze({
      id: "demo-operator",
      name: "Operations Partner (demo)",
      role: "Simulate operational progress",
      departmentId: "operations",
      accountableHumanId: "demo-boss",
      runtimeConnectorId: "fixture-reference-two",
      avatarId: "fish-fizz",
      autonomyLevel: 1,
    }),
  ]),
});
