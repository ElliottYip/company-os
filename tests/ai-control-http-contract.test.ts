import assert from "node:assert/strict";
import test from "node:test";
import { aiAssetCommand, duplicateReviewCommand, evaluationResultCommand,
  shadowReviewCommand, valueMeasurementCommand } from "../adapters/http/ai-control-http-contract.ts";

test("AI control HTTP commands accept bounded public evidence and reject extra private fields", () => {
  const asset = { expectedGraphRevision: 0, expectedAssetRevision: null, asset: { id: "model-one",
    type: "MODEL", name: "Model One", provider: "provider-one", ownerHumanId: "human-one",
    departmentId: null, purpose: "Approved inference", goalIds: ["goal-one"], projectIds: ["project-one"],
    environment: "PRODUCTION", version: "1", source: { type: "MANUAL", referenceId: "registration-one",
      observedAt: "2026-09-05T10:00:00.000Z" }, riskLevel: "LOW", lifecycle: "ACTIVE",
    governanceDepth: "GOVERNED" } };
  assert.ok(aiAssetCommand(asset));
  assert.equal(aiAssetCommand({ ...asset, privateSession: "forbidden" }), null);
  assert.ok(shadowReviewCommand({ expectedGraphRevision: 1, expectedReviewRevision: 0,
    assignedHumanId: "human-one", reason: "Assign owner" }, "ASSIGN"));
  assert.equal(shadowReviewCommand({ expectedGraphRevision: 1, expectedReviewRevision: 0,
    reason: "Missing owner" }, "ASSIGN"), null);
  assert.ok(duplicateReviewCommand({ expectedGraphRevision: 2, expectedReviewRevision: 0,
    canonicalAssetId: "model-one", reason: "Same provider and version" }, "MERGE"));
  assert.ok(evaluationResultCommand({ expectedCatalogRevision: 1, result: { id: "result-one",
    templateId: "quality", assetId: "model-one", datasetId: "dataset-one", traceId: null,
    scoreBps: 8200, evidenceReferences: ["evidence-one"], observedAt: "2026-09-05T10:00:00.000Z" } }));
  assert.equal(evaluationResultCommand({ expectedCatalogRevision: 1, result: { id: "result-one",
    templateId: "quality", assetId: "model-one", datasetId: null, traceId: null,
    scoreBps: 8200, evidenceReferences: ["evidence-one"], observedAt: "2026-09-05T10:00:00.000Z" } }), null);
  assert.ok(valueMeasurementCommand({ expectedRevision: 0, measurement: { id: "value-one",
    scopeType: "ASSET", scopeId: "model-one", metric: "OUTCOME_VALUE_CENTS", numerator: 1000,
    denominator: null, method: "Accepted outcome ledger", sourceReference: "evidence-value",
    sourceDigest: `sha256:${"a".repeat(64)}`, confidence: "VERIFIED", periodStart: "2026-09-05T00:00:00.000Z",
    periodEnd: "2026-09-05T09:00:00.000Z", recordedAt: "2026-09-05T10:00:00.000Z" } }));
});
