import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const familyUi = await readFile(new URL("../web/family-ui.css", import.meta.url), "utf8");
const styles = await readFile(new URL("../web/styles.css", import.meta.url), "utf8");

test("the Web exposes one semantic typography scale", () => {
  for (const token of [
    "--type-page-title",
    "--type-section-title",
    "--type-body",
    "--type-control",
    "--type-supporting",
    "--type-label",
    "--type-metric",
  ]) {
    assert.match(familyUi, new RegExp(`${token}:`));
  }
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
