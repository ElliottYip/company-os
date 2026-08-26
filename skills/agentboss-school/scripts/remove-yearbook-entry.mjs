#!/usr/bin/env node

import { rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildYearbookMarkdown, readJson, validateYearbook } from "./credential-lib.mjs";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const credentialId = process.argv[2];
if (!credentialId || process.argv.length !== 3) throw new Error("Usage: node scripts/remove-yearbook-entry.mjs <credential-id>");

const yearbookPath = resolve(skillRoot, "credentials/yearbook.json");
const yearbook = await readJson(yearbookPath);
const errors = validateYearbook(yearbook);
if (errors.length > 0) throw new Error(`INVALID_YEARBOOK:\n- ${errors.join("\n- ")}`);
const entry = yearbook.entries.find((candidate) => candidate.credentialId === credentialId);
if (!entry) {
  console.log(JSON.stringify({ status: "ALREADY_REMOVED", credentialId }, null, 2));
  process.exit(0);
}

yearbook.entries = yearbook.entries.filter((candidate) => candidate.credentialId !== credentialId);
const yearbookTemporary = `${yearbookPath}.tmp`;
await writeFile(yearbookTemporary, `${JSON.stringify(yearbook, null, 2)}\n`, "utf8");
await rename(yearbookTemporary, yearbookPath);
const markdownPath = resolve(skillRoot, "YEARBOOK.md");
const markdownTemporary = `${markdownPath}.tmp`;
await writeFile(markdownTemporary, buildYearbookMarkdown(yearbook), "utf8");
await rename(markdownTemporary, markdownPath);
try {
  await unlink(resolve(skillRoot, entry.verificationPath));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
console.log(JSON.stringify({ status: "REMOVED", credentialId, credentialStatusUnchanged: true }, null, 2));
