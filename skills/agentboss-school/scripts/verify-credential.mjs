#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCredentialAuthority, readJson, verifyCredential } from "./credential-lib.mjs";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const path = process.argv[2];
if (!path || process.argv.length !== 3) throw new Error("Usage: node scripts/verify-credential.mjs <credential.json>");
const [credential, authority] = await Promise.all([
  readJson(resolve(path)),
  loadCredentialAuthority(skillRoot),
]);
const result = verifyCredential({ credential, ...authority });
console.log(JSON.stringify({ ...result, credentialId: credential.credentialId ?? null }, null, 2));
if (!result.valid) process.exitCode = 1;
