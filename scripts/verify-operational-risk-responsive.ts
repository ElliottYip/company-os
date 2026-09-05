import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { operationalRiskPage } from "../web/pages/operational-pages.ts";

const instant = "2026-09-05T08:12:02.971Z";
const traceId = "trace-fffc3b0a8ebb99bc974b855795fe900f";
const html = operationalRiskPage({ schemaVersion: 1, companyId: "company-one", generatedAt: instant,
  traces: [{ id: traceId, companyId: "company-one", workId: "work-customer-support", attemptId: "attempt-local-alpha",
    agentId: "agent-research", recordedAt: instant, spans: [{ id: "span-read-only-codex", parentSpanId: null,
      kind: "TOOL", name: "Codex CLI read-only execution", startedAt: "2026-09-05T08:11:40.000Z", endedAt: instant,
      status: "OK", resource: { type: "TOOL", id: "codex-cli", operation: "EXECUTE_READ_ONLY", authorityId: "proof-local-alpha" } }] }],
  accessEdges: [{ id: "edge-read-only-codex", companyId: "company-one", traceId, spanId: "span-read-only-codex",
    subjectAgentId: "agent-research", resourceType: "TOOL", resourceId: "codex-cli",
    operation: "EXECUTE_READ_ONLY", authorityId: "proof-local-alpha" }],
  violations: [{ id: "violation-one", companyId: "company-one", ruleId: "rule-codex-review", severity: "HIGH",
    agentId: "agent-research", workId: "work-customer-support", attemptId: "attempt-local-alpha", traceId,
    accessEdgeIds: ["edge-read-only-codex"], summary: "Review unexpected production tool execution", observedAt: instant }],
  alerts: [{ id: "alert-one", companyId: "company-one", violationId: "violation-one", severity: "HIGH",
    status: "CONTAINED", containment: "PAUSE_SUCCEEDED", openedAt: instant, resolvedAt: null }],
  cases: [{ id: "case-one", companyId: "company-one", alertIds: ["alert-one"], workId: "work-customer-support",
    agentId: "agent-research", accountableHumanId: "human-one", ownerHumanId: "human-one", status: "INVESTIGATING",
    revision: 2, containment: "PAUSE_SUCCEEDED", summary: "Review unexpected production tool execution",
    rootCause: null, remediation: null, prevention: null, openedAt: instant, updatedAt: instant, closedAt: null }],
}, { company: { id: "company-one", name: "Coral Labs", purpose: "Govern AI operations", locale: "en" },
  departments: [{ id: "operations", name: "Operations", mandate: "Govern operations" }],
  humans: [{ id: "human-one", name: "Alex Chen", title: "Operations owner", departmentId: "operations", avatarId: "human-default" }],
  agents: [{ id: "agent-research", name: "Research Agent with a deliberately long production name", role: "Research",
    departmentId: "operations", accountableHumanId: "human-one", autonomyLevel: 1, runtimeConnectorId: "http-agent-node" }],
}, "en", { companyId: "company-one", revision: 1, rules: [{ id: "rule-codex-review", resourceType: "TOOL",
  resourceId: "codex-cli", operation: "EXECUTE_READ_ONLY", severity: "HIGH", summary: "Review unexpected production tool execution" }] });

const css = `${await readFile(resolve("web/family-ui.css"), "utf8")}\n${await readFile(resolve("web/styles.css"), "utf8")}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const viewport of [{ name: "mobile", width: 390, height: 844 }, { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1440, height: 1000 }]) {
    const page = await browser.newPage({ viewport });
    await page.setContent(`<style>${css}</style><main class="company-os family-ui"><aside class="company-rail" aria-hidden="true"></aside><div class="app-main"><div class="workspace">${html}</div></div></main>`);
    const problems = await page.evaluate(() => {
      const issue: string[] = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) issue.push("document-overflow");
      for (const node of document.querySelectorAll<HTMLElement>("button,input,select,textarea,summary")) {
        const box = node.getBoundingClientRect();
        if (box.width && box.height && (box.left < -1 || box.right > innerWidth + 1)) issue.push(`control-outside:${node.tagName}`);
      }
      return issue;
    });
    if (problems.length) throw new Error(`RISK_RESPONSIVE_${viewport.name}:${problems.join(",")}`);
    await page.screenshot({ path: resolve(`docs/audits/2026-09-05-alpha-flow-audit/risk-access-case-${viewport.name}.png`), fullPage: true });
    await page.keyboard.press("Tab");
    if (!await page.evaluate(() => document.activeElement !== document.body)) throw new Error(`RISK_KEYBOARD_${viewport.name}`);
    await page.close();
  }
} finally {
  await browser.close();
}
console.log("Operational risk responsive verification passed for 390px, 768px, and 1440px.");
