import type {
  AgentDescriptor,
  Identifier,
  WorkObservation,
  WorkRequest,
} from "../core/control-plane.ts";

export interface RuntimeProof {
  readonly proofId: Identifier;
  readonly connectorId: Identifier;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly digest: string;
}

export interface AgentExecutionCapabilities {
  readonly connectorId: Identifier;
  readonly displayName: string;
  readonly protocolVersion: string;
  readonly supportsPause: boolean;
  readonly supportsResume: boolean;
  readonly supportsCancellation: boolean;
  readonly supportsEvidence: boolean;
  readonly maximumTimeoutSeconds: number;
}

export interface AgentDeployment {
  readonly id: Identifier;
  readonly agentId: Identifier;
  readonly connectorId: Identifier;
  readonly externalReference?: string;
}

export interface AgentExecutionPort {
  capabilities(): Promise<AgentExecutionCapabilities>;
  health(): Promise<"HEALTHY" | "DEGRADED" | "UNAVAILABLE">;
  deploy(agent: AgentDescriptor): Promise<AgentDeployment>;
  submit(
    deployment: AgentDeployment,
    request: WorkRequest,
    proof: RuntimeProof,
  ): Promise<{ readonly accepted: true; readonly executionId: Identifier }>;
  observe(workId: Identifier): Promise<readonly WorkObservation[]>;
  pause(workId: Identifier, reason: string): Promise<void>;
  resume(workId: Identifier, approvalId: Identifier): Promise<void>;
  cancel(workId: Identifier, reason: string): Promise<void>;
}

