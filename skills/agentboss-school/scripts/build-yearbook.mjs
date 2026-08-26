#!/usr/bin/env node

import { rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildYearbookMarkdown, loadCredentialAuthority, readJson, validateYearbook, verifyCredential } from "./credential-lib.mjs";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const yearbook = await readJson(resolve(skillRoot, "credentials/yearbook.json"));
const yearbookErrors = validateYearbook(yearbook);
if (yearbookErrors.length > 0) throw new Error(`INVALID_YEARBOOK:\n- ${yearbookErrors.join("\n- ")}`);
const authority = await loadCredentialAuthority(skillRoot);
for (const entry of yearbook.entries) {
  const credential = await readJson(resolve(skillRoot, entry.verificationPath));
  const result = verifyCredential({ credential, ...authority });
  if (!result.valid) throw new Error(`YEARBOOK_CREDENTIAL_INVALID:${entry.credentialId}:${result.code}`);
  if (!credential.holder.yearbookConsent) throw new Error(`YEARBOOK_CONSENT_MISSING:${entry.credentialId}`);
}
const target = resolve(skillRoot, "YEARBOOK.md");
const temporary = `${target}.tmp`;
await writeFile(temporary, buildYearbookMarkdown(yearbook), "utf8");
await rename(temporary, target);
console.log(`Built AgentBoss School Yearbook: ${yearbook.entries.length} entries.`);
