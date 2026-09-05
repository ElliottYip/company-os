import assert from "node:assert/strict";
import test from "node:test";
import { aiControlPage } from "../web/pages/ai-control-pages.ts";

test("AI control page exposes inventory, Shadow review, evaluation, and honest unavailable value", () => {
  const html = aiControlPage({ locale: "zh-CN", risk: null, organization: { company: { id: "company-one", name: "公司",
    purpose: "治理", locale: "zh-CN" }, departments: [], humans: [{ id: "human-one", name: "负责人",
      title: "Owner", departmentId: "operations", avatarId: "avatar-one" }], agents: [] },
    graph: { companyId: "company-one", revision: 1, relationships: [], duplicateReviews: [],
      assets: [{ id: "model-one", companyId: "company-one", type: "MODEL", name: "模型一", provider: null,
        ownerHumanId: null, departmentId: null, purpose: "推理", goalIds: ["goal-one"], projectIds: [],
        environment: "PRODUCTION", version: "1", source: { type: "TRACE", referenceId: "trace-one",
          observedAt: "2026-09-05T10:00:00.000Z" }, riskLevel: "NOT_ASSESSED", lifecycle: "DISCOVERED",
        governanceDepth: "UNMANAGED", canonicalAssetId: null, revision: 0,
        createdAt: "2026-09-05T10:00:00.000Z", updatedAt: "2026-09-05T10:00:00.000Z" }],
      shadowReviews: [{ id: "review-one", companyId: "company-one", assetId: "model-one",
        status: "NEEDS_OWNER", assignedHumanId: null, reason: null, revision: 0,
        openedAt: "2026-09-05T10:00:00.000Z", updatedAt: "2026-09-05T10:00:00.000Z" }] },
    evaluations: { catalog: { companyId: "company-one", revision: 0, templates: [], datasets: [], results: [] }, trends: [] },
    value: { ledgerRevision: 0, scopeType: "COMPANY", scopeId: "company-one", periodStart: "2026-09-01T00:00:00.000Z",
      periodEnd: "2026-10-01T00:00:00.000Z", verifiedHoursSavedMinutes: 0, verifiedAdoptionBps: null,
      verifiedOutcomeValueCents: 0, verifiedCostCents: 0, verifiedNetValueCents: null,
      unavailableReasons: ["NO_VERIFIED_ADOPTION", "NO_VERIFIED_OUTCOME_VALUE"], evidenceReferences: [] } });
  assert.match(html, /data-section="assets"/);
  assert.match(html, /data-shadow-review-form/);
  assert.match(html, /data-ai-asset-form/);
  assert.match(html, /data-ai-asset-relationship-form/);
  assert.match(html, /data-evaluation-template-form/);
  assert.match(html, /影响与来源/);
  assert.match(html, /data-operation="REJECT"/);
  assert.match(html, /不可用/);
  assert.doesNotMatch(html, /rawPrompt|rawOutput|credentialReference/);
});
