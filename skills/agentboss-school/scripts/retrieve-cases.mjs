#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateCorpusDigest, readCaseCatalog, retrieveCases } from "./case-rag-lib.mjs";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
  console.log("Usage: node scripts/retrieve-cases.mjs <query> [--top N] [--node node-id] [--industry tag] [--json]");
}

function parseArguments(values) {
  const queryParts = [];
  const options = { top: 3, node: null, industry: null, json: false };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--top") {
      const top = Number(values[++index]);
      if (!Number.isSafeInteger(top) || top < 1 || top > 20) throw new Error("--top must be an integer from 1 to 20");
      options.top = top;
    } else if (value === "--node") {
      options.node = values[++index] ?? null;
      if (!options.node) throw new Error("--node requires a node id");
    } else if (value === "--industry") {
      options.industry = values[++index] ?? null;
      if (!options.industry) throw new Error("--industry requires a tag");
    } else if (value === "--json") {
      options.json = true;
    } else if (value === "--help" || value === "-h") {
      usage();
      process.exit(0);
    } else if (value.startsWith("--")) {
      throw new Error(`unknown option: ${value}`);
    } else {
      queryParts.push(value);
    }
  }
  const query = queryParts.join(" ").trim();
  if (!query) throw new Error("query is required");
  return { query, options };
}

const { query, options } = parseArguments(process.argv.slice(2));
const indexPath = resolve(skillRoot, "rag/index.generated.json");
let index;
try {
  index = JSON.parse(await readFile(indexPath, "utf8"));
} catch (error) {
  throw new Error(`case index is missing or invalid; run node scripts/build-case-index.mjs first: ${error.message}`);
}
const catalog = await readCaseCatalog(skillRoot);
const digest = await calculateCorpusDigest(skillRoot, catalog);
if (digest !== index.corpusDigest) throw new Error("case index is stale; run node scripts/build-case-index.mjs before retrieval");

const results = retrieveCases(index, query, options);
if (options.json) {
  console.log(JSON.stringify({ schemaVersion: 1, query, resultCount: results.length, results }, null, 2));
} else if (results.length === 0) {
  console.log("No verified cases matched. Use the lesson example; do not invent a case.");
} else {
  for (const result of results) {
    console.log(`[${result.caseId}] ${result.title} · ${result.caseType} · ${result.evidenceQuality} · score ${result.score}`);
    console.log(`Section: ${result.heading}`);
    console.log("CASE_EVIDENCE_START");
    console.log(result.text);
    console.log("CASE_EVIDENCE_END\n");
  }
}
