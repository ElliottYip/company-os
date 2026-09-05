import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import { AiAssetRegistry, DiscoverTraceAiAssets } from "../application/ai-asset-registry.ts";

function asset(id: string, referenceId: string) {
  return { id, type: "MODEL" as const, name: "Reasoning Model", provider: "Provider One",
    ownerHumanId: null, departmentId: null, purpose: "Support controlled reasoning",
    goalIds: [], projectIds: [],
    environment: "PRODUCTION" as const, version: "2026-09", source: { type: "TRACE" as const,
      referenceId, observedAt: "2026-09-05T10:00:00.000Z" }, riskLevel: "NOT_ASSESSED" as const,
    lifecycle: "DISCOVERED" as const, governanceDepth: "UNMANAGED" as const };
}

test("Trace discovery opens Shadow AI intake and evidence-backed duplicate review without deleting history", async () => {
  const events = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-assets-")));
  let sequence = 0; const nextId = () => `asset-event-${++sequence}`;
  const identity = { async getCurrentIdentity() { return { actorId: "human-one", organizationId: "company-one",
    displayName: "Human", assurance: "ENTERPRISE_ASSERTED" as const }; }, async currentPrincipal() { return null; },
    async authorize() { return { id: nextId(), principalId: "human-one", authorizedAt: "2026-09-05T10:00:00.000Z" }; } };
  const registry = new AiAssetRegistry({ identity, events, now: () => "2026-09-05T10:00:00.000Z", nextId });
  let graph = await registry.upsertAsset("company-one", { expectedGraphRevision: 0,
    expectedAssetRevision: null, asset: asset("model-one", "trace-one") });
  assert.equal(graph.shadowReviews[0]?.status, "NEEDS_OWNER");
  await assert.rejects(registry.upsertAsset("company-one", { expectedGraphRevision: 1,
    expectedAssetRevision: 0, asset: { ...asset("model-one", "trace-one"), ownerHumanId: "human-one",
      governanceDepth: "GOVERNED" } }), /AI_ASSET_GOVERNANCE_REVIEW_REQUIRED/);
  graph = await registry.upsertAsset("company-one", { expectedGraphRevision: 1,
    expectedAssetRevision: null, asset: asset("model-two", "trace-two") });
  assert.deepEqual(graph.duplicateReviews[0]?.candidateAssetIds, ["model-one", "model-two"]);
  const shadow = graph.shadowReviews.find(({ assetId }) => assetId === "model-one")!;
  graph = await registry.reviewShadow("company-one", shadow.id, { operation: "ASSIGN",
    expectedGraphRevision: 2, expectedReviewRevision: 0, assignedHumanId: "human-one", reason: "Platform owner" });
  graph = await registry.reviewShadow("company-one", shadow.id, { operation: "ADMIT",
    expectedGraphRevision: 3, expectedReviewRevision: 1, governanceDepth: "GOVERNED", reason: "Controls attached" });
  assert.equal(graph.assets.find(({ id }) => id === "model-one")?.ownerHumanId, "human-one");
  assert.equal(graph.assets.find(({ id }) => id === "model-one")?.governanceDepth, "GOVERNED");
  const duplicate = graph.duplicateReviews[0]!;
  graph = await registry.reviewDuplicate("company-one", duplicate.id, { operation: "MERGE",
    expectedGraphRevision: 4, expectedReviewRevision: 0, canonicalAssetId: "model-one",
    reason: "Same provider model discovered twice" });
  assert.equal(graph.duplicateReviews[0]?.status, "MERGED");
  assert.equal(graph.assets.find(({ id }) => id === "model-two")?.canonicalAssetId, "model-one");
  assert.equal(graph.assets.length, 2);
  await assert.rejects(registry.reviewDuplicate("company-one", duplicate.id, { operation: "DISMISS",
    expectedGraphRevision: 5, expectedReviewRevision: 1, reason: "Cannot rewrite decision" }),
    /DUPLICATE_ASSET_REVIEW_TRANSITION_INVALID/);
});

test("asset relationships require two existing assets and an evidence reference", async () => {
  const events = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-assets-edge-")));
  let sequence = 0; const identity = { async getCurrentIdentity() { return { actorId: "human-one",
    organizationId: "company-one", displayName: "Human", assurance: "ENTERPRISE_ASSERTED" as const }; },
    async currentPrincipal() { return null; }, async authorize() { return { id: `receipt-${++sequence}`,
      principalId: "human-one", authorizedAt: "2026-09-05T10:00:00.000Z" }; } };
  const registry = new AiAssetRegistry({ identity, events, now: () => "2026-09-05T10:00:00.000Z",
    nextId: () => `event-${++sequence}` });
  await registry.upsertAsset("company-one", { expectedGraphRevision: 0, expectedAssetRevision: null,
    asset: asset("model-one", "trace-one") });
  await assert.rejects(registry.addRelationship("company-one", { expectedGraphRevision: 1,
    relationship: { id: "edge-one", fromAssetId: "model-one", toAssetId: "missing", type: "USES",
      evidenceReference: "trace-one", observedAt: "2026-09-05T10:00:00.000Z" } }),
    /AI_ASSET_RELATIONSHIP_INVALID/);
});

test("bounded Trace discovery projects governed Agent, Shadow resource, and evidence relationship idempotently", async () => {
  const events = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-trace-assets-")));
  let sequence = 0; const discovery = new DiscoverTraceAiAssets({ events,
    nextId: () => `discovery-${++sequence}` });
  const trace = { id: "trace-one", companyId: "company-one", workId: "work-one", attemptId: "attempt-one",
    agentId: "agent-one", recordedAt: "2026-09-05T10:00:00.000Z", spans: [{ id: "span-one",
      parentSpanId: null, kind: "DATA" as const, name: "Read supplier data",
      startedAt: "2026-09-05T09:59:59.000Z", endedAt: "2026-09-05T10:00:00.000Z", status: "OK" as const,
      resource: { type: "DATA" as const, id: "supplier-data", operation: "READ", authorityId: "grant-one" } }] };
  let graph = await discovery.execute({ trace, accountableHumanId: "human-one", actorId: "connector-one" });
  assert.equal(graph.assets.find(({ id }) => id === "agent-one")?.governanceDepth, "GOVERNED");
  assert.equal(graph.assets.find(({ id }) => id === "supplier-data")?.governanceDepth, "UNMANAGED");
  assert.equal(graph.shadowReviews[0]?.assetId, "supplier-data");
  assert.equal(graph.relationships[0]?.evidenceReference, "trace-one");
  graph = await discovery.execute({ trace, accountableHumanId: "human-one", actorId: "connector-one" });
  assert.equal(graph.revision, 1);
  assert.equal(graph.relationships.length, 1);
});
