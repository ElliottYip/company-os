import type { RuntimeProof } from "../ports/agent-execution-port.ts";

export interface CapabilityDeclaration {
  readonly connectorId: string;
  readonly protocolVersion: "1.0";
  readonly operations: readonly (
    | "SUBMIT"
    | "PROGRESS"
    | "PAUSE"
    | "RESUME"
    | "CANCEL"
    | "EVIDENCE"
    | "RESULT"
  )[];
  readonly maximumTimeoutSeconds: number;
}

export interface IdentityBinding {
  readonly connectorId: string;
  readonly agentId: string;
  readonly externalPrincipalReference: string;
  readonly boundAt: string;
}

export interface TaskInput {
  readonly workId: string;
  readonly goalReference: string;
  readonly permissionReferences: readonly string[];
  readonly dataAuthorizationReferences: readonly string[];
  readonly idempotencyKey: string;
  readonly timeoutAt: string;
}

export interface TaskProgress {
  readonly workId: string;
  readonly sequence: number;
  readonly state: "WORKING" | "WAITING" | "BLOCKED" | "AWAITING_APPROVAL";
  readonly summary: string;
}

export interface ApprovalPause {
  readonly workId: string;
  readonly approvalRequestId: string;
  readonly actionDigest: string;
}

export interface EvidenceOutput {
  readonly workId: string;
  readonly evidenceReference: string;
  readonly contentDigest: string;
}

export interface TaskResult {
  readonly workId: string;
  readonly resultReference: string;
  readonly evidenceReferences: readonly string[];
  readonly status: "COMPLETED" | "FAILED" | "CANCELLED";
}

export interface ConnectorRuntimeProof extends RuntimeProof {}

