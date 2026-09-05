import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { aiControlPage } from "../web/pages/ai-control-pages.ts";

const instant = "2026-09-05T10:00:00.000Z";
const longId = "model-customer-service-production-east-region";
const html = aiControlPage({
  locale: "zh-CN",
  organization: {
    company: { id: "company-one", name: "Coral Labs", purpose: "治理 AI 业务", locale: "zh-CN" },
    departments: [],
    humans: [{ id: "human-one", name: "Human One", title: "AI Owner", departmentId: "operations", avatarId: "human-default" }],
    agents: [],
  },
  graph: {
    companyId: "company-one", revision: 3,
    assets: [{ id: longId, companyId: "company-one", type: "MODEL", name: "客服生产模型（超长名称响应式验证）",
      provider: "provider-one", ownerHumanId: "human-one", departmentId: null, purpose: "处理客户支持请求并调用知识库",
      goalIds: ["goal-customer-success-quarterly-resolution-quality"], projectIds: ["project-support-automation-alpha"],
      environment: "PRODUCTION", version: "2026-09-05-production-candidate", source: { type: "CONNECTOR", referenceId: "connector-observation-one", observedAt: instant },
      riskLevel: "HIGH", lifecycle: "ACTIVE", governanceDepth: "GOVERNED", canonicalAssetId: null, revision: 2,
      createdAt: instant, updatedAt: instant },
    { id: "knowledge-customer-support", companyId: "company-one", type: "KNOWLEDGE_BASE", name: "客户支持知识库",
      provider: null, ownerHumanId: null, departmentId: null, purpose: "提供有限检索上下文", goalIds: [], projectIds: [],
      environment: "PRODUCTION", version: "1", source: { type: "TRACE", referenceId: "trace-one", observedAt: instant },
      riskLevel: "NOT_ASSESSED", lifecycle: "DISCOVERED", governanceDepth: "UNMANAGED", canonicalAssetId: null,
      revision: 0, createdAt: instant, updatedAt: instant }],
    relationships: [{ id: "relationship-one", companyId: "company-one", fromAssetId: longId,
      toAssetId: "knowledge-customer-support", type: "READS", evidenceReference: "trace-one", observedAt: instant }],
    shadowReviews: [{ id: "shadow-review-one", companyId: "company-one", assetId: "knowledge-customer-support",
      status: "UNDER_REVIEW", assignedHumanId: "human-one", reason: "Observed in production trace", revision: 1,
      openedAt: instant, updatedAt: instant }],
    duplicateReviews: [],
  },
  evaluations: { catalog: { companyId: "company-one", revision: 1, templates: [], datasets: [], results: [] },
    trends: [{ assetId: longId, templateId: "template-customer-quality", latestResultId: "result-one",
      previousResultId: "result-zero", latestScoreBps: 8_750, deltaBps: -650, regression: true }] },
  value: { ledgerRevision: 2, scopeType: "COMPANY", scopeId: "company-one", periodStart: "2026-09-01T00:00:00.000Z",
    periodEnd: "2026-10-01T00:00:00.000Z", verifiedHoursSavedMinutes: 720, verifiedAdoptionBps: 6_250,
    verifiedOutcomeValueCents: 250_000, verifiedCostCents: 75_000, verifiedNetValueCents: 175_000,
    unavailableReasons: [], evidenceReferences: ["evidence-value-one"] },
  risk: { schemaVersion: 1, companyId: "company-one", traces: [{ id: "trace-one", companyId: "company-one",
      workId: "work-one", attemptId: "attempt-one", agentId: longId, spans: [{ id: "span-one", parentSpanId: null,
        kind: "MODEL", name: "Production model call", startedAt: instant, endedAt: instant, status: "OK",
        resource: { type: "MODEL", id: longId, operation: "INFER", authorityId: "model-policy-one" } }], recordedAt: instant }],
    accessEdges: [{ id: "edge-one", companyId: "company-one", traceId: "trace-one", spanId: "span-one",
      subjectAgentId: longId, resourceType: "MODEL", resourceId: longId, operation: "INFER", authorityId: "model-policy-one" }],
    violations: [{ id: "violation-one", companyId: "company-one", ruleId: "policy-production-model-review",
      severity: "HIGH", agentId: longId, workId: "work-one", attemptId: "attempt-one", traceId: "trace-one",
      accessEdgeIds: ["edge-one"], summary: "Production model regression", observedAt: instant }],
    alerts: [{ id: "alert-one", companyId: "company-one", violationId: "violation-one", severity: "HIGH",
      status: "CONTAINED", containment: "PAUSE_SUCCEEDED", openedAt: instant, resolvedAt: null }],
    cases: [{ id: "case-production-access-one", companyId: "company-one", alertIds: ["alert-one"],
      agentId: longId, workId: "work-one", accountableHumanId: "human-one", summary: "Unexpected production data access",
      severity: "HIGH", status: "INVESTIGATING", containment: "CONFIRMED", rootCause: null, remediation: null,
      prevention: null, revision: 1, openedAt: instant, updatedAt: instant }], generatedAt: instant },
});

const css = `${await readFile(resolve("web/family-ui.css"), "utf8")}\n${await readFile(resolve("web/styles.css"), "utf8")}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const viewport of [{ name: "mobile", width: 390, height: 844 }, { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1440, height: 1000 }]) {
    const page = await browser.newPage({ viewport });
    await page.setContent(`<style>${css}</style><main class="company-os family-ui"><aside class="company-rail" aria-hidden="true"></aside><div class="app-main"><div class="workspace">${html}</div></div></main>`);
    await page.locator(".ai-asset-row details").first().click();
    await page.locator(".ai-control-section details").first().click();
    const overflow = await page.evaluate(() => ({ body: document.body.scrollWidth - document.body.clientWidth,
      page: (document.querySelector('[data-section="assets"]')?.scrollWidth ?? 0) -
        (document.querySelector('[data-section="assets"]')?.clientWidth ?? 0) }));
    if (overflow.body > 1 || overflow.page > 1) throw new Error(`AI_CONTROL_OVERFLOW_${viewport.name}:${JSON.stringify(overflow)}`);
    const outside = await page.locator("button,input,select,textarea,summary").evaluateAll((nodes) => nodes.flatMap((node) => {
      const box = node.getBoundingClientRect(); return box.right > window.innerWidth + 1 || box.left < -1
        ? [{ tag: node.tagName, name: node.getAttribute("name"), className: node.className,
          left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width) }] : [];
    }));
    await page.screenshot({ path: resolve(`docs/audits/2026-09-05-alpha-flow-audit/ai-control-${viewport.name}.png`), fullPage: true });
    if (outside.length) throw new Error(`AI_CONTROL_INTERACTIVE_OUTSIDE_VIEWPORT_${viewport.name}:${JSON.stringify(outside)}`);
    await page.keyboard.press("Tab");
    if (!await page.evaluate(() => document.activeElement !== document.body)) throw new Error(`AI_CONTROL_KEYBOARD_FOCUS_MISSING_${viewport.name}`);
    await page.close();
  }
} finally {
  await browser.close();
}
console.log("AI control responsive verification passed for 390px, 768px, and 1440px.");
