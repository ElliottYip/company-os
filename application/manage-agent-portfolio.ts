import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";
import {
  validateAgentPortfolioRecord,
  type AgentPortfolioRecord,
} from "../core/agent-portfolio.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

export interface AgentPortfolioOutcome {
  readonly status: "RECORDED" | "REPLAYED" | "UPDATED";
  readonly record: AgentPortfolioRecord;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

/** Formal, provider-neutral portfolio registry. Execution remains with the declared owner. */
export class ManageAgentPortfolio {
  readonly #identity: IdentityPort;
  readonly #events: EventDataStorePort;
  readonly #nextId: () => Identifier;

  constructor(dependencies: {
    readonly identity: IdentityPort;
    readonly events: EventDataStorePort;
    readonly nextId: () => Identifier;
  }) {
    this.#identity = dependencies.identity;
    this.#events = dependencies.events;
    this.#nextId = dependencies.nextId;
  }

  async synchronize(input: AgentPortfolioRecord): Promise<AgentPortfolioOutcome> {
    const candidate = validateAgentPortfolioRecord(input);
    const identity = await this.#formalIdentity(candidate.companyId);
    const current = (await this.#records(candidate.companyId)).get(candidate.id);
    if (current) {
      const currentTime = current.synchronizedAt ? Date.parse(current.synchronizedAt) : 0;
      const candidateTime = candidate.synchronizedAt ? Date.parse(candidate.synchronizedAt) : 0;
      if (candidateTime < currentTime) throw new Error("AGENT_PORTFOLIO_SOURCE_STATE_STALE");
      if (candidateTime === currentTime) {
        if (canonical(candidate) !== canonical(current)) {
          throw new Error("AGENT_PORTFOLIO_SOURCE_STATE_CONFLICT");
        }
        return { status: "REPLAYED", record: current };
      }
    }
    const receipt = await this.#identity.authorize({
      companyId: candidate.companyId,
      action: "agent-portfolio:synchronize",
      resourceId: candidate.id,
      reason: "Synchronize a bounded Agent Portfolio record",
    });
    if (receipt.principalId !== identity.actorId) {
      throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    }
    const existing = await this.#events.read(candidate.companyId);
    const occurredAt = candidate.synchronizedAt ?? receipt.authorizedAt;
    const event: CompanyDomainEvent = {
      id: this.#nextId(),
      companyId: candidate.companyId,
      type: "agent-portfolio.synchronized",
      occurredAt,
      actorId: identity.actorId,
      payload: { record: structuredClone(candidate) },
      correlationId: candidate.id,
      provenance: "PRODUCTION",
    };
    await this.#events.append(event, existing.length);
    return { status: current ? "UPDATED" : "RECORDED", record: candidate };
  }

  async list(companyId: Identifier): Promise<readonly AgentPortfolioRecord[]> {
    await this.#formalIdentity(companyId);
    return [...(await this.#records(companyId)).values()].map((record) => structuredClone(record));
  }

  async #records(companyId: Identifier): Promise<Map<Identifier, AgentPortfolioRecord>> {
    const records = new Map<Identifier, AgentPortfolioRecord>();
    for (const event of await this.#events.read(companyId, { types: ["agent-portfolio.synchronized"] })) {
      const record = (event.payload as { readonly record?: AgentPortfolioRecord }).record;
      if (record?.companyId === companyId) records.set(record.id, record);
    }
    return records;
  }

  async #formalIdentity(companyId: Identifier) {
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== companyId) throw new Error("TENANT_MISMATCH");
    return identity;
  }
}
