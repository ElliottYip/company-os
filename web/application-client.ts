import { createDemoComposition } from "../adapters/demo/create-demo-composition.ts";
import { DEMO_COMPANY } from "../adapters/demo/demo-company.ts";
import type { CompanyWorkState } from "../application/company-operations.ts";
import type { OrganizationDraft } from "../core/organization.ts";

export interface CompanyOSApplicationClient {
  readonly mode: "DEMO_FIXTURE" | "FORMAL";
  organization(): Promise<OrganizationDraft>;
  snapshot(): Promise<CompanyWorkState>;
  assignWork(): Promise<CompanyWorkState>;
  advanceWork(): Promise<CompanyWorkState>;
  decideApproval(decision: "APPROVED" | "REJECTED"): Promise<CompanyWorkState>;
  resetFixture(): Promise<CompanyWorkState>;
}

export function createDemoApplicationClient(): CompanyOSApplicationClient {
  const { runtime } = createDemoComposition();
  return {
    mode: "DEMO_FIXTURE",
    async organization() { return structuredClone(DEMO_COMPANY); },
    snapshot: () => runtime.snapshot(),
    assignWork: () => runtime.assignTask(),
    advanceWork: () => runtime.advance(),
    decideApproval: (decision) => runtime.decide(decision),
    resetFixture: () => runtime.reset(),
  };
}
