import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const styleFiles = [
  "web/family-ui.css",
  "web/styles.css",
  "web/workforce-graph/workforce-graph.css",
];

const requiredTokens = [
  "--family-font-ui",
  "--family-font-mono",
  "--type-page-title",
  "--type-detail-title",
  "--type-section-title",
  "--type-panel-title",
  "--type-body",
  "--type-control",
  "--type-supporting",
  "--type-label",
  "--type-micro",
  "--type-metric",
  "--type-visual-label",
  "--icon-glyph-sm",
  "--icon-glyph-md",
  "--icon-glyph-lg",
  "--icon-glyph-xl",
  "--weight-regular",
  "--weight-medium",
  "--weight-semibold",
  "--leading-title",
  "--leading-body",
  "--leading-compact",
  "--leading-display-tight",
  "--leading-display-compact",
  "--leading-lead",
  "--leading-metric",
  "--leading-icon",
  "--leading-none",
  "--layout-page-max",
  "--layout-page-gutter",
  "--layout-section-inset",
  "--layout-row-inset",
  "--control-height",
  "--control-height-comfortable",
  "--overlay-edge",
  "--overlay-modal-width",
  "--overlay-drawer-width",
];

const allowedMaxBreakpoints = new Set([420, 560, 680, 760, 860, 960, 1080, 1180]);
const allowedMinBreakpoints = new Set([861]);

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function declarationViolations(path, source, property, allowed) {
  const violations = [];
  const expression = new RegExp(`${property}\\s*:\\s*([^;}]+)`, "gi");
  for (const match of source.matchAll(expression)) {
    const value = match[1].replace(/\s*!important\s*$/i, "").trim();
    if (!allowed(value)) {
      violations.push(`${path}:${lineNumber(source, match.index)}:${property} must use the shared semantic contract, found ${value}`);
    }
  }
  return violations;
}

export function checkWebVisualContractSources(sources) {
  const violations = [];
  const familyUi = sources.find(([path]) => path === "web/family-ui.css")?.[1] ?? "";
  const declaredTokens = new Set([...familyUi.matchAll(/(--(?:type|icon-glyph|weight|leading)-[a-z0-9-]+)\s*:/gi)].map((match) => match[1]));
  const referencesDeclaredToken = (value, prefixes) => {
    const match = value.match(/^var\((--[a-z0-9-]+)\)$/i);
    return Boolean(match && prefixes.some((prefix) => match[1].startsWith(prefix)) && declaredTokens.has(match[1]));
  };

  for (const token of requiredTokens) {
    if (!familyUi.includes(`${token}:`)) violations.push(`web/family-ui.css:missing required visual token ${token}`);
  }

  for (const [path, source] of sources) {
    violations.push(...declarationViolations(path, source, "font-size", (value) =>
      value === "0" || value === "inherit" || referencesDeclaredToken(value, ["--type-", "--icon-glyph-"]),
    ));
    violations.push(...declarationViolations(path, source, "font-weight", (value) =>
      value === "inherit" || referencesDeclaredToken(value, ["--weight-"]),
    ));
    violations.push(...declarationViolations(path, source, "line-height", (value) =>
      value === "inherit" || value === "normal" || referencesDeclaredToken(value, ["--leading-"]),
    ));
    violations.push(...declarationViolations(path, source, "font-family", (value) =>
      value === "inherit" || value === "var(--family-font-ui)" || value === "var(--family-font-mono)" ||
      value === '"SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Segoe UI", sans-serif',
    ));
    violations.push(...declarationViolations(path, source, "font", (value) =>
      value === "inherit",
    ));

    for (const match of source.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/gi)) {
      const width = Number(match[1]);
      if (!allowedMaxBreakpoints.has(width)) violations.push(`${path}:${lineNumber(source, match.index)}:uncontracted max-width breakpoint ${width}px`);
    }
    for (const match of source.matchAll(/@media\s*\(min-width:\s*(\d+)px\)/gi)) {
      const width = Number(match[1]);
      if (!allowedMinBreakpoints.has(width)) violations.push(`${path}:${lineNumber(source, match.index)}:uncontracted min-width breakpoint ${width}px`);
    }
  }

  const combinedStyles = sources.map(([, source]) => source).join("\n");
  if (!/\.page-stage\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*var\(--layout-page-max\);[^}]*margin-inline:\s*auto;/s.test(combinedStyles)) {
    violations.push("web/styles.css:page-stage must own the shared centered content lane");
  }
  const centeredPageSelectors = new Set([
    ".control-dashboard", ".control-task-list", ".control-task-detail", ".control-organization",
    ".control-accountability", ".control-administration", ".control-settings", ".product-list-page",
  ]);
  for (const block of combinedStyles.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!block[1].split(",").some((selector) => centeredPageSelectors.has(selector.trim()))) continue;
    for (const declaration of block[2].matchAll(/(?:^|;)\s*(margin|margin-inline)\s*:\s*([^;]+)/g)) {
      const value = declaration[2].replace(/\s*!important\s*$/i, "").trim().replace(/\s+/g, " ");
      if ((declaration[1] === "margin" && value !== "0 auto") || (declaration[1] === "margin-inline" && value !== "auto")) {
        violations.push(`web/styles.css:page-level product surfaces must preserve centered margins, found ${declaration[1]}: ${value}`);
      }
    }
  }

  if (violations.length) throw new Error(`WEB_VISUAL_CONTRACT_FAILED\n${violations.join("\n")}`);
  return { checkedFiles: sources.length, status: "PASS" };
}

export async function checkWebVisualContract(root = new URL("../", import.meta.url)) {
  const sources = [];
  for (const path of styleFiles) sources.push([path, await readFile(new URL(path, root), "utf8")]);
  return checkWebVisualContractSources(sources);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  checkWebVisualContract().then((result) => {
    process.stdout.write(`Web visual contract passed (${result.checkedFiles} style files).\n`);
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "WEB_VISUAL_CONTRACT_FAILED"}\n`);
    process.exitCode = 1;
  });
}
