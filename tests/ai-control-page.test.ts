import assert from "node:assert/strict";
import test from "node:test";
import { aiControlPage } from "../web/pages/ai-control-pages.ts";

test("AI control page exposes inventory, impact paths, Shadow review, evaluation, and honest unavailable value", () => {
  const html = aiControlPage({ locale: "zh-CN", risk: { schemaVersion: 1, companyId: "company-one",
    traces: [{ id: "trace-one", companyId: "company-one", workId: "work-one", attemptId: "attempt-one",
      agentId: "agent-one", spans: [], recordedAt: "2026-09-05T10:00:00.000Z" }],
    accessEdges: [{ id: "edge-one", companyId: "company-one", traceId: "trace-one", spanId: "span-one",
      subjectAgentId: "agent-one", resourceType: "MODEL", resourceId: "model-one", operation: "INFER",
      authorityId: "policy-grant-one" }],
    violations: [{ id: "violation-one", companyId: "company-one", traceId: "trace-one", ruleId: "policy-one",
      severity: "HIGH", agentId: "agent-one", workId: "work-one", attemptId: "attempt-one",
      accessEdgeIds: ["edge-one"], summary: "模型策略命中", observedAt: "2026-09-05T10:00:00.000Z" }],
    alerts: [], cases: [],
    generatedAt: "2026-09-05T10:00:00.000Z" }, organization: { company: { id: "company-one", name: "公司",
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
  assert.match(html, /work-one \/ attempt-one/);
  assert.match(html, /policy-one/);
  assert.match(html, /data-section-target="risk"/);
  assert.match(html, /data-operation="REJECT"/);
  assert.match(html, /不可用/);
  assert.doesNotMatch(html, /rawPrompt|rawOutput|credentialReference/);
});
