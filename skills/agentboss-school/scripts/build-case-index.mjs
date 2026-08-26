#!/usr/bin/env node

import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCaseIndex } from "./case-rag-lib.mjs";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(resolve(skillRoot, "manifest.json"), "utf8"));
const knownNodes = new Set(manifest.nodes.map(({ id }) => id));
const index = await buildCaseIndex(skillRoot, knownNodes);
const target = resolve(skillRoot, "rag/index.generated.json");
const temporary = `${target}.tmp`;

await writeFile(temporary, `${JSON.stringify(index, null, 2)}\n`, "utf8");
await rename(temporary, target);
console.log(`Built AgentBoss School case index: ${index.caseCount} cases, ${index.chunks.length} chunks, ${index.corpusDigest}`);
