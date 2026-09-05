import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import { AiAssetRegistry } from "../application/ai-asset-registry.ts";
import { AiEvaluationRegistry } from "../application/ai-evaluation-registry.ts";

test("evaluation results freeze evaluator provenance and expose threshold regression without invented scores", async () => {
  const events = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-evaluation-")));
  let sequence = 0; const nextId = () => `record-${++sequence}`;
  const identity = { async getCurrentIdentity() { return { actorId: "human-one", organizationId: "company-one",
    displayName: "Human", assurance: "ENTERPRISE_ASSERTED" as const }; }, async currentPrincipal() { return null; },
    async authorize() { return { id: nextId(), principalId: "human-one", authorizedAt: "2026-09-05T10:00:00.000Z" }; } };
  await new AiAssetRegistry({ identity, events, now: () => "2026-09-05T10:00:00.000Z", nextId })
    .upsertAsset("company-one", { expectedGraphRevision: 0, expectedAssetRevision: null, asset: {
      id: "agent-one", type: "AGENT", name: "Agent One", provider: null, ownerHumanId: "human-one",
      departmentId: null, purpose: "Run tasks", environment: "PRODUCTION", version: "1",
      goalIds: ["goal-one"], projectIds: ["project-one"],
      source: { type: "MANUAL", referenceId: "registration-one", observedAt: "2026-09-05T10:00:00.000Z" },
      riskLevel: "LOW", lifecycle: "ACTIVE", governanceDepth: "GOVERNED" } });
  const registry = new AiEvaluationRegistry({ identity, events, now: () => "2026-09-05T10:00:00.000Z", nextId });
  let view = await registry.upsertTemplate("company-one", { expectedCatalogRevision: 0,
    expectedTemplateRevision: null, template: { id: "task-quality", name: "Task quality",
      dimension: "TASK_COMPLETION", evaluatorKind: "HUMAN", evaluatorReference: "quality-board",
      evaluatorVersion: "rubric-v1", passThresholdBps: 8000, regressionToleranceBps: 500, status: "ACTIVE" } });
  view = await registry.upsertDataset("company-one", { expectedCatalogRevision: 1,
    expectedDatasetRevision: null, dataset: { id: "dataset-one", name: "Accepted tasks", assetId: "agent-one",
      itemCount: 20, contentDigest: `sha256:${"a".repeat(64)}`, evidenceReferences: ["evidence-dataset"],
      recordedAt: "2026-09-05T10:00:00.000Z" } });
  view = await registry.recordResult("company-one", { expectedCatalogRevision: 2, result: {
    id: "result-one", templateId: "task-quality", assetId: "agent-one", datasetId: "dataset-one",
    traceId: null, scoreBps: 9000, evidenceReferences: ["evidence-score-one"], observedAt: "2026-09-05T10:10:00.000Z" } });
  view = await registry.recordResult("company-one", { expectedCatalogRevision: 3, result: {
    id: "result-two", templateId: "task-quality", assetId: "agent-one", datasetId: "dataset-one",
    traceId: null, scoreBps: 7900, evidenceReferences: ["evidence-score-two"], observedAt: "2026-09-05T11:10:00.000Z" } });
  assert.equal(view.catalog.results[1]?.outcome, "FAIL");
  assert.equal(view.catalog.results[1]?.evaluatorVersion, "rubric-v1");
  assert.equal(view.catalog.results[1]?.thresholdBps, 8000);
  assert.equal(view.trends[0]?.deltaBps, -1100);
  assert.equal(view.trends[0]?.regression, true);
  await assert.rejects(registry.recordResult("company-one", { expectedCatalogRevision: 4, result: {
    id: "result-three", templateId: "task-quality", assetId: "agent-one", datasetId: null,
    traceId: null, scoreBps: 9900, evidenceReferences: ["evidence-three"], observedAt: "2026-09-05T12:00:00.000Z" } }),
    /AI_EVALUATION_RESULT_INVALID/);
});
