import type { Identifier } from "./control-plane.ts";
import type { CompanyStructure } from "./company-structure.ts";

export const AGENT_LIFECYCLE_STATUSES = [
  "active", "paused", "idle", "running", "error", "pending_approval", "terminated",
] as const;
export type AgentLifecycleStatus = typeof AGENT_LIFECYCLE_STATUSES[number];
export type AgentLifecycleOperation = "APPROVE" | "PAUSE" | "RESUME" | "CLEAR_ERROR" | "TERMINATE";

export interface AgentLifecycleRecord {
  readonly companyId: Identifier;
  readonly agentId: Identifier;
  readonly status: AgentLifecycleStatus;
  readonly pauseReason: "manual" | "budget" | "system" | null;
  readonly pausedAt: string | null;
  readonly errorCode: string | null;
  readonly updatedAt: string;
}

export interface AgentLifecycleSnapshot {
  readonly revision: number;
  readonly agents: readonly AgentLifecycleRecord[];
}

export interface AgentEligibilityInput {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly name: string;
  readonly status: string;
  readonly reportsToAgentId: Identifier | null;
}

export interface AgentWorkEligibility {
  readonly assignable: boolean;
  readonly invokable: boolean;
  readonly assignabilityReason: "eligible" | "terminated" | "pending_approval" | "invalid_org_chain" | "unknown_status";
  readonly invokabilityReason: "eligible" | "terminated" | "pending_approval" | "paused" | "invalid_org_chain" | "unknown_status";
  readonly orgChainHealth: {
    readonly status: "healthy" | "invalid_org_chain";
    readonly reason: "healthy" | "terminated_ancestor" | "missing_manager" | "cycle";
    readonly firstInvalidAgentId: Identifier | null;
    readonly pausedAncestorIds: readonly Identifier[];
  };
}

const ASSIGNABLE = new Set(["active", "paused", "idle", "running", "error"]);
const INVOKABLE = new Set(["active", "idle", "running", "error"]);

function lifecycleReason(status: string): "terminated" | "pending_approval" | "unknown_status" {
  if (status === "terminated") return "terminated";
  if (status === "pending_approval") return "pending_approval";
  return "unknown_status";
}

export function evaluateAgentWorkEligibility(
  agent: AgentEligibilityInput,
  companyAgents: readonly AgentEligibilityInput[],
): AgentWorkEligibility {
  const byId = new Map(companyAgents.map((candidate) => [candidate.id, candidate]));
  const seen = new Set<Identifier>([agent.id]);
  const pausedAncestorIds: Identifier[] = [];
  let current = agent;
  let chainReason: AgentWorkEligibility["orgChainHealth"]["reason"] = "healthy";
  let firstInvalidAgentId: Identifier | null = null;
  while (current.reportsToAgentId) {
    const managerId = current.reportsToAgentId;
    if (seen.has(managerId)) {
      chainReason = "cycle";
      firstInvalidAgentId = managerId;
      break;
    }
    seen.add(managerId);
    const manager = byId.get(managerId);
    if (!manager || manager.companyId !== agent.companyId) {
      chainReason = "missing_manager";
      firstInvalidAgentId = managerId;
      break;
    }
    if (manager.status === "terminated" && !firstInvalidAgentId) {
      chainReason = "terminated_ancestor";
      firstInvalidAgentId = manager.id;
    }
    if (manager.status === "paused") pausedAncestorIds.push(manager.id);
    current = manager;
  }
  const invalidChain = chainReason !== "healthy";
  const statusAssignable = ASSIGNABLE.has(agent.status);
  const statusInvokable = INVOKABLE.has(agent.status);
  const assignabilityReason = !statusAssignable
    ? lifecycleReason(agent.status)
    : invalidChain ? "invalid_org_chain" : "eligible";
  const invokabilityReason = !statusInvokable
    ? agent.status === "paused" ? "paused" : lifecycleReason(agent.status)
    : invalidChain ? "invalid_org_chain" : "eligible";
  return {
    assignable: assignabilityReason === "eligible",
    invokable: invokabilityReason === "eligible",
    assignabilityReason,
    invokabilityReason,
    orgChainHealth: {
      status: invalidChain ? "invalid_org_chain" : "healthy",
      reason: chainReason,
      firstInvalidAgentId,
      pausedAncestorIds,
    },
  };
}

export function evaluateCompanyAgentEligibility(
  structure: CompanyStructure,
  snapshot: AgentLifecycleSnapshot,
): readonly (AgentEligibilityInput & { readonly eligibility: AgentWorkEligibility })[] {
  const positionByPrincipal = new Map(structure.positions.map((position) => [position.principalId, position]));
  const positionById = new Map(structure.positions.map((position) => [position.id, position]));
  const managerBySubordinate = new Map(
    structure.reportingLines.map((line) => [line.subordinatePositionId, line.managerPositionId]),
  );
  const agentIds = new Set(structure.organization.agents.map(({ id }) => id));
  const agents = structure.organization.agents.map((agent) => {
    const position = positionByPrincipal.get(agent.id);
    const managerPositionId = position ? managerBySubordinate.get(position.id) : undefined;
    const managerPrincipalId = managerPositionId ? positionById.get(managerPositionId)?.principalId : undefined;
    return {
      id: agent.id,
      companyId: structure.organization.company.id,
      name: agent.name,
      status: snapshot.agents.find(({ agentId }) => agentId === agent.id)?.status ?? "pending_approval",
      reportsToAgentId: managerPrincipalId && agentIds.has(managerPrincipalId) ? managerPrincipalId : null,
    };
  });
  return agents.map((agent) => ({
    ...agent,
    eligibility: evaluateAgentWorkEligibility(agent, agents),
  }));
}

export function transitionAgentLifecycle(
  current: AgentLifecycleRecord,
  operation: AgentLifecycleOperation,
  occurredAt: string,
  pauseReason: AgentLifecycleRecord["pauseReason"] = "manual",
): AgentLifecycleRecord {
  if (!Number.isFinite(Date.parse(occurredAt))) throw new Error("AGENT_LIFECYCLE_TIME_INVALID");
  if (current.status === "terminated") throw new Error("AGENT_TERMINATED");
  if (operation === "APPROVE") {
    if (current.status !== "pending_approval") throw new Error("AGENT_NOT_PENDING_APPROVAL");
    return { ...current, status: "idle", pauseReason: null, pausedAt: null, errorCode: null, updatedAt: occurredAt };
  }
  if (operation === "PAUSE") {
    if (current.status === "pending_approval") throw new Error("AGENT_PENDING_APPROVAL");
    if (!pauseReason) throw new Error("AGENT_PAUSE_REASON_REQUIRED");
    return { ...current, status: "paused", pauseReason, pausedAt: occurredAt, errorCode: null, updatedAt: occurredAt };
  }
  if (operation === "RESUME") {
    if (current.status === "pending_approval") throw new Error("AGENT_PENDING_APPROVAL");
    if (current.status !== "paused") throw new Error("AGENT_NOT_PAUSED");
    return { ...current, status: "idle", pauseReason: null, pausedAt: null, errorCode: null, updatedAt: occurredAt };
  }
  if (operation === "CLEAR_ERROR") {
    if (current.status === "pending_approval") throw new Error("AGENT_PENDING_APPROVAL");
    if (current.status !== "error") throw new Error("AGENT_NOT_IN_ERROR");
    return { ...current, status: "idle", pauseReason: null, pausedAt: null, errorCode: null, updatedAt: occurredAt };
  }
  return { ...current, status: "terminated", pauseReason: null, pausedAt: null, errorCode: null, updatedAt: occurredAt };
}
