import type { RuntimeTrace } from "./operational-risk.ts";

export type Identifier = string;

export type PrincipalKind = "HUMAN" | "SERVICE";

export interface Principal {
  readonly id: Identifier;
  readonly kind: PrincipalKind;
  readonly displayName: string;
}

export interface CompanyDomainEvent<TPayload = unknown> {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly type: string;
  readonly occurredAt: string;
  readonly actorId: Identifier;
  readonly payload: TPayload;
  readonly correlationId?: Identifier;
  readonly causationId?: Identifier;
  readonly provenance: "PRODUCTION" | "DEMO_FIXTURE";
}

export interface AgentDescriptor {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly displayName: string;
  readonly runtimeConnectorId: Identifier;
  readonly accountableHumanId: Identifier;
  readonly role: string;
  readonly autonomyLevel: number;
}

export type WorkStatus =
  | "PENDING"
  | "WORKING"
  | "WAITING"
  | "BLOCKED"
  | "AWAITING_APPROVAL"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface WorkRequest {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly agentId: Identifier;
  readonly requestedBy: Identifier;
  readonly goal: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
  readonly timeoutAt: string;
}

export interface WorkObservation {
  readonly workId: Identifier;
  readonly sequence: number;
  readonly status: WorkStatus;
  readonly summary: string;
  readonly evidenceRefs: readonly Identifier[];
  /** Admitted Connector evidence metadata; material stays in the execution environment. */
  readonly evidenceOutputs?: readonly {
    readonly evidenceReference: Identifier;
    readonly contentDigest: string;
  }[];
  /** Provider billing evidence authored by the authenticated execution node. */
  readonly usageOutputs?: readonly ConnectorUsageOutput[];
  /** Required for a successful terminal observation. */
  readonly resultReference?: Identifier | null;
  readonly approvalRequest?: {
    readonly requestId: Identifier;
    readonly action: ExactAction;
    readonly expiresAt: string;
  };
  /** Bounded execution metadata only; raw prompts, payloads, credentials and private reasoning are forbidden. */
  readonly runtimeTrace?: RuntimeTrace;
  readonly recordedAt: string;
}

export interface ConnectorUsageOutput {
  readonly usageReference: Identifier;
  readonly biller: Identifier;
  readonly billingType: "metered_api" | "subscription_included" | "subscription_overage" | "credits" | "fixed" | "unknown";
  readonly costStatus: "reported" | "unpriced";
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly costCents: number;
  readonly occurredAt: string;
}

export interface ExactAction {
  readonly id: Identifier;
  readonly type: string;
  readonly description: string;
  readonly inputDigest: string;
  readonly risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}
