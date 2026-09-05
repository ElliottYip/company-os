import assert from "node:assert/strict";
import test from "node:test";

import { operationalRiskPage } from "../web/pages/operational-pages.ts";

const organization = {
  company: { id: "company-one", name: "Company One", purpose: "Operate safely", locale: "zh-CN" },
  departments: [{ id: "operations", name: "运营", mandate: "安全运营" }],
  humans: [{ id: "human-one", name: "张岚", title: "负责人", departmentId: "operations", avatarId: "human-avatar" }],
  agents: [{ id: "agent-one", name: "采购 Agent", role: "采购", departmentId: "operations",
    accountableHumanId: "human-one", runtimeConnectorId: "connector-one", avatarId: "agent-avatar", autonomyLevel: 2 }],
};

test("risk page keeps Access Map and the next revisioned AI Case action in one bounded journey", () => {
  const html = operationalRiskPage({ schemaVersion: 1, companyId: "company-one",
    traces: [{ id: "trace-one", companyId: "company-one", workId: "work-one", attemptId: "attempt-one",
      agentId: "agent-one", spans: [], recordedAt: "2026-09-05T08:00:00.000Z" }],
    accessEdges: [{ id: "edge-one", companyId: "company-one", traceId: "trace-one", spanId: "span-one",
      subjectAgentId: "agent-one", resourceType: "DATA_SOURCE", resourceId: "supplier-data",
      operation: "EXPORT", authorityId: "data-contract-one" }],
    violations: [], alerts: [{ id: "alert-one", companyId: "company-one", violationId: "violation-one",
      severity: "CRITICAL", status: "CONTAINED", containment: "PAUSE_SUCCEEDED",
      openedAt: "2026-09-05T08:00:00.000Z", resolvedAt: null }],
    cases: [{ id: "case-one", companyId: "company-one", alertIds: ["alert-one"], workId: "work-one",
      agentId: "agent-one", accountableHumanId: "human-one", ownerHumanId: "human-one",
      status: "CONTAINED", revision: 1, containment: "PAUSE_SUCCEEDED", summary: "越权导出",
      rootCause: null, remediation: null, prevention: null, openedAt: "2026-09-05T08:00:00.000Z",
      updatedAt: "2026-09-05T08:01:00.000Z", closedAt: null }],
    generatedAt: "2026-09-05T08:01:00.000Z" }, organization, "zh-CN");
  assert.match(html, /data-section="risk"/);
  assert.match(html, /agent-one → DATA_SOURCE:supplier-data/);
  assert.match(html, /data-open-agent-detail="agent-one"/);
  assert.match(html, /data-case-operation="START_INVESTIGATION"/);
  assert.match(html, /data-case-revision="1"/);
  assert.doesNotMatch(html, /rawPrompt|credentialReference|rawOutput/);
});
