import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const protectedRoots = ["core", "ports", "application"];
const allowedImports = {
  core: new Set(["core"]),
  ports: new Set(["core", "ports"]),
  application: new Set(["core", "ports", "application"]),
};
const banned = [
  [/\bnostr\b/i, "transport/event implementation"],
  [/\bnip-?07\b/i, "identity mechanism"],
  [/\brelay\b/i, "event transport"],
  [/\bbuzz\b/i, "host implementation"],
  [/\bacp\b/i, "runtime protocol"],
  [/\braft\b/i, "host or agent product"],
  [/\bcodex\b/i, "agent product"],
  [/\bdeepseek\b/i, "model or agent product"],
  [/\breact\b/i, "Web framework"],
  [/\bwindow\s*\./i, "browser runtime"],
  [/\blocalstorage\b/i, "browser persistence"],
];
const importPattern = /(?:from\s+|import\s*)["']([^"']+)["']/g;

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    if (entry.isFile() && [".ts", ".tsx"].includes(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
}

function importedLayer(path, specifier) {
  if (!specifier.startsWith(".")) return "external-package";
  const target = resolve(path, "..", specifier);
  const local = relative(root, target);
  return local.split("/")[0];
}

const violations = [];
for (const layer of protectedRoots) {
  for (const path of await sourceFiles(join(root, layer))) {
    const source = await readFile(path, "utf8");
    for (const [pattern, reason] of banned) {
      if (pattern.test(source)) {
        violations.push(`${relative(root, path)} contains ${reason}`);
      }
    }
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      if (!specifier) continue;
      const dependencyLayer = importedLayer(path, specifier);
      if (!allowedImports[layer].has(dependencyLayer)) {
        violations.push(
          `${relative(root, path)} imports disallowed ${dependencyLayer} layer (${specifier})`,
        );
      }
    }
  }
}

if (violations.length) {
  console.error("Company OS boundary violations:\n");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log("Company OS inward layers are vendor-, transport-, and UI-neutral.");
}

