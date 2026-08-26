#!/usr/bin/env node

import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { issueCredential, readJson } from "./credential-lib.mjs";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArguments(values) {
  const options = { input: null, privateKey: null, keyId: null, output: null, issuedAt: null, credentialId: null };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (["--input", "--private-key", "--key-id", "--output", "--issued-at", "--credential-id"].includes(value)) {
      const key = value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      options[key] = values[++index] ?? null;
      if (!options[key]) throw new Error(`${value} requires a value`);
    } else {
      throw new Error(`unknown argument: ${value}`);
    }
  }
  for (const key of ["input", "privateKey", "keyId", "output"]) if (!options[key]) throw new Error(`--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required`);
  return options;
}

const options = parseArguments(process.argv.slice(2));
const [submission, manifest, keyring, privateKeyPem] = await Promise.all([
  readJson(resolve(options.input)),
  readJson(resolve(skillRoot, "manifest.json")),
  readJson(resolve(skillRoot, "credentials/issuer-keys.json")),
  readFile(resolve(options.privateKey), "utf8"),
]);
const credential = issueCredential({
  submission,
  manifest,
  keyring,
  privateKeyPem,
  keyId: options.keyId,
  ...(options.issuedAt ? { issuedAt: options.issuedAt } : {}),
  ...(options.credentialId ? { credentialId: options.credentialId } : {}),
});
const output = resolve(options.output);
const temporary = `${output}.tmp`;
await writeFile(temporary, `${JSON.stringify(credential, null, 2)}\n`, { encoding: "utf8", mode: 0o644 });
await rename(temporary, output);
console.log(JSON.stringify({ status: "ISSUED", credentialId: credential.credentialId, output }, null, 2));
