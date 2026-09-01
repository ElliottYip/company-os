import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(
  new URL("../web/pages/agent-portfolio-pages.ts", import.meta.url),
  "utf8",
);
const styles = await readFile(new URL("../web/styles.css", import.meta.url), "utf8");

test("the Demo Dashboard is an operational console rather than a promotional path", () => {
  for (const selector of [
    "portfolio-dashboard-console",
    "portfolio-dashboard-kpis",
    "portfolio-management-coverage",
    "portfolio-attention-queue",
    "portfolio-recent-work",
  ]) {
    assert.match(page, new RegExp(selector));
    assert.match(styles, new RegExp(`\\.${selector}`));
  }

  assert.doesNotMatch(page, /class="portfolio-attention"/);
  assert.doesNotMatch(page, /class="portfolio-demo-path"/);
  assert.match(page, /<progress max=/);
  assert.match(page, /<table><thead>/);
});

test("Dashboard values stay derived from the deterministic snapshot", () => {
  assert.match(page, /snapshot\.agents\.filter/);
  assert.match(page, /snapshot\.work\.reduce/);
  assert.match(page, /snapshot\.governed\.evidenceReferences\.length/);
  assert.match(page, /snapshot\.commercial\.renewals\.length/);
  assert.match(page, /snapshot\.generation/);
  assert.match(page, /snapshot\.revision/);
});

test("Dashboard exposes provenance on demand and aligns numeric columns", () => {
  assert.match(page, /portfolio-dashboard-provenance/);
  assert.match(page, /<summary>\$\{c\("Data source", "数据来源"\)\}<\/summary>/);
  assert.match(page, /data-technical-value/);
  assert.match(page, /class="family-numeric"/);
  assert.doesNotMatch(page, /AGENT PORTFOLIO · DETERMINISTIC DEMO/);
});

test("the Work page uses a compact execution register instead of stacked promo cards", () => {
  assert.match(page, /portfolio-work-summary[\s\S]*?<dl><div><dt>/);
  assert.match(page, /class="portfolio-work-identity"/);
  assert.match(page, /class="portfolio-work-outcome"/);
  assert.match(styles, /\.portfolio-work-row\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(12rem, 1\.2fr\) minmax\(22rem, 2fr\) minmax\(8rem, \.55fr\)/s);
  assert.match(styles, /\.portfolio-work-summary\s*\{[^}]*background:\s*var\(--family-surface\);[^}]*padding:\s*var\(--space-4\)/s);
  assert.match(styles, /@media \(max-width: 1180px\)[\s\S]*?\.portfolio-work-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/);
  assert.match(styles, /@media \(max-width: 680px\)[\s\S]*?\.portfolio-work-summary\s*\{[^}]*grid-template-columns:\s*1fr;/);
  assert.doesNotMatch(styles, /\.portfolio-work-row a\s*\{[^}]*color:\s*#9b431e/s);
});
