import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const familyUi = await readFile(new URL("../web/family-ui.css", import.meta.url), "utf8");
const styles = await readFile(new URL("../web/styles.css", import.meta.url), "utf8");
const workforceStyles = await readFile(
  new URL("../web/workforce-graph/workforce-graph.css", import.meta.url),
  "utf8",
);

test("the Web exposes one semantic typography scale", () => {
  for (const token of [
    "--type-hero-title",
    "--type-page-title",
    "--type-detail-title",
    "--type-section-title",
    "--type-panel-title",
    "--type-lead",
    "--type-body",
    "--type-control",
    "--type-supporting",
    "--type-label",
    "--type-metric",
    "--weight-regular",
    "--weight-semibold",
    "--leading-display",
    "--space-4",
  ]) {
    assert.match(familyUi, new RegExp(`${token}:`));
  }
});

test("the shared shell establishes one inherited base type contract", () => {
  assert.match(familyUi, /--family-font-ui:\s*"SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Segoe UI", sans-serif;/);
  assert.match(familyUi, /\.family-ui:lang\(zh-CN\)\s*\{\s*font-family:\s*var\(--family-font-ui\);\s*\}/);
  assert.match(familyUi, /font-size:\s*var\(--type-body\);/);
  assert.match(familyUi, /font-weight:\s*var\(--weight-regular\);/);
  assert.match(familyUi, /line-height:\s*var\(--leading-body\);/);
  assert.match(familyUi, /:where\(h1, h2, h3, h4, h5, h6\)[^}]*font-weight:\s*var\(--weight-bold\)/);
  assert.match(familyUi, /:where\(strong, b\)[^}]*font-weight:\s*var\(--weight-semibold\)/);
  assert.match(familyUi, /--weight-regular:\s*400;/);
  assert.match(familyUi, /--weight-medium:\s*500;/);
  assert.match(familyUi, /--weight-semibold:\s*600;/);
  assert.match(familyUi, /--weight-bold:\s*600;/);
  assert.match(familyUi, /--family-radius-badge:\s*0\.25rem;/);
  assert.match(familyUi, /--family-radius-action:\s*0\.375rem;/);
  assert.match(familyUi, /--family-font-ui:/);
  assert.match(familyUi, /--family-radius-control:\s*0\.375rem;/);
  assert.match(familyUi, /--family-radius-panel:\s*0\.5rem;/);
  assert.match(familyUi, /\.family-button\s*\{[^}]*border-radius:\s*var\(--family-radius-action\)/s);
  assert.match(familyUi, /\.family-button\s*\{[^}]*font-family:\s*var\(--family-font-ui\)/s);
  assert.match(familyUi, /\.family-status\s*\{[^}]*border-radius:\s*var\(--family-radius-badge\)/s);
  assert.match(styles, /\.status-pill\s*\{[^}]*border-radius:\s*var\(--family-radius-badge\)/s);
  assert.match(styles, /\.portfolio-badge\s*\{[^}]*border-radius:\s*var\(--family-radius-badge\)/s);
  assert.match(styles, /\.topbar-company\s*\{[^}]*border-radius:\s*var\(--family-radius-badge\)/s);
});

test("the content lane uses the compact Generator-informed type scale", () => {
  for (const [token, value] of [
    ["--type-page-title", "1.25rem"],
    ["--type-detail-title", "1rem"],
    ["--type-section-title", "0.875rem"],
    ["--type-panel-title", "0.8125rem"],
    ["--type-body", "0.8125rem"],
    ["--type-label", "0.6875rem"],
    ["--type-micro", "0.625rem"],
    ["--type-metric", "1.25rem"],
  ]) {
    assert.match(familyUi, new RegExp(`${token}:\\s*${value.replace(".", "\\.")};`));
  }
  assert.match(styles, /\.workspace\s*\{[^}]*font-size:\s*var\(--type-body\)/s);
});

test("every application surface consumes the same family and semantic type contract", () => {
  assert.doesNotMatch(styles, /Inter Variable/);
  assert.match(familyUi, /--family-font-mono:/);
  assert.match(familyUi, /:where\(h1\)[^}]*font-size:\s*var\(--type-page-title\)/s);
  assert.match(familyUi, /:where\(h2\)[^}]*font-size:\s*var\(--type-section-title\)/s);
  assert.match(familyUi, /:where\(p, li, dd, td\)[^}]*font-size:\s*var\(--type-body\)/s);
  assert.match(familyUi, /:where\(small, dt, th, label\)[^}]*font-size:\s*var\(--type-supporting\)/s);
  assert.match(workforceStyles, /\.workforce-graph-toolbar strong[^}]*font-size:\s*var\(--type-body\)/s);
  assert.match(workforceStyles, /\.workforce-node-copy strong[^}]*font-size:\s*var\(--type-body\)/s);
  assert.doesNotMatch(workforceStyles, /linear-gradient\(135deg, #c7b8ff/);
  assert.doesNotMatch(workforceStyles, /#6048e5|#7b67ef|#6f58e7/);
});

test("the shared palette uses the Generator work-surface hierarchy and neutral routine states", () => {
  assert.match(familyUi, /--family-canvas:\s*#f6f7f9;/);
  assert.match(familyUi, /--family-surface:\s*#fff;/);
  assert.match(familyUi, /--family-surface-subtle:\s*#f3f5f8;/);
  assert.match(familyUi, /--family-line:\s*#e6e9ee;/);
  assert.match(familyUi, /--family-ink:\s*#111827;/);
  assert.match(familyUi, /\.family-status--working\s*\{[^}]*background:\s*var\(--family-surface-subtle\)[^}]*color:\s*var\(--family-ink-muted\)/s);
  assert.match(familyUi, /\.family-status--complete\s*\{[^}]*background:\s*var\(--family-surface-subtle\)[^}]*color:\s*var\(--family-ink-muted\)/s);
  assert.match(styles, /\.portfolio-badge\.demo,[\s\S]*?background:\s*var\(--family-surface-raised\)/);
  assert.match(styles, /\.portfolio-dashboard-kpis\s*\{[^}]*border-block:\s*1px solid var\(--family-line\)/s);
});

test("the front door presents a visibly distinct Generator-informed entry composition", () => {
  assert.match(familyUi, /--type-display:\s*clamp\(3rem, 5\.4vw, 4\.75rem\);/);
  assert.match(styles, /\.front-door-content\s*\{[^}]*width:\s*min\(100% - 40px, 980px\)[^}]*justify-items:\s*center[^}]*text-align:\s*center/s);
  assert.match(styles, /\.front-door-actions\s*\{[^}]*display:\s*flex[^}]*justify-content:\s*center/s);
  assert.match(styles, /\.front-door-primary, \.front-door-secondary\s*\{[^}]*min-height:\s*42px[^}]*border-radius:\s*var\(--family-radius-action\)/s);
  assert.match(styles, /\.front-door-primary small, \.front-door-secondary small\s*\{\s*display:\s*none;/);
});

test("alignment and wrapping are repository-owned contracts", () => {
  for (const token of [
    "--layout-page-max",
    "--layout-page-gutter",
    "--layout-rail-width",
    "--layout-topbar-height",
    "--layout-section-inset",
    "--layout-row-inset",
    "--control-height",
    "--control-height-comfortable",
    "--text-measure-title",
    "--text-measure-body",
  ]) {
    assert.match(familyUi, new RegExp(`${token}:`));
  }
  assert.match(familyUi, /\.family-ui :where\(p, dd, li\)[^}]*overflow-wrap:\s*break-word/s);
  assert.match(familyUi, /\[data-technical-value\][^}]*overflow-wrap:\s*anywhere/s);
  assert.match(familyUi, /\.family-one-line[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s);
  assert.match(familyUi, /\.family-two-lines[^}]*-webkit-line-clamp:\s*2/s);
  assert.match(familyUi, /\.family-numeric[^}]*font-variant-numeric:\s*tabular-nums[^}]*text-align:\s*right/s);
  assert.match(styles, /\.control-page-title h1[^}]*max-width:\s*var\(--text-measure-title\)[^}]*text-wrap:\s*balance/s);
  assert.match(styles, /\.control-page-title > div > p:not\(\.family-kicker\)[^}]*max-width:\s*var\(--text-measure-body\)[^}]*text-wrap:\s*pretty/s);
  for (const selector of [
    ".control-agent-card",
    ".control-metric-grid > button",
    ".approval-list-row",
    ".connector-row",
    ".admin-row",
    ".settings-list > div",
    ".settings-member-row",
    ".roster-row",
    ".product-record-row",
  ]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(styles, new RegExp(`${escaped}[^}]*padding:\\s*var\\(--layout-row-inset\\) var\\(--layout-section-inset\\)`, "s"));
  }
});

test("the content lane stays optically aligned with the navigation rail", () => {
  assert.match(styles, /\.control-page-title > div > p:not\(\.family-kicker\)[^}]*font-size:\s*var\(--type-body\)/);
  assert.match(styles, /\.company-os\s*\{[^}]*grid-template-columns:\s*var\(--layout-rail-width\) minmax\(0, 1fr\)/s);
  assert.match(styles, /\.topbar\s*\{[^}]*min-height:\s*var\(--layout-topbar-height\)/s);
  assert.match(styles, /\.workspace\s*\{[^}]*height:\s*calc\(100% - var\(--layout-topbar-height\)\)/s);
  assert.match(styles, /\.portfolio-agent-card > div:first-child > p:last-child[^}]*font-size:\s*var\(--type-body\)/);
  assert.match(styles, /\.portfolio-agent-card dt[^}]*font-size:\s*var\(--type-label\)/);
  assert.match(styles, /\.portfolio-agent-card dd,[\s\S]*?font-size:\s*var\(--type-supporting\)/);
  assert.match(styles, /\.portfolio-agent-card\s*\{[^}]*grid-template-columns:[^}]*border-bottom:\s*1px solid var\(--family-line\)/s);
  assert.match(styles, /\.portfolio-agent-grid\s*\{[^}]*grid-template-columns:\s*1fr;[^}]*gap:\s*0;/s);
  assert.match(styles, /\.portfolio-governance-grid h3[^}]*font-size:\s*var\(--type-section-title\)/);
  assert.match(styles, /\.company-form-control[^}]*line-height:\s*var\(--leading-compact\)/);
  assert.match(styles, /\.portfolio-work-list\s*\{[^}]*gap:\s*0;[^}]*border:\s*1px solid var\(--family-line\)/s);
});

test("organization secondary views keep one scan grid and reflow before the tablet lane becomes cramped", () => {
  assert.match(styles, /\.organization-toolbar\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;[^}]*border:\s*1px solid var\(--family-line\)/s);
  assert.match(styles, /\.organization-department > header > div:last-child\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center/s);
  assert.match(styles, /\.organization-department > header > div:last-child > span\s*\{[^}]*font-size:\s*var\(--type-label\)/s);
  assert.match(styles, /\.organization-people\s*\{\s*display:\s*grid;\s*\}/s);
  assert.match(styles, /\.colleague-row\s*\{[^}]*border-bottom:\s*1px solid var\(--family-line\);[^}]*border-radius:\s*0;/s);
  assert.match(styles, /@media \(max-width: 1180px\)[\s\S]*?\.control-page-title--actions\s*\{\s*flex-direction:\s*column;\s*\}[\s\S]*?\.organization-grid\s*\{\s*grid-template-columns:\s*1fr;\s*\}/);
  assert.match(styles, /@media \(max-width: 860px\)[\s\S]*?\.portfolio-recent-work table\s*\{[^}]*table-layout:\s*fixed;[^}]*\}[\s\S]*?\.portfolio-recent-work th:nth-child\(3\),[\s\S]*?display:\s*none;/);
  assert.doesNotMatch(styles, /\.colleague-row:hover\s*\{\s*background:\s*#f8f8f6;/);
  assert.doesNotMatch(styles, /\.roster-row:hover\s*\{\s*background:\s*#fafaf8;/);
});

test("primary product surfaces use semantic type tokens instead of local sizes", () => {
  for (const selector of [
    ".control-page-title h1",
    ".control-section > header h2",
    ".control-agent-card strong",
    ".control-agent-card small",
    ".control-metric-grid dd",
    ".control-task-row strong",
    ".product-record-row strong",
    ".settings-list dt",
    ".settings-list dd",
    ".dashboard-hero h1",
    ".dashboard-metrics dd",
    ".task-record-heading h2",
    ".governance-grid strong",
    ".colleague-detail-dialog h2",
  ]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(styles, new RegExp(`${escaped}[^}]*font-size:\\s*var\\(--type-`));
  }
});

test("primary shell copy never drops below the label size", () => {
  for (const selector of [
    ".sidebar-brand span",
    ".sidebar-section-label",
    ".environment-row small",
    ".control-section > header p",
    ".control-agent-card small",
    ".control-agent-card em",
    ".control-task-row small",
    ".control-task-row em",
  ]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(styles, new RegExp(`${escaped}[^}]*font-size:\\s*var\\(--type-(?:label|supporting|body|control)`));
  }
});

test("customer-facing text families use semantic size and weight roles", () => {
  for (const selector of [
    ".topbar p",
    ".event-row-meta time",
    ".event-row-meta strong",
    ".event-row-content > p",
    ".work-item-body h2",
    ".work-summary",
    ".work-facts dt, .contract-facts dt",
    ".work-facts dd, .contract-facts dd",
    ".organization-tabs button",
    ".dialog-state strong",
    ".dialog-state p",
    ".command-search input",
    ".command-result strong",
    ".command-result small",
    ".command-empty",
    ".command-hint",
    ".responsibility-policy-editor summary",
    ".responsibility-policy-editor form > p",
  ]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(styles, new RegExp(`${escaped}[^}]*font-size:\\s*var\\(--type-`));
  }
  for (const selector of [
    ".control-page-title h1",
    ".control-alert button, .control-section > header button",
    ".work-facts dd, .contract-facts dd",
    ".settings-navigation button",
    ".settings-navigation button[aria-selected=\"true\"]",
    ".product-filter-tabs button[aria-selected=\"true\"]",
  ]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(styles, new RegExp(`${escaped}[^}]*font-weight:\\s*var\\(--weight-`));
  }
});

test("working surfaces do not fork the shared page geometry or component shape", () => {
  assert.match(styles, /\.control-task-list, \.control-task-detail\s*\{[^}]*margin:\s*0 auto;/s);
  assert.match(styles, /\.control-accountability, \.control-administration\s*\{[^}]*margin:\s*0 auto;/s);
  assert.match(styles, /\.control-organization\s*\{[^}]*margin:\s*0 auto;/s);
  assert.match(styles, /\.responsibility-policy-row\s*\{[^}]*border-radius:\s*var\(--family-radius-panel\)/s);
  assert.match(workforceStyles, /\.workforce-graph-shell \.react-flow__controls\s*\{[^}]*border-radius:\s*var\(--family-radius-control\)[^}]*box-shadow:\s*none;/s);
  assert.match(workforceStyles, /\.workforce-detail\s*\{[^}]*padding:\s*var\(--space-4\)[^}]*box-shadow:\s*var\(--family-shadow-overlay\)/s);
  for (const selector of [
    ".family-nav-item",
    ".control-new-button",
    ".control-search",
    ".control-view-controls",
    ".sidebar-company-menu > button",
    ".command-close",
    ".command-result > span:first-child",
    ".mobile-bottom-nav button",
  ]) {
    const source = selector === ".family-nav-item" ? familyUi : styles;
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(source, new RegExp(`${escaped}[^}]*border-radius:\\s*var\\(--family-radius-`, "s"));
  }
  assert.match(styles, /\.company-restore-dialog form\s*\{[^}]*gap:\s*var\(--space-3\)[^}]*padding:\s*var\(--space-4\)/s);
});
