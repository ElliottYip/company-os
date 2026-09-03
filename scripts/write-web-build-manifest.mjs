import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";

const [sourceRevision = "local"] = process.argv.slice(2);
if (!/^(?:local|[0-9a-f]{40})$/.test(sourceRevision)) {
  throw new Error("COMPANY_OS_WEB_SOURCE_REVISION_INVALID");
}

const distribution = join(process.cwd(), "web", "dist");
const assetsDirectory = join(distribution, "assets");
async function assetFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? assetFiles(path) : entry.isFile() ? [path] : [];
  }));
  return files.flat();
}

const assets = (await assetFiles(assetsDirectory)).sort();
const entries = [];
for (const path of assets) {
  const name = relative(assetsDirectory, path).split(sep).join(posix.sep);
  const bytes = await readFile(path);
  entries.push({ name, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length });
}

const manifest = {
  schemaVersion: 1,
  sourceRevision,
  assets: entries,
};
await writeFile(join(distribution, "build-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
