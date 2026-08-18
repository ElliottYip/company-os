import { access, readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const projects = [
  "paperclip", "agentos", "openworker", "operant", "preloop", "agentgate",
  "jamjet", "agent-room", "humanlayer-acp", "awaithumans",
];
const required = [
  "docs/adr/0007-paperclip-upstream-core.md",
  "docs/upstream-capability-matrix.md",
  "docs/upstream-adoption-plan.md",
  "docs/upstreams/paperclip-patch-ledger.md",
  "compatibility-tests/README.md",
  "compatibility-tests/paperclip-required-contract.json",
  "compatibility-tests/paperclip-versions.json",
  "compatibility-tests/snapshots/v2026.817.0.json",
  "docs/upstreams/paperclip-security-admission.md",
  "THIRD_PARTY_NOTICES.md",
  ...projects.map((project) => `docs/upstreams/${project}.md`),
];

const errors = [];
for (const path of required) {
  try {
    await access(join(root, path));
  } catch {
    errors.push(`missing governance file: ${path}`);
  }
}

try {
  const manifest = JSON.parse(
    await readFile(join(root, "compatibility-tests", "paperclip-versions.json"), "utf8"),
  );
  if (!/^v\d{4}\.\d+\.\d+$/.test(manifest.admitted?.tag ?? "")) {
    errors.push("Paperclip admitted version must be a stable tag");
  }
  if (!/^[0-9a-f]{40}$/.test(manifest.admitted?.commit ?? "")) {
    errors.push("Paperclip admitted version must use a full commit SHA");
  }
  if (manifest.admitted?.uiMode !== "none" || manifest.admitted?.serveUi !== false) {
    errors.push("Paperclip must remain API-only for the Company OS customer surface");
  }
  if (manifest.trainCadenceWeeks?.minimum !== 4 || manifest.trainCadenceWeeks?.maximum !== 6) {
    errors.push("Paperclip regular upgrade train must remain 4–6 weeks");
  }
} catch {
  errors.push("Paperclip compatibility manifest is missing or invalid JSON");
}

for (const project of projects) {
  const path = join(root, "docs", "upstreams", `${project}.md`);
  try {
    const source = await readFile(path, "utf8");
    if (!/\b[0-9a-f]{40}\b/.test(source)) errors.push(`${relative(root, path)} lacks a full commit SHA`);
    if (!/Decision:\s*\*\*(ADOPT|EXTEND|REFERENCE ONLY|REJECT)\*\*/.test(source)) {
      errors.push(`${relative(root, path)} lacks one explicit decision`);
    }
    if (!/License:/.test(source)) errors.push(`${relative(root, path)} lacks a license finding`);
  } catch {
    // Missing files are reported above.
  }
}

async function files(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await files(path));
    else output.push(path);
  }
  return output;
}

for (const directory of ["core", "application", "ports", "web"]) {
  for (const path of await files(join(root, directory))) {
    if (![".ts", ".tsx", ".js", ".mjs", ".css", ".html"].includes(extname(path))) continue;
    const source = await readFile(path, "utf8");
    if (/from\s+["'][^"']*paperclip/i.test(source)) {
      errors.push(`${relative(root, path)} directly imports Paperclip; use a future bridge adapter`);
    }
    if (/paperclip(?:ai)?\/(?:paperclip|ui)|paperclip-logo|paperclip-wordmark/i.test(source)) {
      errors.push(`${relative(root, path)} contains prohibited Paperclip brand/source coupling`);
    }
  }
}

if (errors.length) {
  console.error("Upstream governance violations:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("Upstream pins, decisions, notices, and no-direct-import rules are present.");
}
