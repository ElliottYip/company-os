import {
  createInitialAgentRuntimeBinding,
  validateAgentRuntimeBindingSnapshot,
  type AgentRuntimeBinding,
  type AgentRuntimeBindingSnapshot,
} from "../../core/agent-runtime-binding.ts";
import { validateCompanyStructure, type CompanyStructure } from "../../core/company-structure.ts";
import type { CompanyDomainEvent, Identifier } from "../../core/control-plane.ts";
import type {
  AgentRuntimeBindingPort,
  RecordAgentRuntimeBindingCommand,
} from "../../ports/agent-runtime-binding-port.ts";
import type { EventDataStorePort } from "../../ports/event-data-store-port.ts";

function reconcileStructure(
  snapshot: AgentRuntimeBindingSnapshot,
  structure: CompanyStructure,
  occurredAt: string,
): AgentRuntimeBindingSnapshot {
  const byAgent = new Map(snapshot.bindings.map((binding) => [binding.agentId, binding]));
  const bindings: AgentRuntimeBinding[] = [];
  for (const agent of structure.organization.agents) {
    bindings.push(byAgent.get(agent.id) ?? createInitialAgentRuntimeBinding({
      companyId: structure.organization.company.id,
      agentId: agent.id,
      runtimeConnectorId: agent.runtimeConnectorId,
      occurredAt,
    }));
  }
  return validateAgentRuntimeBindingSnapshot({ revision: snapshot.revision, bindings });
}

export class EventBackedAgentRuntimeBindingStore implements AgentRuntimeBindingPort {
  readonly #events: EventDataStorePort;
  readonly #nextId: () => Identifier;

  constructor(events: EventDataStorePort, nextId: () => Identifier) {
    this.#events = events;
    this.#nextId = nextId;
  }

  async load(companyId: Identifier): Promise<AgentRuntimeBindingSnapshot> {
    const events = await this.#events.read(companyId, {
      types: ["organization.registered", "organization.revised"],
    });
    let snapshot: AgentRuntimeBindingSnapshot = { revision: 0, bindings: [] };
    for (const event of events) {
      const payload = event.payload as {
        readonly structure?: CompanyStructure;
        readonly agentRuntimeBindingSnapshot?: AgentRuntimeBindingSnapshot;
      };
      if (!payload.structure) throw new Error("ORGANIZATION_PROJECTION_CORRUPT");
      const structure = validateCompanyStructure(payload.structure);
      snapshot = payload.agentRuntimeBindingSnapshot
        ? validateAgentRuntimeBindingSnapshot(payload.agentRuntimeBindingSnapshot)
        : reconcileStructure(snapshot, structure, event.occurredAt);
    }
    return structuredClone(snapshot);
  }

  async record(command: RecordAgentRuntimeBindingCommand): Promise<AgentRuntimeBindingSnapshot> {
    const events = await this.#events.read(command.companyId);
    const current = await this.load(command.companyId);
    if (current.revision !== command.expectedSnapshotRevision ||
        command.snapshot.revision !== current.revision + 1) {
      throw new Error("AGENT_RUNTIME_BINDING_SNAPSHOT_REVISION_CONFLICT");
    }
    const snapshot = validateAgentRuntimeBindingSnapshot(command.snapshot);
    const structure = validateCompanyStructure(command.structure);
    for (const agent of structure.organization.agents) {
      const binding = snapshot.bindings.find(({ agentId }) => agentId === agent.id);
      if (!binding || binding.companyId !== command.companyId) {
        throw new Error("AGENT_RUNTIME_BINDING_SNAPSHOT_INVALID");
      }
      const currentConnectorId = binding.status === "UNBOUND" || binding.status === "REVOKED"
        ? "connector-unbound"
        : binding.connectorId;
      if (agent.runtimeConnectorId !== currentConnectorId) {
        throw new Error("AGENT_RUNTIME_BINDING_STRUCTURE_MISMATCH");
      }
    }
    const event: CompanyDomainEvent = {
      id: this.#nextId(), companyId: command.companyId, type: "organization.revised",
      occurredAt: command.occurredAt, actorId: command.actorId, provenance: "PRODUCTION",
      payload: {
        structure,
        responsibilitySnapshot: structuredClone(command.responsibilitySnapshot),
        agentRuntimeBindingSnapshot: snapshot,
        agentRuntimeBindingChange: structuredClone(command.change),
      },
    };
    await this.#events.append(event, events.length);
    return structuredClone(snapshot);
  }
}
