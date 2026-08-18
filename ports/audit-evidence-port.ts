import type { Identifier } from "../core/control-plane.ts";

export interface EvidenceRecord {
  readonly id: Identifier;
  readonly workId: Identifier;
  readonly kind: "PLAN" | "TOOL_ACTIVITY" | "ARTIFACT" | "RESULT";
  readonly summary: string;
  readonly contentDigest: string;
  readonly recordedAt: string;
  readonly provenance: "PRODUCTION" | "DEMO_FIXTURE";
}

export interface ResponsibilityProjection {
  readonly workId: Identifier;
  readonly goalInitiatorId: Identifier;
  readonly accountableHumanId: Identifier;
  readonly executingAgentId: Identifier;
  readonly permissionReferences: readonly Identifier[];
  readonly dataAuthorizationReferences: readonly Identifier[];
  readonly approvalReferences: readonly Identifier[];
  readonly evidenceReferences: readonly Identifier[];
  readonly resultReference: Identifier | null;
}

export interface AuditEvidencePort {
  recordEvidence(record: EvidenceRecord): Promise<void>;
  projectResponsibility(workId: Identifier): Promise<ResponsibilityProjection>;
}

