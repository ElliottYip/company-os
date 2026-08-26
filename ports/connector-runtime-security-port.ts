import type { Identifier } from "../core/control-plane.ts";
import type { AgentExecutionCapabilities, RuntimeProof } from "./agent-execution-port.ts";

export interface IssueRuntimeProofCommand {
  readonly attemptId: Identifier;
  readonly connectorId: Identifier;
  readonly capabilityDigest: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

/**
 * Produces canonical capability fingerprints and short-lived, secret-free
 * control-plane attestations. Remote transport authentication remains an
 * adapter responsibility and is never embedded in a RuntimeProof.
 */
export interface ConnectorRuntimeSecurityPort {
  digestCapabilities(capabilities: AgentExecutionCapabilities): Promise<string>;
  issueRuntimeProof(command: IssueRuntimeProofCommand): Promise<RuntimeProof>;
}
