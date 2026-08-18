import type { ExactAction, Identifier } from "../core/control-plane.ts";

export interface ApprovalBinding {
  readonly action: ExactAction;
  readonly workId: Identifier;
  readonly responsibilityContractId: Identifier;
  readonly executingAgentId: Identifier;
  readonly accountableHumanId: Identifier;
  readonly evidenceReferences: readonly Identifier[];
  readonly resultReference: Identifier | null;
}

export interface ApprovalRequest {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly binding: ApprovalBinding;
  readonly requestedAt: string;
  readonly expiresAt: string;
  readonly status: "AWAITING_APPROVAL";
}

export interface ApprovalDecision {
  readonly requestId: Identifier;
  readonly decision: "APPROVED" | "REJECTED";
  readonly decidedBy: Identifier;
  readonly decidedAt: string;
  readonly note?: string;
}

export interface ApprovalPublicationPort {
  publishRequest(input: ApprovalRequest): Promise<void>;
  pending(companyId: Identifier): Promise<readonly ApprovalRequest[]>;
  publishDecision(decision: ApprovalDecision): Promise<void>;
  decision(requestId: Identifier): Promise<ApprovalDecision | null>;
}

