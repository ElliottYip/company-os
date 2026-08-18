import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { execFileSync } from "node:child_process";

const scannable = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".yml", ".yaml", ".md", ".env"]);
const excluded = new Set([
  "package-lock.json",
  "docs/licenses/RAFT-APACHE-2.0.txt",
]);
const patterns = [
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/\bgh[pousr]_[A-Za-z0-9_]{30,}\b/, "GitHub token"],
  [/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/, "Slack token"],
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/, "model-provider key"],
  [/Authorization\s*:\s*["'`]Bearer\s+[A-Za-z0-9._~+\/-]{16,}/i, "literal bearer token"],
  [/(?:password|secret|api[_-]?key)\s*[:=]\s*["'`][^"'`\s]{12,}["'`]/i, "literal secret assignment"],
];

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .trim().split("\n").filter(Boolean)
  .filter((path) => !excluded.has(path) && !path.startsWith("web/assets/") && scannable.has(extname(path)));

const findings = [];
for (const path of files) {
  const source = await readFile(path, "utf8");
  for (const [pattern, label] of patterns) {
    if (pattern.test(source)) findings.push(`${path}: ${label}`);
  }
}

if (findings.length) {
  console.error("Potential Company OS secrets detected:\n");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log(`Company OS secret scan passed (${files.length} text files).`);
}
