export type RaftStatusTone =
  | "neutral"
  | "working"
  | "approval"
  | "blocked"
  | "complete";

export interface RaftPageHeaderOptions {
  readonly kicker: string;
  readonly title: string;
  readonly description: string;
  readonly status?: { readonly label: string; readonly tone: RaftStatusTone };
  readonly actions?: string;
}

export interface RaftMetric {
  readonly label: string;
  readonly value: string | number;
  readonly detail?: string;
}

export interface RaftSectionHeaderOptions {
  readonly title: string;
  readonly description?: string;
  readonly trailing?: string;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[
        character
      ] ?? character,
  );
}

export function raftStatus(label: string, tone: RaftStatusTone): string {
  return `<span class="family-status family-status--${tone}">${escapeHtml(label)}</span>`;
}

export function raftPageHeader(options: RaftPageHeaderOptions): string {
  const actions = options.actions
    ? `<div class="family-page-actions">${options.actions}</div>`
    : "";
  const status = options.status
    ? raftStatus(options.status.label, options.status.tone)
    : "";
  return `<header class="family-page-header">
    <div class="family-page-heading">
      <p class="family-kicker">${escapeHtml(options.kicker)}</p>
      <h1>${escapeHtml(options.title)}</h1>
      <p>${escapeHtml(options.description)}</p>
    </div>
    <div class="family-page-header-side">${status}${actions}</div>
  </header>`;
}

export function raftMetricStrip(
  metrics: readonly RaftMetric[],
  label: string,
): string {
  return `<dl class="family-metric-strip" aria-label="${escapeHtml(label)}">${metrics
    .map(
      (metric) => `<div>
        <dt>${escapeHtml(metric.label)}</dt>
        <dd>${escapeHtml(String(metric.value))}</dd>
        ${metric.detail ? `<small>${escapeHtml(metric.detail)}</small>` : ""}
      </div>`,
    )
    .join("")}</dl>`;
}

export function raftSectionHeader(options: RaftSectionHeaderOptions): string {
  return `<header class="family-section-header">
    <div><h2>${escapeHtml(options.title)}</h2>${options.description ? `<p>${escapeHtml(options.description)}</p>` : ""}</div>
    ${options.trailing ?? ""}
  </header>`;
}

export function raftTabs(items: readonly string[], active = items[0]): string {
  return `<nav class="family-tabs" aria-label="Page sections">${items
    .map(
      (item) =>
        `<button type="button"${item === active ? ' aria-current="page"' : ""}>${escapeHtml(item)}</button>`,
    )
    .join("")}</nav>`;
}

export function raftPanel(content: string, className = ""): string {
  return `<section class="family-panel ${className}">${content}</section>`;
}
