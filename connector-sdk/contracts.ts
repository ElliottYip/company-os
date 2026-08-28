import type { RuntimeProof } from "../ports/agent-execution-port.ts";
import type { ConnectorOperation } from "../core/connector.ts";
import type { ExactAction } from "../core/control-plane.ts";
import type { AgentPortfolioRecord } from "../core/agent-portfolio.ts";
import type { ConnectorCapabilities } from "../core/connector-capabilities.ts";
import type { ExternalWorkInput } from "../core/cross-source-work.ts";
import type {
  AgentCredentialStatusRecord,
  AgentSubscriptionRecord,
  PortfolioUsageRecord,
} from "../core/agent-commercial-governance.ts";

export interface CapabilityDeclaration {
  readonly connectorId: string;
  readonly protocolVersion: "1.0";
  readonly operations: readonly ConnectorOperation[];
  readonly maximumTimeoutSeconds: number;
}

/** Capability declaration for inventory, observation, governance, and federation. */
export interface CapabilityDeclarationV2 {
  readonly connectorId: string;
  readonly protocolVersion: "2.0";
  readonly capabilities: ConnectorCapabilities;
  readonly maximumBatchSize: number;
}

export interface AgentInventorySynchronization {
  readonly idempotencyKey: string;
  readonly record: AgentPortfolioRecord;
}

export interface ObservedWorkRegistration {
  readonly mode: "OBSERVED";
  readonly idempotencyKey: string;
  readonly record: ExternalWorkInput;
}

export interface FederatedWorkSynchronization {
  readonly mode: "FEDERATED";
  readonly idempotencyKey: string;
  readonly record: ExternalWorkInput;
}

export interface CommercialStateSynchronization {
  readonly idempotencyKey: string;
  readonly subscription?: AgentSubscriptionRecord;
  readonly credentialStatus?: AgentCredentialStatusRecord;
  readonly usage?: PortfolioUsageRecord;
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
  /** Customer-node references only; enterprise records never cross the control-plane boundary. */
  readonly governedDataReferences?: readonly string[];
  readonly dataEvidenceReferences?: readonly string[];
  /** Opaque broker grants redeemable only by the bound execution node. */
  readonly executionGrantReferences?: readonly string[];
  /** Secret-free route plus the exact opaque Broker grant for model execution. */
  readonly modelBinding?: {
    readonly policyId: string;
    readonly routeId: string;
    readonly providerAdapterId: string;
    readonly modelReference: string;
    readonly classification: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
    readonly residency: "MANAGED_CLOUD" | "LOCAL";
    readonly executionGrantReference: string;
  };
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
  readonly action: ExactAction;
  readonly evidenceReferences: readonly string[];
  readonly resultReference: string | null;
  readonly expiresAt: string;
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
