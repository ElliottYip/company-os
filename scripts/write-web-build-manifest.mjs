import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [sourceRevision = "local"] = process.argv.slice(2);
if (!/^(?:local|[0-9a-f]{40})$/.test(sourceRevision)) {
  throw new Error("COMPANY_OS_WEB_SOURCE_REVISION_INVALID");
}

const distribution = join(process.cwd(), "web", "dist");
const assetsDirectory = join(distribution, "assets");
const assets = (await readdir(assetsDirectory)).sort();
const entries = [];
for (const name of assets) {
  const bytes = await readFile(join(assetsDirectory, name));
  entries.push({ name, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length });
}

const manifest = {
  schemaVersion: 1,
  sourceRevision,
  assets: entries,
};
await writeFile(join(distribution, "build-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
