import type { Identifier } from "../core/control-plane.ts";
import { validateOperationalRiskRuleCatalog, type OperationalRiskRule,
  type OperationalRiskRuleCatalog } from "../core/operational-risk.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

export async function loadOperationalRiskRules(events: EventDataStorePort,
  companyId: Identifier): Promise<OperationalRiskRuleCatalog> {
  const records = await events.read(companyId, { types: ["operational-risk-rules.replaced"] });
  const latest = records.at(-1)?.payload as { catalog?: OperationalRiskRuleCatalog } | undefined;
  return latest?.catalog ? validateOperationalRiskRuleCatalog(latest.catalog) : { companyId, revision: 0, rules: [] };
}

export class OperationalRiskRuleRegistry {
  readonly #identity: IdentityPort;
  readonly #events: EventDataStorePort;
  readonly #now: () => string;
  readonly #nextId: () => Identifier;

  constructor(dependencies: { readonly identity: IdentityPort; readonly events: EventDataStorePort;
    readonly now: () => string; readonly nextId: () => Identifier }) {
    this.#identity = dependencies.identity; this.#events = dependencies.events;
    this.#now = dependencies.now; this.#nextId = dependencies.nextId;
  }

  async load(companyId: Identifier): Promise<OperationalRiskRuleCatalog> {
    const identity = await this.#authorize(companyId, "operational-risk-rules:read", "Read operational risk rules");
    const catalog = await loadOperationalRiskRules(this.#events, companyId);
    void identity;
    return catalog;
  }

  async replace(companyId: Identifier, input: { readonly expectedRevision: number;
    readonly rules: readonly OperationalRiskRule[] }): Promise<OperationalRiskRuleCatalog> {
    const identity = await this.#authorize(companyId, "operational-risk-rules:replace", "Replace operational risk rules");
    const current = await loadOperationalRiskRules(this.#events, companyId);
    if (current.revision !== input.expectedRevision) throw new Error("OPERATIONAL_RISK_RULE_REVISION_CONFLICT");
    const catalog = validateOperationalRiskRuleCatalog({ companyId, revision: current.revision + 1,
      rules: input.rules });
    const all = await this.#events.read(companyId);
    await this.#events.append({ id: this.#nextId(), companyId, type: "operational-risk-rules.replaced",
      occurredAt: this.#now(), actorId: identity.actorId, provenance: "PRODUCTION",
      payload: { catalog } }, all.length);
    return catalog;
  }

  async #authorize(companyId: Identifier, action: string, reason: string) {
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== companyId) throw new Error("TENANT_MISMATCH");
    const receipt = await this.#identity.authorize({ companyId, action, resourceId: companyId, reason });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    return identity;
  }
}
