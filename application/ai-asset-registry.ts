import type { Identifier } from "../core/control-plane.ts";
import { validateAiAssetGraph, type AiAsset, type AiAssetGraph, type AiAssetGovernanceDepth,
  type AiAssetRelationship } from "../core/ai-asset.ts";
import type { RuntimeTrace } from "../core/operational-risk.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

export async function projectAiAssetGraph(events: EventDataStorePort, companyId: Identifier): Promise<AiAssetGraph> {
  const records = await events.read(companyId, { types: ["ai-asset-graph.revised"] });
  const graph = (records.at(-1)?.payload as { graph?: AiAssetGraph } | undefined)?.graph;
  return graph ? validateAiAssetGraph(graph) : { companyId, revision: 0, assets: [], relationships: [],
    shadowReviews: [], duplicateReviews: [] };
}

type AssetDraft = Omit<AiAsset, "companyId" | "revision" | "createdAt" | "updatedAt" | "canonicalAssetId">;

export class AiAssetRegistry {
  readonly #identity: IdentityPort;
  readonly #events: EventDataStorePort;
  readonly #now: () => string;
  readonly #nextId: () => Identifier;
  constructor(dependencies: { readonly identity: IdentityPort; readonly events: EventDataStorePort;
    readonly now: () => string; readonly nextId: () => Identifier }) {
    this.#identity = dependencies.identity; this.#events = dependencies.events;
    this.#now = dependencies.now; this.#nextId = dependencies.nextId;
  }

  async load(companyId: Identifier): Promise<AiAssetGraph> {
    await this.#authorize(companyId, "ai-assets:read", "Read the AI asset graph");
    return projectAiAssetGraph(this.#events, companyId);
  }

  async upsertAsset(companyId: Identifier, input: { readonly expectedGraphRevision: number;
    readonly expectedAssetRevision: number | null; readonly asset: AssetDraft }): Promise<AiAssetGraph> {
    const actorId = await this.#authorize(companyId, "ai-assets:write", "Register or revise an AI asset");
    const current = await projectAiAssetGraph(this.#events, companyId);
    this.#graphRevision(current, input.expectedGraphRevision);
    const existing = current.assets.find(({ id }) => id === input.asset.id);
    if ((existing?.revision ?? null) !== input.expectedAssetRevision) throw new Error("AI_ASSET_RECORD_REVISION_CONFLICT");
    if (existing && (existing.type !== input.asset.type || existing.ownerHumanId !== input.asset.ownerHumanId ||
        existing.governanceDepth !== input.asset.governanceDepth || existing.source.type !== input.asset.source.type ||
        existing.source.referenceId !== input.asset.source.referenceId || existing.source.observedAt !== input.asset.source.observedAt)) {
      throw new Error("AI_ASSET_GOVERNANCE_REVIEW_REQUIRED");
    }
    const now = this.#now();
    const asset: AiAsset = { ...input.asset, companyId, canonicalAssetId: existing?.canonicalAssetId ?? null,
      revision: (existing?.revision ?? -1) + 1, createdAt: existing?.createdAt ?? now, updatedAt: now };
    let shadowReviews = [...current.shadowReviews];
    if (asset.governanceDepth === "UNMANAGED" && !shadowReviews.some((review) =>
      review.assetId === asset.id && !["ADMITTED", "REJECTED"].includes(review.status))) {
      shadowReviews.push({ id: this.#nextId(), companyId, assetId: asset.id, status: "NEEDS_OWNER",
        assignedHumanId: null, reason: null, revision: 0, openedAt: now, updatedAt: now });
    }
    const assets = existing ? current.assets.map((item) => item.id === asset.id ? asset : item) : [...current.assets, asset];
    let duplicateReviews = [...current.duplicateReviews];
    const normalized = `${asset.type}|${asset.provider?.trim().toLocaleLowerCase() ?? ""}|${asset.name.trim().toLocaleLowerCase()}`;
    const matches = assets.filter((item) => `${item.type}|${item.provider?.trim().toLocaleLowerCase() ?? ""}|${item.name.trim().toLocaleLowerCase()}` === normalized);
    if (matches.length > 1) {
      const candidates = matches.map(({ id }) => id).sort();
      const alreadyOpen = duplicateReviews.some((review) => review.status === "OPEN" &&
        review.candidateAssetIds.length === candidates.length && review.candidateAssetIds.every((id, index) => id === candidates[index]));
      if (!alreadyOpen) duplicateReviews.push({ id: this.#nextId(), companyId, candidateAssetIds: candidates,
        canonicalAssetId: null, status: "OPEN", evidenceReferences: matches.map(({ source }) => source.referenceId),
        decisionReason: null, revision: 0, openedAt: now, updatedAt: now });
    }
    return this.#save(actorId, current, { ...current, revision: current.revision + 1, assets,
      shadowReviews, duplicateReviews });
  }

  async addRelationship(companyId: Identifier, input: { readonly expectedGraphRevision: number;
    readonly relationship: Omit<AiAssetRelationship, "companyId"> }): Promise<AiAssetGraph> {
    const actorId = await this.#authorize(companyId, "ai-assets:relate", "Record an evidence-backed AI asset relationship");
    const current = await projectAiAssetGraph(this.#events, companyId); this.#graphRevision(current, input.expectedGraphRevision);
    if (current.relationships.some(({ id }) => id === input.relationship.id)) throw new Error("AI_ASSET_RELATIONSHIP_EXISTS");
    return this.#save(actorId, current, { ...current, revision: current.revision + 1,
      relationships: [...current.relationships, { ...input.relationship, companyId }] });
  }

  async reviewShadow(companyId: Identifier, reviewId: Identifier, input: { readonly operation: "ASSIGN" | "ADMIT" | "REJECT";
    readonly expectedGraphRevision: number; readonly expectedReviewRevision: number; readonly assignedHumanId?: Identifier;
    readonly governanceDepth?: Exclude<AiAssetGovernanceDepth, "UNMANAGED">; readonly reason: string }): Promise<AiAssetGraph> {
    const actorId = await this.#authorize(companyId, "shadow-ai:review", "Review discovered Shadow AI");
    const current = await projectAiAssetGraph(this.#events, companyId); this.#graphRevision(current, input.expectedGraphRevision);
    const review = current.shadowReviews.find(({ id }) => id === reviewId);
    if (!review) throw new Error("SHADOW_AI_REVIEW_NOT_FOUND");
    if (review.revision !== input.expectedReviewRevision) throw new Error("SHADOW_AI_REVIEW_REVISION_CONFLICT");
    const now = this.#now();
    let status = review.status; let assignedHumanId = review.assignedHumanId;
    if (input.operation === "ASSIGN" && review.status === "NEEDS_OWNER" && input.assignedHumanId) {
      status = "UNDER_REVIEW"; assignedHumanId = input.assignedHumanId;
    } else if (input.operation === "ADMIT" && review.status === "UNDER_REVIEW" && assignedHumanId && input.governanceDepth) {
      status = "ADMITTED";
    } else if (input.operation === "REJECT" && ["NEEDS_OWNER", "UNDER_REVIEW"].includes(review.status)) {
      status = "REJECTED";
    } else throw new Error("SHADOW_AI_REVIEW_TRANSITION_INVALID");
    const shadowReviews = current.shadowReviews.map((item) => item.id === review.id ? { ...item, status,
      assignedHumanId, reason: input.reason, revision: item.revision + 1, updatedAt: now } : item);
    const assets = current.assets.map((asset) => asset.id !== review.assetId ? asset : input.operation === "ADMIT"
      ? { ...asset, ownerHumanId: assignedHumanId, governanceDepth: input.governanceDepth!, lifecycle: "REVIEW" as const,
          revision: asset.revision + 1, updatedAt: now }
      : input.operation === "REJECT" ? { ...asset, lifecycle: "RETIRED" as const,
          revision: asset.revision + 1, updatedAt: now } : asset);
    return this.#save(actorId, current, { ...current, revision: current.revision + 1, assets, shadowReviews });
  }

  async reviewDuplicate(companyId: Identifier, reviewId: Identifier, input: { readonly operation: "MERGE" | "DISMISS";
    readonly expectedGraphRevision: number; readonly expectedReviewRevision: number;
    readonly canonicalAssetId?: Identifier; readonly reason: string }): Promise<AiAssetGraph> {
    const actorId = await this.#authorize(companyId, "ai-assets:duplicate-review", "Resolve a duplicate AI asset review");
    const current = await projectAiAssetGraph(this.#events, companyId); this.#graphRevision(current, input.expectedGraphRevision);
    const review = current.duplicateReviews.find(({ id }) => id === reviewId);
    if (!review) throw new Error("DUPLICATE_ASSET_REVIEW_NOT_FOUND");
    if (review.revision !== input.expectedReviewRevision) throw new Error("DUPLICATE_ASSET_REVIEW_REVISION_CONFLICT");
    if (review.status !== "OPEN" || input.operation === "MERGE" &&
        (!input.canonicalAssetId || !review.candidateAssetIds.includes(input.canonicalAssetId))) {
      throw new Error("DUPLICATE_ASSET_REVIEW_TRANSITION_INVALID");
    }
    const now = this.#now(); const canonical = input.operation === "MERGE" ? input.canonicalAssetId! : null;
    const duplicateReviews = current.duplicateReviews.map((item) => item.id === review.id ? { ...item,
      status: input.operation === "MERGE" ? "MERGED" as const : "DISMISSED" as const,
      canonicalAssetId: canonical, decisionReason: input.reason, revision: item.revision + 1, updatedAt: now } : item);
    const assets = input.operation === "MERGE" ? current.assets.map((asset) =>
      review.candidateAssetIds.includes(asset.id) && asset.id !== canonical
        ? { ...asset, canonicalAssetId: canonical, lifecycle: "RETIRED" as const,
            revision: asset.revision + 1, updatedAt: now } : asset) : current.assets;
    return this.#save(actorId, current, { ...current, revision: current.revision + 1, assets, duplicateReviews });
  }

  #graphRevision(current: AiAssetGraph, expected: number): void {
    if (current.revision !== expected) throw new Error("AI_ASSET_GRAPH_REVISION_CONFLICT");
  }
  async #authorize(companyId: Identifier, action: string, reason: string): Promise<Identifier> {
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== companyId) throw new Error("TENANT_MISMATCH");
    const receipt = await this.#identity.authorize({ companyId, action, resourceId: companyId, reason });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    return identity.actorId;
  }
  async #save(actorId: Identifier, current: AiAssetGraph, next: AiAssetGraph): Promise<AiAssetGraph> {
    const graph = validateAiAssetGraph(next); const all = await this.#events.read(current.companyId);
    await this.#events.append({ id: this.#nextId(), companyId: current.companyId, type: "ai-asset-graph.revised",
      actorId, occurredAt: this.#now(), provenance: "PRODUCTION", payload: { graph } }, all.length);
    return structuredClone(graph);
  }
}

/** Trusted ingestion hook: projects bounded Trace resources into the asset graph without inventing metadata. */
export class DiscoverTraceAiAssets {
  readonly #events: EventDataStorePort;
  readonly #nextId: () => Identifier;
  constructor(dependencies: { readonly events: EventDataStorePort; readonly nextId: () => Identifier }) {
    this.#events = dependencies.events; this.#nextId = dependencies.nextId;
  }
  async execute(input: { readonly trace: RuntimeTrace; readonly accountableHumanId: Identifier;
    readonly actorId: Identifier }): Promise<AiAssetGraph> {
    const prior = await this.#events.read(input.trace.companyId, { types: ["ai-asset-graph.revised"] });
    if (prior.some((event) => (event.payload as { traceId?: Identifier }).traceId === input.trace.id)) {
      return projectAiAssetGraph(this.#events, input.trace.companyId);
    }
    const current = await projectAiAssetGraph(this.#events, input.trace.companyId);
    const now = input.trace.recordedAt;
    const assets = [...current.assets]; const relationships = [...current.relationships];
    if (!assets.some(({ id }) => id === input.trace.agentId)) assets.push({ id: input.trace.agentId,
      companyId: input.trace.companyId, type: "AGENT", name: input.trace.agentId, provider: null,
      ownerHumanId: input.accountableHumanId, departmentId: null, purpose: "Execute accountable company Work",
      goalIds: [], projectIds: [],
      environment: "PRODUCTION", version: "observed", source: { type: "TRACE", referenceId: input.trace.id,
        observedAt: now }, riskLevel: "NOT_ASSESSED", lifecycle: "ACTIVE", governanceDepth: "GOVERNED",
      canonicalAssetId: null, revision: 0, createdAt: now, updatedAt: now });
    const type = { MODEL: "MODEL", TOOL: "TOOL", DATA: "DATASET", ASSET: "KNOWLEDGE_BASE" } as const;
    const relationship = { MODEL: "USES", TOOL: "CALLS", DATA: "READS", ASSET: "DEPENDS_ON" } as const;
    for (const span of input.trace.spans) {
      if (!span.resource) continue;
      const expectedType = type[span.resource.type];
      const exact = assets.find(({ id }) => id === span.resource!.id);
      const priorDiscovery = assets.find((asset) => asset.type === expectedType && asset.name === span.resource!.id &&
        asset.source.type === "TRACE" && asset.source.referenceId === input.trace.id);
      const assetId = exact?.type === expectedType ? exact.id : priorDiscovery?.id ?? (exact ? this.#nextId() : span.resource.id);
      if (!assets.some(({ id }) => id === assetId)) assets.push({ id: assetId, companyId: input.trace.companyId,
        type: expectedType, name: span.resource.id, provider: null, ownerHumanId: null, departmentId: null,
        purpose: `Observed ${span.resource.type.toLocaleLowerCase()} resource`, environment: "PRODUCTION",
        goalIds: [], projectIds: [],
        version: "observed", source: { type: "TRACE", referenceId: input.trace.id, observedAt: now },
        riskLevel: "NOT_ASSESSED", lifecycle: "DISCOVERED", governanceDepth: "UNMANAGED",
        canonicalAssetId: null, revision: 0, createdAt: now, updatedAt: now });
      const edgeId = this.#nextId();
      if (!relationships.some((edge) => edge.fromAssetId === input.trace.agentId && edge.toAssetId === assetId &&
          edge.type === relationship[span.resource!.type] && edge.evidenceReference === input.trace.id)) {
        relationships.push({ id: edgeId, companyId: input.trace.companyId, fromAssetId: input.trace.agentId,
          toAssetId: assetId, type: relationship[span.resource.type], evidenceReference: input.trace.id, observedAt: now });
      }
    }
    const shadowReviews = [...current.shadowReviews];
    for (const asset of assets) if (asset.governanceDepth === "UNMANAGED" &&
        !shadowReviews.some(({ assetId }) => assetId === asset.id)) shadowReviews.push({ id: this.#nextId(),
      companyId: input.trace.companyId, assetId: asset.id, status: "NEEDS_OWNER", assignedHumanId: null,
      reason: null, revision: 0, openedAt: now, updatedAt: now });
    const graph = validateAiAssetGraph({ ...current, revision: current.revision + 1,
      assets, relationships, shadowReviews });
    const all = await this.#events.read(input.trace.companyId);
    await this.#events.append({ id: this.#nextId(), companyId: input.trace.companyId,
      type: "ai-asset-graph.revised", actorId: input.actorId, occurredAt: now, provenance: "PRODUCTION",
      correlationId: input.trace.workId, payload: { graph, traceId: input.trace.id } }, all.length);
    return graph;
  }
}
