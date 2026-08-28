import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "connectors/federated-source-reference/source.ts");
const output = resolve(root, "connectors/federated-source-reference/index.mjs");

export async function buildFederatedSourceReference({ write = false } = {}) {
  const result = await build({
    entryPoints: [source],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile: output,
    write: false,
  });
  const generated = result.outputFiles?.[0]?.contents;
  if (!generated) throw new Error("FEDERATED_SOURCE_BUNDLE_OUTPUT_MISSING");
  if (write) {
    await writeFile(output, generated);
    return { status: "WRITTEN", output };
  }
  const current = await readFile(output);
  if (!current.equals(generated)) throw new Error("FEDERATED_SOURCE_BUNDLE_STALE");
  return { status: "CURRENT", output };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const result = await buildFederatedSourceReference({ write: process.argv.includes("--write") });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
