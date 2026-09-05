import type { Identifier } from "./control-plane.ts";

export type AiAssetType = "AGENT" | "MODEL" | "PROMPT" | "DATASET" | "TOOL" | "MCP_SERVER" |
  "WORKFLOW" | "KNOWLEDGE_BASE";
export type AiAssetSourceType = "MANUAL" | "CONNECTOR" | "TRACE" | "IMPORT" | "FEDERATED";
export type AiAssetGovernanceDepth = "UNMANAGED" | "OBSERVED" | "GOVERNED" | "FEDERATED";
export type AiAssetLifecycle = "DISCOVERED" | "REVIEW" | "APPROVED" | "ACTIVE" | "PAUSED" | "RETIRED";

export interface AiAsset {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly type: AiAssetType;
  readonly name: string;
  readonly provider: string | null;
  readonly ownerHumanId: Identifier | null;
  readonly departmentId: Identifier | null;
  readonly purpose: string;
  readonly goalIds: readonly Identifier[];
  readonly projectIds: readonly Identifier[];
  readonly environment: "DEVELOPMENT" | "TEST" | "PRODUCTION";
  readonly version: string;
  readonly source: { readonly type: AiAssetSourceType; readonly referenceId: Identifier;
    readonly observedAt: string };
  readonly riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "NOT_ASSESSED";
  readonly lifecycle: AiAssetLifecycle;
  readonly governanceDepth: AiAssetGovernanceDepth;
  readonly canonicalAssetId: Identifier | null;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type AiAssetRelationshipType = "USES" | "CALLS" | "TRAINS" | "EVALUATES" | "READS" |
  "WRITES" | "DEPENDS_ON" | "DEPLOYED_ON" | "SYNCED_FROM";
export interface AiAssetRelationship {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly fromAssetId: Identifier;
  readonly toAssetId: Identifier;
  readonly type: AiAssetRelationshipType;
  readonly evidenceReference: Identifier;
  readonly observedAt: string;
}

export interface ShadowAiReview {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly assetId: Identifier;
  readonly status: "NEEDS_OWNER" | "UNDER_REVIEW" | "ADMITTED" | "REJECTED";
  readonly assignedHumanId: Identifier | null;
  readonly reason: string | null;
  readonly revision: number;
  readonly openedAt: string;
  readonly updatedAt: string;
}

export interface DuplicateAssetReview {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly candidateAssetIds: readonly Identifier[];
  readonly canonicalAssetId: Identifier | null;
  readonly status: "OPEN" | "MERGED" | "DISMISSED";
  readonly evidenceReferences: readonly Identifier[];
  readonly decisionReason: string | null;
  readonly revision: number;
  readonly openedAt: string;
  readonly updatedAt: string;
}

export interface AiAssetGraph {
  readonly companyId: Identifier;
  readonly revision: number;
  readonly assets: readonly AiAsset[];
  readonly relationships: readonly AiAssetRelationship[];
  readonly shadowReviews: readonly ShadowAiReview[];
  readonly duplicateReviews: readonly DuplicateAssetReview[];
}

const ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const TYPES = new Set<AiAssetType>(["AGENT", "MODEL", "PROMPT", "DATASET", "TOOL", "MCP_SERVER", "WORKFLOW", "KNOWLEDGE_BASE"]);
const SOURCES = new Set<AiAssetSourceType>(["MANUAL", "CONNECTOR", "TRACE", "IMPORT", "FEDERATED"]);
const DEPTHS = new Set<AiAssetGovernanceDepth>(["UNMANAGED", "OBSERVED", "GOVERNED", "FEDERATED"]);
const LIFECYCLES = new Set<AiAssetLifecycle>(["DISCOVERED", "REVIEW", "APPROVED", "ACTIVE", "PAUSED", "RETIRED"]);
const RELATIONSHIPS = new Set<AiAssetRelationshipType>(["USES", "CALLS", "TRAINS", "EVALUATES", "READS", "WRITES", "DEPENDS_ON", "DEPLOYED_ON", "SYNCED_FROM"]);

function id(value: string, code: string): Identifier { if (!ID.test(value)) throw new Error(code); return value; }
function text(value: string, maximum: number, code: string): string {
  const normalized = value.trim(); if (!normalized || [...normalized].length > maximum) throw new Error(code); return normalized;
}
function instant(value: string, code: string): string { if (!Number.isFinite(Date.parse(value))) throw new Error(code); return value; }

export function validateAiAssetGraph(value: AiAssetGraph): AiAssetGraph {
  id(value.companyId, "AI_ASSET_COMPANY_INVALID");
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error("AI_ASSET_REVISION_INVALID");
  if (value.assets.length > 10_000 || value.relationships.length > 50_000 || value.shadowReviews.length > 10_000 ||
      value.duplicateReviews.length > 10_000) throw new Error("AI_ASSET_GRAPH_LIMIT_EXCEEDED");
  const assetIds = new Set<string>();
  const assets = value.assets.map((asset) => {
    if (asset.companyId !== value.companyId || assetIds.has(asset.id)) throw new Error("AI_ASSET_TENANT_OR_ID_INVALID");
    assetIds.add(id(asset.id, "AI_ASSET_ID_INVALID"));
    if (!TYPES.has(asset.type) || !SOURCES.has(asset.source.type) || !DEPTHS.has(asset.governanceDepth) ||
        !LIFECYCLES.has(asset.lifecycle) || !["DEVELOPMENT", "TEST", "PRODUCTION"].includes(asset.environment) ||
        !["LOW", "MEDIUM", "HIGH", "CRITICAL", "NOT_ASSESSED"].includes(asset.riskLevel) ||
        !Number.isSafeInteger(asset.revision) || asset.revision < 0) throw new Error("AI_ASSET_FIELD_INVALID");
    if ((asset.governanceDepth === "UNMANAGED") !== (asset.ownerHumanId === null)) {
      throw new Error("AI_ASSET_OWNER_GOVERNANCE_MISMATCH");
    }
    if (new Set(asset.goalIds).size !== asset.goalIds.length || new Set(asset.projectIds).size !== asset.projectIds.length) {
      throw new Error("AI_ASSET_PLANNING_LINK_DUPLICATE");
    }
    return { ...asset, name: text(asset.name, 160, "AI_ASSET_NAME_INVALID"),
      provider: asset.provider === null ? null : text(asset.provider, 160, "AI_ASSET_PROVIDER_INVALID"),
      ownerHumanId: asset.ownerHumanId === null ? null : id(asset.ownerHumanId, "AI_ASSET_OWNER_INVALID"),
      departmentId: asset.departmentId === null ? null : id(asset.departmentId, "AI_ASSET_DEPARTMENT_INVALID"),
      purpose: text(asset.purpose, 2_000, "AI_ASSET_PURPOSE_INVALID"),
      goalIds: asset.goalIds.map((item) => id(item, "AI_ASSET_GOAL_INVALID")),
      projectIds: asset.projectIds.map((item) => id(item, "AI_ASSET_PROJECT_INVALID")),
      version: text(asset.version, 120, "AI_ASSET_VERSION_INVALID"),
      source: { ...asset.source, referenceId: id(asset.source.referenceId, "AI_ASSET_SOURCE_INVALID"),
        observedAt: instant(asset.source.observedAt, "AI_ASSET_SOURCE_TIME_INVALID") },
      canonicalAssetId: asset.canonicalAssetId === null ? null : id(asset.canonicalAssetId, "AI_ASSET_CANONICAL_INVALID"),
      createdAt: instant(asset.createdAt, "AI_ASSET_CREATED_AT_INVALID"),
      updatedAt: instant(asset.updatedAt, "AI_ASSET_UPDATED_AT_INVALID") };
  });
  const relationshipIds = new Set<string>();
  const relationships = value.relationships.map((record) => {
    if (record.companyId !== value.companyId || relationshipIds.has(record.id) || !RELATIONSHIPS.has(record.type) ||
        !assetIds.has(record.fromAssetId) || !assetIds.has(record.toAssetId) || record.fromAssetId === record.toAssetId) {
      throw new Error("AI_ASSET_RELATIONSHIP_INVALID");
    }
    relationshipIds.add(id(record.id, "AI_ASSET_RELATIONSHIP_ID_INVALID"));
    return { ...record, evidenceReference: id(record.evidenceReference, "AI_ASSET_RELATIONSHIP_EVIDENCE_INVALID"),
      observedAt: instant(record.observedAt, "AI_ASSET_RELATIONSHIP_TIME_INVALID") };
  });
  const shadowIds = new Set<string>();
  const shadowReviews = value.shadowReviews.map((record) => {
    if (record.companyId !== value.companyId || shadowIds.has(record.id) || !assetIds.has(record.assetId) ||
        !["NEEDS_OWNER", "UNDER_REVIEW", "ADMITTED", "REJECTED"].includes(record.status) ||
        !Number.isSafeInteger(record.revision) || record.revision < 0) throw new Error("SHADOW_AI_REVIEW_INVALID");
    shadowIds.add(id(record.id, "SHADOW_AI_REVIEW_ID_INVALID"));
    return { ...record, assignedHumanId: record.assignedHumanId === null ? null : id(record.assignedHumanId, "SHADOW_AI_ASSIGNEE_INVALID"),
      reason: record.reason === null ? null : text(record.reason, 1_000, "SHADOW_AI_REASON_INVALID"),
      openedAt: instant(record.openedAt, "SHADOW_AI_TIME_INVALID"), updatedAt: instant(record.updatedAt, "SHADOW_AI_TIME_INVALID") };
  });
  const duplicateIds = new Set<string>();
  const duplicateReviews = value.duplicateReviews.map((record) => {
    if (record.companyId !== value.companyId || duplicateIds.has(record.id) || record.candidateAssetIds.length < 2 ||
        new Set(record.candidateAssetIds).size !== record.candidateAssetIds.length ||
        record.candidateAssetIds.some((candidate) => !assetIds.has(candidate)) ||
        !["OPEN", "MERGED", "DISMISSED"].includes(record.status) || !Number.isSafeInteger(record.revision) || record.revision < 0 ||
        (record.status === "MERGED" && (!record.canonicalAssetId || !record.candidateAssetIds.includes(record.canonicalAssetId)))) {
      throw new Error("DUPLICATE_ASSET_REVIEW_INVALID");
    }
    duplicateIds.add(id(record.id, "DUPLICATE_ASSET_REVIEW_ID_INVALID"));
    return { ...record, evidenceReferences: record.evidenceReferences.map((item) => id(item, "DUPLICATE_ASSET_EVIDENCE_INVALID")),
      decisionReason: record.decisionReason === null ? null : text(record.decisionReason, 1_000, "DUPLICATE_ASSET_REASON_INVALID"),
      openedAt: instant(record.openedAt, "DUPLICATE_ASSET_TIME_INVALID"), updatedAt: instant(record.updatedAt, "DUPLICATE_ASSET_TIME_INVALID") };
  });
  for (const asset of assets) if (asset.canonicalAssetId && !assetIds.has(asset.canonicalAssetId)) {
    throw new Error("AI_ASSET_CANONICAL_NOT_FOUND");
  }
  return { companyId: value.companyId, revision: value.revision, assets, relationships, shadowReviews, duplicateReviews };
}
