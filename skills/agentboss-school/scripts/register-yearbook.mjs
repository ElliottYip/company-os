#!/usr/bin/env node

import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildYearbookMarkdown, loadCredentialAuthority, readJson, validateYearbook, verifyCredential } from "./credential-lib.mjs";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const credentialPath = process.argv[2];
if (!credentialPath || process.argv.length !== 3) throw new Error("Usage: node scripts/register-yearbook.mjs <credential.json>");
const credential = await readJson(resolve(credentialPath));
const authority = await loadCredentialAuthority(skillRoot);
const verification = verifyCredential({ credential, ...authority });
if (!verification.valid) throw new Error(`CREDENTIAL_NOT_VALID:${verification.code}`);
if (!credential.holder.yearbookConsent) throw new Error("YEARBOOK_CONSENT_REQUIRED");

const issuedDirectory = resolve(skillRoot, "credentials/issued");
await mkdir(issuedDirectory, { recursive: true });
const publicCredentialPath = resolve(issuedDirectory, `${credential.credentialId}.json`);
try {
  const existing = await readFile(publicCredentialPath, "utf8");
  if (existing !== `${JSON.stringify(credential, null, 2)}\n`) throw new Error("CREDENTIAL_ID_CONFLICT");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  await copyFile(resolve(credentialPath), publicCredentialPath);
}

const yearbookPath = resolve(skillRoot, "credentials/yearbook.json");
const yearbook = await readJson(yearbookPath);
const yearbookErrors = validateYearbook(yearbook);
if (yearbookErrors.length > 0) throw new Error(`INVALID_YEARBOOK:\n- ${yearbookErrors.join("\n- ")}`);
const entry = {
  credentialId: credential.credentialId,
  publicName: credential.holder.publicName,
  publicHandle: credential.holder.publicHandle,
  profileUrl: credential.holder.profileUrl,
  credentialName: credential.credentialName.en,
  cohort: credential.cohort,
  courseVersion: credential.courseVersion,
  issuedAt: credential.issuedAt,
  verificationPath: `credentials/issued/${credential.credentialId}.json`,
};
const existingEntry = yearbook.entries.find((candidate) => candidate.credentialId === entry.credentialId);
if (existingEntry && JSON.stringify(existingEntry) !== JSON.stringify(entry)) throw new Error("YEARBOOK_ENTRY_CONFLICT");
if (!existingEntry) yearbook.entries.push(entry);
yearbook.entries.sort((left, right) => left.issuedAt.localeCompare(right.issuedAt) || left.credentialId.localeCompare(right.credentialId));
const updatedYearbookErrors = validateYearbook(yearbook);
if (updatedYearbookErrors.length > 0) throw new Error(`INVALID_YEARBOOK:\n- ${updatedYearbookErrors.join("\n- ")}`);

const yearbookTemporary = `${yearbookPath}.tmp`;
await writeFile(yearbookTemporary, `${JSON.stringify(yearbook, null, 2)}\n`, "utf8");
await rename(yearbookTemporary, yearbookPath);
const markdownPath = resolve(skillRoot, "YEARBOOK.md");
const markdownTemporary = `${markdownPath}.tmp`;
await writeFile(markdownTemporary, buildYearbookMarkdown(yearbook), "utf8");
await rename(markdownTemporary, markdownPath);
console.log(JSON.stringify({ status: existingEntry ? "ALREADY_REGISTERED" : "REGISTERED", credentialId: credential.credentialId }, null, 2));
