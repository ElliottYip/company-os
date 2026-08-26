import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import { verifyStagingReleaseBundle } from "./create-staging-release-bundle.mjs";

const run = promisify(execFile);
const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

export async function createPortableStagingArchive(input) {
  const bundle = resolve(input.bundleDirectory);
  const output = resolve(input.outputPath);
  if (output === bundle || output.startsWith(`${bundle}/`)) {
    throw new Error("STAGING_ARCHIVE_OUTPUT_INSIDE_BUNDLE_FORBIDDEN");
  }
  await verifyStagingReleaseBundle(bundle);
  try { await stat(output); throw new Error("STAGING_ARCHIVE_OUTPUT_EXISTS"); }
  catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }

  const names = (await readdir(bundle)).sort();
  const staging = await mkdtemp(join(dirname(output), `.${basename(output)}.partial-`));
  const partial = join(staging, basename(output));
  try {
    await run("tar", ["--format=ustar", "-C", bundle, "-czf", partial, "--", ...names], {
      env: { ...process.env, COPYFILE_DISABLE: "1", COPY_EXTENDED_ATTRIBUTES_DISABLE: "1", LANG: "C" },
      maxBuffer: 1024 * 1024,
    });
    const archivedNames = await listPortableStagingArchive(partial);
    if (JSON.stringify(archivedNames) !== JSON.stringify(names)) {
      throw new Error("STAGING_ARCHIVE_FILE_SET_INVALID");
    }
    const source = await readFile(partial);
    await rename(partial, output);
    return { schemaVersion: 1, status: "PORTABLE_ARCHIVE_CREATED", archivePath: output,
      archiveDigest: sha256(source), size: source.byteLength, files: archivedNames };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function listPortableStagingArchive(path) {
  const { stdout } = await run("tar", ["-tzf", resolve(path)], { maxBuffer: 1024 * 1024 });
  return stdout.split("\n").filter(Boolean).sort();
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const [bundleDirectory, outputPath] = process.argv.slice(2);
  if (!bundleDirectory || !outputPath) throw new Error("USAGE_STAGING_BUNDLE_AND_ARCHIVE_REQUIRED");
  const result = await createPortableStagingArchive({ bundleDirectory, outputPath });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
