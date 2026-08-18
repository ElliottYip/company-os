import type { CompanyWorkState } from "./company-operations.ts";
import { CompanyOperations } from "./company-operations.ts";

export class DeterministicDemoRuntime {
  readonly #operations: CompanyOperations;

  constructor(operations: CompanyOperations) {
    this.#operations = operations;
  }

  snapshot(): Promise<CompanyWorkState> {
    return this.#operations.snapshot();
  }

  assignTask(): Promise<CompanyWorkState> {
    return this.#operations.assignWork();
  }

  async advance(): Promise<CompanyWorkState> {
    const state = await this.#operations.snapshot();
    if (state.phase === "PLANNING") return this.#operations.recordPlan();
    if (state.phase === "SIMULATING_TOOL_ACTIVITY") {
      return state.events.some(({ type }) => type === "tool.activity.recorded")
        ? this.#operations.requestApproval()
        : this.#operations.recordToolActivity();
    }
    throw new Error(`DEMO_CANNOT_ADVANCE:${state.phase}`);
  }

  decide(decision: "APPROVED" | "REJECTED"): Promise<CompanyWorkState> {
    return this.#operations.decideApproval(decision);
  }

  reset(): Promise<CompanyWorkState> {
    return this.#operations.resetFixture();
  }
}

