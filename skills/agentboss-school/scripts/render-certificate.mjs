#!/usr/bin/env node

import { rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCredentialAuthority, readJson, verifyCredential } from "./credential-lib.mjs";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const values = process.argv.slice(2);
const credentialPath = values[0];
const outputIndex = values.indexOf("--output");
const outputPath = outputIndex >= 0 ? values[outputIndex + 1] : null;
if (!credentialPath || !outputPath) throw new Error("Usage: node scripts/render-certificate.mjs <credential.json> --output <certificate.html>");

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
}

const credential = await readJson(resolve(credentialPath));
const authority = await loadCredentialAuthority(skillRoot);
const result = verifyCredential({ credential, ...authority });
if (!result.valid) throw new Error(`CREDENTIAL_NOT_VALID:${result.code}`);
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(credential.credentialName.en)} · ${escapeHtml(credential.holder.publicName)}</title>
<style>
@page{size:A4 landscape;margin:0}*{box-sizing:border-box}body{margin:0;background:#eee;font-family:ui-serif,Georgia,"Noto Serif SC",serif;color:#16231d}.sheet{width:297mm;height:210mm;margin:auto;background:#f8f5ec;padding:16mm;display:grid}.frame{border:1.5mm solid #173c2d;outline:.4mm solid #b8954b;outline-offset:-4mm;padding:18mm;text-align:center;display:flex;flex-direction:column;justify-content:center}.eyebrow{font:600 10pt ui-sans-serif,sans-serif;letter-spacing:.22em;color:#7a632c}.name{font-size:31pt;margin:8mm 0 4mm;border-bottom:.3mm solid #b8954b;padding-bottom:3mm}.title{font-size:24pt;margin:2mm}.subtitle{font:500 12pt ui-sans-serif,sans-serif;color:#47564e}.body{font-size:13pt;line-height:1.8;margin:8mm auto;max-width:205mm}.meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8mm;font:10pt ui-sans-serif,sans-serif;text-align:left;border-top:.3mm solid #b8954b;padding-top:6mm}.label{font-size:8pt;text-transform:uppercase;letter-spacing:.12em;color:#6b756f}.fine{font:8pt ui-sans-serif,sans-serif;color:#69736e;margin-top:5mm}@media print{body{background:#fff}.sheet{margin:0}}
</style></head><body><main class="sheet"><section class="frame">
<div class="eyebrow">AGENTBOSS SCHOOL · ISSUER-VERIFIED COURSE CREDENTIAL</div>
<h1 class="title">${escapeHtml(credential.credentialName.zh)}</h1><div class="subtitle">${escapeHtml(credential.credentialName.en)}</div>
<div class="body">兹证明 <div class="name">${escapeHtml(credential.holder.publicName)}</div> 已完成 Agent Boss Foundations 课程要求，通过责任闭环实践与发行方审核。</div>
<div class="meta"><div><div class="label">Credential ID</div>${escapeHtml(credential.credentialId)}</div><div><div class="label">Cohort / Course</div>${escapeHtml(credential.cohort)} · v${escapeHtml(credential.courseVersion)}</div><div><div class="label">Issued / Signature</div>${escapeHtml(credential.issuedAt.slice(0,10))} · ${escapeHtml(credential.signature.keyId)}</div></div>
<div class="fine">${escapeHtml(credential.disclaimer)} Verify against the signed JSON credential and AgentBoss School issuer keyring.</div>
</section></main></body></html>`;
const output = resolve(outputPath);
const temporary = `${output}.tmp`;
await writeFile(temporary, html, "utf8");
await rename(temporary, output);
console.log(`Rendered verified certificate to ${output}`);
