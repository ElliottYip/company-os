import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const runtimeRoots = ["core", "ports", "application", "adapters", "connector-sdk", "web"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".css", ".html"]);
const errors = [];

async function files(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["dist", "assets"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await files(path));
    else if (sourceExtensions.has(extname(path))) output.push(path);
  }
  return output;
}

for (const directory of runtimeRoots) {
  for (const path of await files(join(root, directory))) {
    const source = await readFile(path, "utf8");
    if (/\bpaperclip(?:ai)?\b/i.test(source)) {
      errors.push(`${relative(root, path)} couples the product runtime to Paperclip`);
    }
  }
}

const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
for (const group of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
  for (const dependency of Object.keys(packageJson[group] ?? {})) {
    if (/paperclip/i.test(dependency)) errors.push(`package.json ${group} includes ${dependency}`);
  }
}
for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
  if (/paperclip/i.test(String(command))) errors.push(`package.json script ${name} invokes Paperclip`);
}

const tsconfig = await readFile(join(root, "tsconfig.json"), "utf8");
if (/research\/|work\/upstream-audit/i.test(tsconfig)) {
  errors.push("tsconfig includes non-product research sources");
}

if (errors.length) {
  console.error("Company OS independent-runtime violations:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("Company OS runtime, dependency graph, and build are Paperclip-independent.");
}
