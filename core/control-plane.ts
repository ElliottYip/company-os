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
  readonly roleId: Identifier;
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
  readonly recordedAt: string;
}

export interface ExactAction {
  readonly id: Identifier;
  readonly type: string;
  readonly description: string;
  readonly inputDigest: string;
  readonly risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

