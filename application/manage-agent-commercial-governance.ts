import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";
import {
  validateAgentCredentialStatus,
  validateAgentSubscription,
  validatePortfolioUsage,
  validateRenewalRequest,
  type AgentCredentialStatusRecord,
  type AgentSubscriptionRecord,
  type PortfolioUsageRecord,
  type RenewalRequestInput,
  type RenewalRequestRecord,
} from "../core/agent-commercial-governance.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";

export interface AgentCommercialProjection {
  readonly subscriptions: readonly AgentSubscriptionRecord[];
  readonly credentials: readonly AgentCredentialStatusRecord[];
  readonly renewals: readonly RenewalRequestRecord[];
  readonly usage: readonly PortfolioUsageRecord[];
}

export interface CommercialOutcome<T> {
  readonly status: "RECORDED" | "REPLAYED" | "UPDATED";
  readonly record: T;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

export class ManageAgentCommercialGovernance {
  readonly #events: EventDataStorePort;
  readonly #nextId: () => Identifier;

  constructor(dependencies: {
    readonly events: EventDataStorePort;
    readonly nextId: () => Identifier;
  }) {
    this.#events = dependencies.events;
    this.#nextId = dependencies.nextId;
  }

  async synchronizeSubscription(
    input: AgentSubscriptionRecord,
  ): Promise<CommercialOutcome<AgentSubscriptionRecord>> {
    const candidate = validateAgentSubscription(input);
    const current = (await this.projection(candidate.companyId)).subscriptions
      .find(({ id }) => id === candidate.id);
    return this.#synchronize(
      candidate,
      current,
      "agent-commercial.subscription-synchronized",
      "AGENT_SUBSCRIPTION",
      candidate.synchronizedAt,
    );
  }

  async recordCredentialStatus(
    input: AgentCredentialStatusRecord,
  ): Promise<CommercialOutcome<AgentCredentialStatusRecord>> {
    const candidate = validateAgentCredentialStatus(input);
    const current = (await this.projection(candidate.companyId)).credentials
      .find(({ id }) => id === candidate.id);
    return this.#synchronize(
      candidate,
      current,
      "agent-commercial.credential-status-recorded",
      "CREDENTIAL_STATUS",
      candidate.verifiedAt,
    );
  }

  async requestRenewal(
    input: RenewalRequestInput,
  ): Promise<CommercialOutcome<RenewalRequestRecord>> {
    const candidate = validateRenewalRequest(input);
    const current = (await this.projection(candidate.companyId)).renewals
      .find(({ id }) => id === candidate.id);
    if (current) {
      if (canonical(current) !== canonical(candidate)) {
        throw new Error("RENEWAL_REQUEST_REFERENCE_CONFLICT");
      }
      return { status: "REPLAYED", record: current };
    }
    await this.#append(
      candidate.companyId,
      candidate.requestedBy,
      "agent-commercial.renewal-requested",
      candidate,
      candidate.requestedAt,
      candidate.provenance,
    );
    return { status: "RECORDED", record: candidate };
  }

  async importUsage(
    input: PortfolioUsageRecord,
  ): Promise<CommercialOutcome<PortfolioUsageRecord>> {
    const candidate = validatePortfolioUsage(input);
    const current = (await this.projection(candidate.companyId)).usage.find((record) =>
      record.source.connectorId === candidate.source.connectorId &&
      record.source.externalId === candidate.source.externalId
    );
    if (current) {
      if (canonical(current) !== canonical(candidate)) {
        throw new Error("PORTFOLIO_USAGE_REFERENCE_CONFLICT");
      }
      return { status: "REPLAYED", record: current };
    }
    await this.#append(
      candidate.companyId,
      candidate.source.connectorId,
      "agent-commercial.usage-imported",
      candidate,
      candidate.recordedAt,
      candidate.provenance,
    );
    return { status: "RECORDED", record: candidate };
  }

  async projection(companyId: Identifier): Promise<AgentCommercialProjection> {
    const subscriptions = new Map<Identifier, AgentSubscriptionRecord>();
    const credentials = new Map<Identifier, AgentCredentialStatusRecord>();
    const renewals = new Map<Identifier, RenewalRequestRecord>();
    const usage = new Map<string, PortfolioUsageRecord>();
    for (const event of await this.#events.read(companyId)) {
      const record = (event.payload as { readonly record?: unknown }).record;
      if (event.type === "agent-commercial.subscription-synchronized") {
        const value = record as AgentSubscriptionRecord;
        subscriptions.set(value.id, value);
      } else if (event.type === "agent-commercial.credential-status-recorded") {
        const value = record as AgentCredentialStatusRecord;
        credentials.set(value.id, value);
      } else if (event.type === "agent-commercial.renewal-requested") {
        const value = record as RenewalRequestRecord;
        renewals.set(value.id, value);
      } else if (event.type === "agent-commercial.usage-imported") {
        const value = record as PortfolioUsageRecord;
        usage.set(`${value.source.connectorId}\u0000${value.source.externalId}`, value);
      }
    }
    return {
      subscriptions: structuredClone([...subscriptions.values()]),
      credentials: structuredClone([...credentials.values()]),
      renewals: structuredClone([...renewals.values()]),
      usage: structuredClone([...usage.values()]),
    };
  }

  async #synchronize<T extends {
    readonly companyId: Identifier;
    readonly id: Identifier;
    readonly sourceRevision: number;
    readonly provenance: CompanyDomainEvent["provenance"];
  }>(
    candidate: T,
    current: T | undefined,
    eventType: string,
    code: string,
    occurredAt: string,
  ): Promise<CommercialOutcome<T>> {
    if (current) {
      if (candidate.sourceRevision < current.sourceRevision) {
        throw new Error(`${code}_SOURCE_REVISION_STALE`);
      }
      if (candidate.sourceRevision === current.sourceRevision) {
        if (canonical(current) !== canonical(candidate)) {
          throw new Error(`${code}_SOURCE_REVISION_CONFLICT`);
        }
        return { status: "REPLAYED", record: current };
      }
    }
    await this.#append(
      candidate.companyId,
      "commercial-governance",
      eventType,
      candidate,
      occurredAt,
      candidate.provenance,
    );
    return { status: current ? "UPDATED" : "RECORDED", record: candidate };
  }

  async #append(
    companyId: Identifier,
    actorId: Identifier,
    type: string,
    record: unknown,
    occurredAt: string,
    eventProvenance: CompanyDomainEvent["provenance"],
  ): Promise<void> {
    const events = await this.#events.read(companyId);
    await this.#events.append({
      id: this.#nextId(),
      companyId,
      type,
      occurredAt,
      actorId,
      payload: { record: structuredClone(record) },
      provenance: eventProvenance,
    }, events.length);
  }
}

