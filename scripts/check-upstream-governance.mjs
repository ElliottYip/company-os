import { access, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const projects = [
  "paperclip", "agentos", "openworker", "operant", "preloop", "agentgate",
  "jamjet", "agent-room", "humanlayer-acp", "awaithumans",
];
const required = [
  "docs/adr/0008-independent-open-source-product.md",
  "docs/upstream-capability-matrix.md",
  "research/paperclip/README.md",
  "research/paperclip/audit-manifest.json",
  "THIRD_PARTY_NOTICES.md",
  ...projects.map((project) => `docs/upstreams/${project}.md`),
];
const errors = [];

for (const path of required) {
  try { await access(join(root, path)); }
  catch { errors.push(`missing research governance file: ${path}`); }
}

for (const project of projects) {
  const path = join(root, "docs", "upstreams", `${project}.md`);
  try {
    const source = await readFile(path, "utf8");
    if (!/\b[0-9a-f]{40}\b/.test(source)) errors.push(`${relative(root, path)} lacks a full commit SHA`);
    if (!/Decision:\s*\*\*(ADOPT-CODE|ADAPT|EXTEND|REFERENCE ONLY|REJECT)\*\*/.test(source)) {
      errors.push(`${relative(root, path)} lacks one explicit research decision`);
    }
    if (!/License:/.test(source)) errors.push(`${relative(root, path)} lacks a license finding`);
  } catch {
    // Missing files are reported above.
  }
}

try {
  const path = join(root, "research", "paperclip", "audit-manifest.json");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  if (!/^[0-9a-f]{40}$/.test(manifest.commit ?? "")) errors.push("Paperclip research pin needs a full commit SHA");
  if (manifest.license !== "MIT") errors.push("Paperclip research license finding changed or is missing");
  if (manifest.wholeProjectDecision !== "REFERENCE ONLY") errors.push("Paperclip whole-project decision must remain REFERENCE ONLY");
  if (manifest.runtimeDependency !== false) errors.push("Paperclip cannot be a Company OS runtime dependency");
  if (manifest.automaticCompatibility !== false) errors.push("Paperclip cannot be an automatic compatibility target");
  const requiredModules = new Set([
    "domain-model", "database-and-migrations", "task-execution-and-agent-runtime",
    "api-and-events", "plugin-sdk-and-adapters", "identity-permissions-and-tenancy",
    "approvals-audit-and-secrets", "testing-security-and-maintenance", "web-and-deployment",
  ]);
  for (const module of manifest.modules ?? []) requiredModules.delete(module.id);
  if (requiredModules.size) errors.push(`Paperclip audit manifest lacks modules: ${[...requiredModules].join(", ")}`);
  for (const copy of manifest.copiedCode ?? []) {
    for (const field of ["sourceFile", "sourceCommit", "license", "destinationFile", "localModifications", "verification"]) {
      if (!copy[field]) errors.push(`Paperclip copiedCode entry lacks ${field}`);
    }
    if (copy.sourceCommit !== manifest.commit) errors.push("Paperclip copied code must use the audited full SHA");
  }
} catch {
  errors.push("Paperclip competitive-audit manifest is missing or invalid JSON");
}

if (errors.length) {
  console.error("Competitive research governance violations:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("Competitive research pins, decisions, licenses, and provenance rules are valid.");
}
