import type { Identifier } from "../core/control-plane.ts";
import { validateUsageBudgetLedger, type BudgetPolicy, type VerifiedCostEvent } from "../core/usage-budget.ts";
import type { CompanyStructurePort } from "../ports/company-structure-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { UsageBudgetStorePort } from "../ports/usage-budget-store-port.ts";

interface Dependencies { readonly identity: IdentityPort; readonly structure: CompanyStructurePort;
  readonly store: UsageBudgetStorePort; readonly now: () => string; }

export class ManageUsageBudget {
  readonly #dependencies: Dependencies;
  constructor(dependencies: Dependencies) { this.#dependencies = dependencies; }

  async upsertPolicy(input: { readonly companyId: Identifier; readonly policyId: Identifier;
    readonly scopeType: "company" | "agent" | "project"; readonly scopeId: Identifier;
    readonly metric?: "billed_cents"; readonly windowKind?: "calendar_month_utc" | "lifetime";
    readonly amount: number; readonly warnPercent?: number; readonly hardStopEnabled?: boolean;
    readonly notifyEnabled?: boolean; readonly isActive?: boolean; readonly expectedRevision: number }) {
    const { identity, ledger } = await this.#context(input.companyId, input.expectedRevision);
    const structure = await this.#dependencies.structure.load(input.companyId);
    if (!structure) throw new Error("COMPANY_STRUCTURE_NOT_FOUND");
    const validScope = input.scopeType === "company" ? input.scopeId === input.companyId
      : input.scopeType === "agent" ? structure.organization.agents.some(({ id }) => id === input.scopeId)
        : structure.projects.some(({ id }) => id === input.scopeId);
    if (!validScope) throw new Error("BUDGET_SCOPE_NOT_FOUND");
    const timestamp = this.#dependencies.now();
    const policy: BudgetPolicy = { id: input.policyId, companyId: input.companyId,
      scopeType: input.scopeType, scopeId: input.scopeId, metric: input.metric ?? "billed_cents",
      windowKind: input.windowKind ?? "calendar_month_utc", amount: input.amount,
      warnPercent: input.warnPercent ?? 80, hardStopEnabled: input.hardStopEnabled ?? true,
      notifyEnabled: input.notifyEnabled ?? true, isActive: input.isActive ?? true, updatedAt: timestamp };
    const matching = ledger.policies.find(({ scopeType, scopeId, metric, windowKind }) =>
      scopeType === policy.scopeType && scopeId === policy.scopeId && metric === policy.metric && windowKind === policy.windowKind);
    if (matching && matching.id !== policy.id) throw new Error("BUDGET_POLICY_SCOPE_CONFLICT");
    const next = validateUsageBudgetLedger({ ...ledger, policies: [...ledger.policies.filter(({ id }) => id !== policy.id), policy] });
    await this.#authorize(identity.actorId, input.companyId, "budgets:update", policy.id);
    return this.#dependencies.store.replace(next, input.expectedRevision, identity.actorId, timestamp);
  }

  async recordVerifiedCost(input: Omit<VerifiedCostEvent, "recordedAt"> & { readonly expectedRevision: number }) {
    const { identity, ledger } = await this.#context(input.companyId, input.expectedRevision);
    if (ledger.costEvents.some(({ id, usageReference }) => id === input.id || usageReference === input.usageReference)) return ledger;
    const structure = await this.#dependencies.structure.load(input.companyId);
    if (!structure?.organization.agents.some(({ id }) => id === input.agentId)) throw new Error("COST_AGENT_NOT_FOUND");
    const recordedAt = this.#dependencies.now();
    const next = validateUsageBudgetLedger({ ...ledger, costEvents: [...ledger.costEvents, { ...input, recordedAt }] });
    await this.#authorize(identity.actorId, input.companyId, "costs:report", input.id);
    return this.#dependencies.store.replace(next, input.expectedRevision, identity.actorId, recordedAt);
  }

  async #context(companyId: Identifier, expectedRevision: number) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("USAGE_BUDGET_INPUT_INVALID");
    const identity = await this.#dependencies.identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== companyId) throw new Error("TENANT_MISMATCH");
    const ledger = await this.#dependencies.store.load(companyId);
    if (ledger.revision !== expectedRevision) throw new Error("USAGE_BUDGET_REVISION_CONFLICT");
    return { identity, ledger };
  }
  async #authorize(actorId: Identifier, companyId: Identifier, action: string, resourceId: Identifier) {
    const receipt = await this.#dependencies.identity.authorize({ companyId, action, resourceId,
      reason: "Manage verified usage or budget policy" });
    if (receipt.principalId !== actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
  }
}
