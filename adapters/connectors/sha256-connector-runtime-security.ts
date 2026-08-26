import { createHash } from "node:crypto";
import type { AgentExecutionCapabilities } from "../../ports/agent-execution-port.ts";
import type {
  ConnectorRuntimeSecurityPort,
  IssueRuntimeProofCommand,
} from "../../ports/connector-runtime-security-port.ts";

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function instant(value: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error("RUNTIME_PROOF_TIME_INVALID");
  return value;
}

export class Sha256ConnectorRuntimeSecurity implements ConnectorRuntimeSecurityPort {
  async digestCapabilities(capabilities: AgentExecutionCapabilities): Promise<string> {
    return sha256({
      schemaVersion: 1,
      connectorId: capabilities.connectorId,
      protocolVersion: capabilities.protocolVersion,
      supportsPause: capabilities.supportsPause,
      supportsResume: capabilities.supportsResume,
      supportsCancellation: capabilities.supportsCancellation,
      supportsEvidence: capabilities.supportsEvidence,
      maximumTimeoutSeconds: capabilities.maximumTimeoutSeconds,
    });
  }

  async issueRuntimeProof(command: IssueRuntimeProofCommand) {
    const issuedAt = instant(command.issuedAt);
    const expiresAt = instant(command.expiresAt);
    if (Date.parse(expiresAt) <= Date.parse(issuedAt)) throw new Error("RUNTIME_PROOF_TIME_INVALID");
    const digest = sha256({ schemaVersion: 1, ...command, issuedAt, expiresAt });
    return {
      proofId: `proof-${digest.slice("sha256:".length, "sha256:".length + 32)}`,
      connectorId: command.connectorId,
      issuedAt,
      expiresAt,
      digest,
    };
  }
}
