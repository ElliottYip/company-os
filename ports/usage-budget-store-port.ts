import type { Identifier } from "../core/control-plane.ts";
import type { UsageBudgetLedger } from "../core/usage-budget.ts";

export interface UsageBudgetStorePort {
  load(companyId: Identifier): Promise<UsageBudgetLedger>;
  replace(ledger: UsageBudgetLedger, expectedRevision: number, actorId: Identifier, occurredAt: string): Promise<UsageBudgetLedger>;
}
