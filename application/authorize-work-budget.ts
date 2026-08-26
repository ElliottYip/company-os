import { summarizeBudgetPolicies, type BudgetPolicySummary } from "../core/usage-budget.ts";
import type { WorkItem } from "../core/work.ts";
import type { UsageBudgetStorePort } from "../ports/usage-budget-store-port.ts";

export interface WorkBudgetAuthorization {
  readonly status: "AUTHORIZED";
  readonly applicablePolicies: readonly BudgetPolicySummary[];
}

/** Enforces persisted hard-stop policies before a new Work can be dispatched. */
export class AuthorizeWorkBudget {
  readonly #store: UsageBudgetStorePort;
  readonly #now: () => string;

  constructor(dependencies: { readonly store: UsageBudgetStorePort; readonly now: () => string }) {
    this.#store = dependencies.store;
    this.#now = dependencies.now;
  }

  async execute(work: WorkItem): Promise<WorkBudgetAuthorization> {
    const ledger = await this.#store.load(work.companyId);
    const applicablePolicies = summarizeBudgetPolicies(ledger, this.#now()).filter((policy) =>
      policy.isActive && (
        policy.scopeType === "company" && policy.scopeId === work.companyId ||
        policy.scopeType === "agent" && policy.scopeId === work.agentId ||
        policy.scopeType === "project" && work.projectId !== null && policy.scopeId === work.projectId
      ));
    if (applicablePolicies.some((policy) => policy.hardStopEnabled && policy.status === "hard_stop")) {
      throw new Error("BUDGET_HARD_STOP");
    }
    return { status: "AUTHORIZED", applicablePolicies: structuredClone(applicablePolicies) };
  }
}
