import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const sourceFiles = [
  "web/mount.ts",
  "web/pages/operational-pages.ts",
];

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function handlerBound(tag, allSources) {
  const hooks = [...tag.matchAll(/\b(data-[a-z0-9-]+)(?:=|\s|>)/gi)].map((match) => match[1].toLowerCase());
  return hooks.some((hook) => allSources.includes(`[${hook}`));
}

function violationsForSource(path, source, allSources) {
  const violations = [];
  for (const match of source.matchAll(/<button\b[^>]*>/gi)) {
    if (!/type=["']submit["']|disabled/i.test(match[0]) && !handlerBound(match[0], allSources)) {
      violations.push(`${path}:${lineNumber(source, match.index)}:interactive button has no handler hook, submit semantics, or disabled state`);
    }
  }
  for (const match of source.matchAll(/<form\b[^>]*>/gi)) {
    if (!/method=["']dialog["']/i.test(match[0]) && !handlerBound(match[0], allSources)) {
      violations.push(`${path}:${lineNumber(source, match.index)}:form has no handler hook or dialog semantics`);
    }
  }
  for (const pattern of [
    { regex: /href=["']#["']/gi, message: "placeholder href is forbidden" },
    { regex: /href=["']javascript:/gi, message: "javascript URL is forbidden" },
    { regex: /\son(?:click|submit|change|input|keydown)\s*=/gi, message: "inline event handler is forbidden" },
  ]) {
    for (const match of source.matchAll(pattern.regex)) {
      violations.push(`${path}:${lineNumber(source, match.index)}:${pattern.message}`);
    }
  }
  return violations;
}

export function checkWebInteractionSources(sources) {
  const violations = [];
  const allSources = sources.map(([, source]) => source).join("\n");
  for (const [path, source] of sources) {
    violations.push(...violationsForSource(path, source, allSources));
  }
  if (violations.length) throw new Error(`WEB_INTERACTION_GUARD_FAILED\n${violations.join("\n")}`);
  return { checkedFiles: sources.length, status: "PASS" };
}

export async function checkWebInteractions(root = new URL("../", import.meta.url)) {
  const sources = [];
  for (const path of sourceFiles) {
    sources.push([path, await readFile(new URL(path, root), "utf8")]);
  }
  return checkWebInteractionSources(sources);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  checkWebInteractions().then((result) => {
    process.stdout.write(`Web interaction guard passed (${result.checkedFiles} customer-surface files).\n`);
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "WEB_INTERACTION_GUARD_FAILED"}\n`);
    process.exitCode = 1;
  });
}
