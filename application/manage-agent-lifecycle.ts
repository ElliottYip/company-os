import {
  evaluateCompanyAgentEligibility,
  transitionAgentLifecycle,
  type AgentLifecycleOperation,
  type AgentLifecycleRecord,
  type AgentLifecycleSnapshot,
} from "../core/agent-lifecycle.ts";
import type { CompanyStructure } from "../core/company-structure.ts";
import type { Identifier } from "../core/control-plane.ts";
import type { AgentLifecyclePort } from "../ports/agent-lifecycle-port.ts";
import type { AgentExecutionPort } from "../ports/agent-execution-port.ts";
import type { CompanyStructurePort } from "../ports/company-structure-port.ts";
import type { ConnectorCatalogPort } from "../ports/connector-catalog-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

export interface ManageAgentLifecycleCommand {
  readonly companyId: Identifier;
  readonly agentId: Identifier;
  readonly operation: AgentLifecycleOperation;
  readonly expectedRevision: number;
  readonly pauseReason?: AgentLifecycleRecord["pauseReason"];
}

function eligibility(
  structure: CompanyStructure,
  snapshot: AgentLifecycleSnapshot,
  agentId: Identifier,
  proposed: AgentLifecycleRecord,
) {
  const proposedSnapshot = {
    ...snapshot,
    agents: snapshot.agents.map((record) => record.agentId === agentId ? proposed : record),
  };
  const companyAgents = evaluateCompanyAgentEligibility(structure, proposedSnapshot);
  const target = companyAgents.find(({ id }) => id === agentId);
  if (!target) throw new Error("AGENT_NOT_FOUND");
  return target.eligibility;
}

export class ManageAgentLifecycle {
  readonly #identity: IdentityPort;
  readonly #structure: CompanyStructurePort;
  readonly #lifecycle: AgentLifecyclePort;
  readonly #connectors: ConnectorCatalogPort;
  readonly #executionPorts: readonly AgentExecutionPort[];
  readonly #now: () => string;

  constructor(dependencies: {
    readonly identity: IdentityPort;
    readonly structure: CompanyStructurePort;
    readonly lifecycle: AgentLifecyclePort;
    readonly connectors: ConnectorCatalogPort;
    readonly executionPorts: readonly AgentExecutionPort[];
    readonly now: () => string;
  }) {
    this.#identity = dependencies.identity;
    this.#structure = dependencies.structure;
    this.#lifecycle = dependencies.lifecycle;
    this.#connectors = dependencies.connectors;
    this.#executionPorts = dependencies.executionPorts;
    this.#now = dependencies.now;
  }

  async execute(command: ManageAgentLifecycleCommand): Promise<AgentLifecycleSnapshot> {
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== command.companyId) throw new Error("TENANT_MISMATCH");
    const [structure, snapshot] = await Promise.all([
      this.#structure.load(command.companyId),
      this.#lifecycle.load(command.companyId),
    ]);
    if (!structure) throw new Error("ORGANIZATION_NOT_FOUND");
    const agent = structure.organization.agents.find(({ id }) => id === command.agentId);
    const current = snapshot.agents.find(({ agentId }) => agentId === command.agentId);
    if (!agent || !current) throw new Error("AGENT_NOT_FOUND");
    const occurredAt = this.#now();
    const proposed = transitionAgentLifecycle(current, command.operation, occurredAt, command.pauseReason);

    if (command.operation === "APPROVE") {
      const catalog = await this.#connectors.load(command.companyId);
      const connector = catalog.connectors.find(({ id }) => id === agent.runtimeConnectorId);
      if (!connector) throw new Error("AGENT_CONNECTOR_NOT_REGISTERED");
      if (connector.status !== "ENABLED") throw new Error("AGENT_CONNECTOR_DISABLED");
      const executionPorts = await Promise.all(this.#executionPorts.map(async (port) => ({
        port,
        capabilities: await port.capabilities(),
      })));
      const execution = executionPorts.find(({ capabilities }) =>
        capabilities.connectorId === agent.runtimeConnectorId);
      if (!execution) throw new Error("AGENT_EXECUTION_PORT_NOT_REGISTERED");
      if (await execution.port.health() === "UNAVAILABLE") {
        throw new Error("AGENT_EXECUTION_PORT_UNAVAILABLE");
      }
    }
    if (command.operation === "APPROVE" || command.operation === "RESUME" || command.operation === "CLEAR_ERROR") {
      const result = eligibility(structure, snapshot, command.agentId, proposed);
      if (result.orgChainHealth.status === "invalid_org_chain") {
        throw new Error("AGENT_REPORTING_CHAIN_INVALID");
      }
    }

    const receipt = await this.#identity.authorize({
      companyId: command.companyId,
      action: command.operation === "APPROVE" ? "agent:approve" : "agent:lifecycle",
      resourceId: command.agentId,
      reason: `${command.operation} Agent lifecycle`,
    });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    return this.#lifecycle.transition({
      ...command,
      actorId: identity.actorId,
      occurredAt,
    });
  }
}
