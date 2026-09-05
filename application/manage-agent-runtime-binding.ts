import {
  transitionAgentRuntimeBinding,
  type AgentRuntimeBindingOperation,
} from "../core/agent-runtime-binding.ts";
import { validateCompanyStructure } from "../core/company-structure.ts";
import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";
import type { AgentExecutionPort } from "../ports/agent-execution-port.ts";
import type { AgentLifecyclePort } from "../ports/agent-lifecycle-port.ts";
import type { AgentRuntimeBindingPort } from "../ports/agent-runtime-binding-port.ts";
import type { CompanyStructurePort } from "../ports/company-structure-port.ts";
import type { ConnectorCatalogPort } from "../ports/connector-catalog-port.ts";
import type { ConnectorRuntimeSecurityPort } from "../ports/connector-runtime-security-port.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { ResponsibilityContractPort } from "../ports/responsibility-contract-port.ts";

export interface ManageAgentRuntimeBindingInput {
  readonly companyId: Identifier;
  readonly agentId: Identifier;
  readonly operation: Extract<AgentRuntimeBindingOperation, "BIND" | "UNBIND">;
  readonly connectorId: Identifier | null;
  readonly expectedRevision: number;
  readonly reason: string;
}

interface Dependencies {
  readonly identity: IdentityPort;
  readonly events: EventDataStorePort;
  readonly structure: CompanyStructurePort;
  readonly lifecycle: AgentLifecyclePort;
  readonly connectors: ConnectorCatalogPort;
  readonly responsibilities: ResponsibilityContractPort;
  readonly bindings: AgentRuntimeBindingPort;
  readonly executionPorts: readonly AgentExecutionPort[];
  readonly runtimeSecurity: ConnectorRuntimeSecurityPort;
  readonly now: () => string;
}

function assertNoActiveWork(events: readonly CompanyDomainEvent[], agentId: Identifier): void {
  const workAgents = new Map<Identifier, Identifier>();
  const latestAttempts = new Map<Identifier, { readonly workId: Identifier; readonly status: string }>();
  for (const event of events) {
    if (event.type === "work.dispatched") {
      const work = (event.payload as { work?: { id?: Identifier; agentId?: Identifier } }).work;
      if (work?.id && work.agentId) workAgents.set(work.id, work.agentId);
    }
    if (event.type === "work-attempt.recorded") {
      const attempt = (event.payload as { attempt?: { id?: Identifier; workId?: Identifier; status?: string } }).attempt;
      if (attempt?.id && attempt.workId && attempt.status) {
        latestAttempts.set(attempt.id, { workId: attempt.workId, status: attempt.status });
      }
    }
  }
  const terminal = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"]);
  if ([...latestAttempts.values()].some((attempt) =>
    workAgents.get(attempt.workId) === agentId && !terminal.has(attempt.status))) {
    throw new Error("AGENT_RUNTIME_BINDING_ACTIVE_WORK");
  }
}

export class ManageAgentRuntimeBinding {
  readonly #dependencies: Dependencies;

  constructor(dependencies: Dependencies) {
    this.#dependencies = dependencies;
  }

  async execute(input: ManageAgentRuntimeBindingInput) {
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 ||
        !["BIND", "UNBIND"].includes(input.operation)) {
      throw new Error("AGENT_RUNTIME_BINDING_INPUT_INVALID");
    }
    const identity = await this.#dependencies.identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== input.companyId) throw new Error("TENANT_MISMATCH");
    const [structure, lifecycle, catalog, bindingSnapshot, responsibilitySnapshot, events] = await Promise.all([
      this.#dependencies.structure.load(input.companyId),
      this.#dependencies.lifecycle.load(input.companyId),
      this.#dependencies.connectors.load(input.companyId),
      this.#dependencies.bindings.load(input.companyId),
      this.#dependencies.responsibilities.load(input.companyId),
      this.#dependencies.events.read(input.companyId),
    ]);
    if (!structure) throw new Error("ORGANIZATION_NOT_FOUND");
    const agent = structure.organization.agents.find(({ id }) => id === input.agentId);
    const current = bindingSnapshot.bindings.find(({ agentId }) => agentId === input.agentId);
    const lifecycleRecord = lifecycle.agents.find(({ agentId }) => agentId === input.agentId);
    if (!agent || !current || !lifecycleRecord) throw new Error("AGENT_NOT_FOUND");
    if (lifecycleRecord.status === "terminated") throw new Error("AGENT_TERMINATED");
    if (current.connectorId !== null || input.operation === "UNBIND") assertNoActiveWork(events, input.agentId);

    let capabilityDigest: string | null = null;
    if (input.operation === "BIND") {
      const connector = catalog.connectors.find(({ id }) => id === input.connectorId);
      if (!connector) throw new Error("AGENT_CONNECTOR_NOT_REGISTERED");
      if (connector.status !== "ENABLED") throw new Error("AGENT_CONNECTOR_DISABLED");
      let selected: { readonly port: AgentExecutionPort; readonly capabilities: Awaited<ReturnType<AgentExecutionPort["capabilities"]>> } | null = null;
      for (const port of this.#dependencies.executionPorts) {
        const capabilities = await port.capabilities();
        if (capabilities.connectorId === input.connectorId) selected = { port, capabilities };
      }
      if (!selected) throw new Error("AGENT_EXECUTION_PORT_NOT_REGISTERED");
      if (await selected.port.health() === "UNAVAILABLE") throw new Error("AGENT_EXECUTION_PORT_UNAVAILABLE");
      capabilityDigest = await this.#dependencies.runtimeSecurity.digestCapabilities(selected.capabilities);
    }
    const occurredAt = this.#dependencies.now();
    const binding = transitionAgentRuntimeBinding(current, {
      operation: input.operation,
      connectorId: input.connectorId,
      capabilityDigest,
      expectedRevision: input.expectedRevision,
      actorId: identity.actorId,
      reason: input.reason,
      occurredAt,
    });
    const organization = {
      ...structure.organization,
      agents: structure.organization.agents.map((candidate) => candidate.id === input.agentId
        ? { ...candidate, runtimeConnectorId: binding.connectorId ?? "connector-unbound" }
        : candidate),
    };
    const nextStructure = validateCompanyStructure({ ...structure, organization });
    const receipt = await this.#dependencies.identity.authorize({
      companyId: input.companyId,
      action: input.operation === "BIND" ? "agent:bind_runtime" : "agent:unbind_runtime",
      resourceId: input.agentId,
      reason: input.reason.trim(),
    });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    const snapshot = {
      revision: bindingSnapshot.revision + 1,
      bindings: bindingSnapshot.bindings.map((candidate) => candidate.agentId === input.agentId
        ? binding : candidate),
    };
    await this.#dependencies.bindings.record({
      companyId: input.companyId,
      actorId: identity.actorId,
      occurredAt,
      expectedSnapshotRevision: bindingSnapshot.revision,
      structure: nextStructure,
      responsibilitySnapshot,
      snapshot,
      change: binding,
    });
    return { binding: structuredClone(binding), organization: structuredClone(organization) };
  }
}
