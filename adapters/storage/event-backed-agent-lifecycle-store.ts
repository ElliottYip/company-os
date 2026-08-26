import type { CompanyStructure } from "../../core/company-structure.ts";
import type { CompanyDomainEvent, Identifier } from "../../core/control-plane.ts";
import {
  transitionAgentLifecycle,
  type AgentLifecycleRecord,
  type AgentLifecycleSnapshot,
} from "../../core/agent-lifecycle.ts";
import type {
  AgentLifecyclePort,
  TransitionAgentLifecycleCommand,
} from "../../ports/agent-lifecycle-port.ts";
import type { EventDataStorePort } from "../../ports/event-data-store-port.ts";

const EVENT_TYPE = "agent.lifecycle.changed";

function structureAgents(event: CompanyDomainEvent): readonly { companyId: Identifier; agentId: Identifier }[] {
  if (event.type !== "organization.registered" && event.type !== "organization.revised") return [];
  const structure = (event.payload as { readonly structure?: CompanyStructure }).structure;
  if (!structure) throw new Error("ORGANIZATION_PROJECTION_CORRUPT");
  return structure.organization.agents.map(({ id }) => ({
    companyId: structure.organization.company.id,
    agentId: id,
  }));
}

export class EventBackedAgentLifecycleStore implements AgentLifecyclePort {
  readonly #events: EventDataStorePort;
  readonly #nextId: () => Identifier;

  constructor(events: EventDataStorePort, nextId: () => Identifier) {
    this.#events = events;
    this.#nextId = nextId;
  }

  async load(companyId: Identifier): Promise<AgentLifecycleSnapshot> {
    const events = await this.#events.read(companyId);
    let revision = 0;
    const records = new Map<Identifier, AgentLifecycleRecord>();
    for (const event of events) {
      for (const agent of structureAgents(event)) {
        if (!records.has(agent.agentId)) records.set(agent.agentId, {
          companyId: agent.companyId,
          agentId: agent.agentId,
          status: "pending_approval",
          pauseReason: null,
          pausedAt: null,
          errorCode: null,
          updatedAt: event.occurredAt,
        });
      }
      if (event.type === EVENT_TYPE) {
        const payload = event.payload as Partial<AgentLifecycleSnapshot>;
        if (!Number.isSafeInteger(payload.revision) || !Array.isArray(payload.agents)) {
          throw new Error("AGENT_LIFECYCLE_PROJECTION_CORRUPT");
        }
        revision = payload.revision as number;
        records.clear();
        for (const record of payload.agents) records.set(record.agentId, structuredClone(record));
      }
    }
    return { revision, agents: [...records.values()].map((record) => structuredClone(record)) };
  }

  async transition(command: TransitionAgentLifecycleCommand): Promise<AgentLifecycleSnapshot> {
    const events = await this.#events.read(command.companyId);
    const current = await this.load(command.companyId);
    if (current.revision !== command.expectedRevision) throw new Error("AGENT_LIFECYCLE_REVISION_CONFLICT");
    const record = current.agents.find(({ agentId }) => agentId === command.agentId);
    if (!record) throw new Error("AGENT_NOT_FOUND");
    const nextRecord = transitionAgentLifecycle(
      record,
      command.operation,
      command.occurredAt,
      command.pauseReason,
    );
    const snapshot: AgentLifecycleSnapshot = {
      revision: current.revision + 1,
      agents: current.agents.map((candidate) =>
        candidate.agentId === command.agentId ? nextRecord : structuredClone(candidate)),
    };
    await this.#events.append({
      id: this.#nextId(),
      companyId: command.companyId,
      type: EVENT_TYPE,
      occurredAt: command.occurredAt,
      actorId: command.actorId,
      payload: snapshot,
      provenance: "PRODUCTION",
    }, events.length);
    return structuredClone(snapshot);
  }
}
