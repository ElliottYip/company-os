import type { Identifier } from "./control-plane.ts";

export type AgentRuntimeBindingStatus = "UNBOUND" | "BOUND_UNVERIFIED" | "VERIFIED" | "REVOKED";
export type AgentRuntimeBindingOperation = "BIND" | "UNBIND" | "VERIFY" | "REVOKE";

export interface AgentRuntimeBinding {
  readonly companyId: Identifier;
  readonly agentId: Identifier;
  readonly connectorId: Identifier | null;
  readonly capabilityDigest: string | null;
  readonly revision: number;
  readonly status: AgentRuntimeBindingStatus;
  readonly changedBy: Identifier | null;
  readonly reason: string | null;
  readonly changedAt: string;
}

export interface AgentRuntimeBindingSnapshot {
  readonly revision: number;
  readonly bindings: readonly AgentRuntimeBinding[];
}

export interface AgentRuntimeBindingCommand {
  readonly operation: AgentRuntimeBindingOperation;
  readonly connectorId: Identifier | null;
  readonly capabilityDigest: string | null;
  readonly expectedRevision: number;
  readonly actorId: Identifier;
  readonly reason: string;
  readonly occurredAt: string;
}

const PORTABLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;

function id(value: string, code: string): Identifier {
  const normalized = value.trim();
  if (!PORTABLE_ID.test(normalized)) throw new Error(code);
  return normalized;
}

function instant(value: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) throw new Error("AGENT_RUNTIME_BINDING_TIME_INVALID");
  return value;
}

export function validateAgentRuntimeBinding(candidate: AgentRuntimeBinding): AgentRuntimeBinding {
  if (!Number.isSafeInteger(candidate.revision) || candidate.revision < 0) {
    throw new Error("AGENT_RUNTIME_BINDING_REVISION_INVALID");
  }
  const connectorId = candidate.connectorId === null
    ? null
    : id(candidate.connectorId, "AGENT_RUNTIME_CONNECTOR_ID_INVALID");
  if ((candidate.status === "UNBOUND" && connectorId !== null) ||
      (candidate.status !== "UNBOUND" && connectorId === null) ||
      (connectorId === null && candidate.capabilityDigest !== null) ||
      (candidate.capabilityDigest !== null && !SHA256_DIGEST.test(candidate.capabilityDigest)) ||
      ((candidate.status === "VERIFIED" || candidate.status === "REVOKED") && candidate.capabilityDigest === null)) {
    throw new Error("AGENT_RUNTIME_BINDING_STATE_INVALID");
  }
  if ((candidate.changedBy === null) !== (candidate.reason === null)) {
    throw new Error("AGENT_RUNTIME_BINDING_AUDIT_INVALID");
  }
  const reason = candidate.reason?.trim() ?? null;
  if (reason !== null && (!reason || [...reason].length > 1_000)) {
    throw new Error("AGENT_RUNTIME_BINDING_REASON_INVALID");
  }
  return {
    ...candidate,
    companyId: id(candidate.companyId, "AGENT_RUNTIME_BINDING_COMPANY_ID_INVALID"),
    agentId: id(candidate.agentId, "AGENT_RUNTIME_BINDING_AGENT_ID_INVALID"),
    connectorId,
    capabilityDigest: candidate.capabilityDigest,
    changedBy: candidate.changedBy === null
      ? null
      : id(candidate.changedBy, "AGENT_RUNTIME_BINDING_ACTOR_ID_INVALID"),
    reason,
    changedAt: instant(candidate.changedAt),
  };
}

export function validateAgentRuntimeBindingSnapshot(
  candidate: AgentRuntimeBindingSnapshot,
): AgentRuntimeBindingSnapshot {
  if (!Number.isSafeInteger(candidate.revision) || candidate.revision < 0) {
    throw new Error("AGENT_RUNTIME_BINDING_SNAPSHOT_REVISION_INVALID");
  }
  const bindings = candidate.bindings.map(validateAgentRuntimeBinding);
  if (new Set(bindings.map(({ agentId }) => agentId)).size !== bindings.length ||
      bindings.some(({ revision }) => revision > candidate.revision)) {
    throw new Error("AGENT_RUNTIME_BINDING_SNAPSHOT_INVALID");
  }
  return { revision: candidate.revision, bindings };
}

export function createInitialAgentRuntimeBinding(input: {
  readonly companyId: Identifier;
  readonly agentId: Identifier;
  readonly runtimeConnectorId: Identifier;
  readonly occurredAt: string;
}): AgentRuntimeBinding {
  const unbound = input.runtimeConnectorId === "connector-unbound";
  return validateAgentRuntimeBinding({
    companyId: input.companyId,
    agentId: input.agentId,
    connectorId: unbound ? null : input.runtimeConnectorId,
    capabilityDigest: null,
    revision: 0,
    status: unbound ? "UNBOUND" : "BOUND_UNVERIFIED",
    changedBy: null,
    reason: null,
    changedAt: input.occurredAt,
  });
}

export function transitionAgentRuntimeBinding(
  current: AgentRuntimeBinding,
  command: AgentRuntimeBindingCommand,
): AgentRuntimeBinding {
  const validated = validateAgentRuntimeBinding(current);
  if (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0 ||
      command.expectedRevision !== validated.revision) {
    throw new Error("AGENT_RUNTIME_BINDING_REVISION_CONFLICT");
  }
  const actorId = id(command.actorId, "AGENT_RUNTIME_BINDING_COMMAND_INVALID");
  const reason = command.reason.trim();
  if (!reason || [...reason].length > 1_000 ||
      (command.operation === "BIND" && command.connectorId === null) ||
      (command.operation === "UNBIND" && command.connectorId !== null) ||
      (command.connectorId === null && command.capabilityDigest !== null) ||
      (command.connectorId !== null && !SHA256_DIGEST.test(command.capabilityDigest ?? "")) ||
      ((command.operation === "VERIFY" || command.operation === "REVOKE") && command.connectorId !== validated.connectorId)) {
    throw new Error("AGENT_RUNTIME_BINDING_COMMAND_INVALID");
  }
  const connectorId = command.connectorId === null
    ? null
    : id(command.connectorId, "AGENT_RUNTIME_BINDING_COMMAND_INVALID");
  if (command.operation === "BIND" && connectorId === validated.connectorId && validated.status !== "REVOKED") {
    throw new Error("AGENT_RUNTIME_BINDING_NO_CHANGE");
  }
  if ((command.operation === "VERIFY" || command.operation === "REVOKE") && validated.connectorId === null) {
    throw new Error("AGENT_RUNTIME_BINDING_COMMAND_INVALID");
  }
  const status: AgentRuntimeBindingStatus = command.operation === "BIND"
    ? "BOUND_UNVERIFIED"
    : command.operation === "UNBIND"
      ? "UNBOUND"
      : command.operation === "VERIFY"
        ? "VERIFIED"
        : "REVOKED";
  return validateAgentRuntimeBinding({
    ...validated,
    connectorId,
    capabilityDigest: command.capabilityDigest,
    revision: validated.revision + 1,
    status,
    changedBy: actorId,
    reason,
    changedAt: instant(command.occurredAt),
  });
}
