import { createHash } from "node:crypto";
import { chmod, lstat, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const IMAGE = /^[a-z0-9][a-z0-9./_-]*@sha256:[a-f0-9]{64}$/;
const VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[a-z0-9.-]+)?$/;
const FILES = [
  "LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md",
  "deploy/compose.staging.yml", "deploy/compose.staging-dependencies.yml",
  "deploy/staging-dependencies.Caddyfile", "deploy/staging.env.example",
  "docs/staging-raft-xin.md", "docs/customer-boundary-acceptance.md",
  "docs/formal-identity-runbook.md",
];
const BUNDLE_FILE_NAMES = [...FILES.map((path) => basename(path)), "release-manifest.json"].sort();

const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

export async function createStagingReleaseBundle(input) {
  const root = resolve(input.root);
  const output = resolve(input.outputDirectory);
  if (output === root || output.startsWith(`${root}/`)) throw new Error("STAGING_BUNDLE_OUTPUT_INSIDE_SOURCE_FORBIDDEN");
  const releaseSource = await readFile(resolve(input.releaseManifestPath));
  const release = releaseManifest(JSON.parse(releaseSource.toString("utf8")));
  try { await stat(output); throw new Error("STAGING_BUNDLE_OUTPUT_EXISTS"); }
  catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  const staging = await mkdtemp(join(dirname(output), `.${basename(output)}.partial-`));
  try {
    await chmod(staging, 0o750);
    const files = [];
    for (const path of FILES) {
      const source = await readFile(resolve(root, path));
      const destination = resolve(staging, basename(path));
      await writeFile(destination, source, { flag: "wx", mode: 0o640 });
      files.push({ name: basename(path), sourcePath: path, digest: sha256(source), size: source.byteLength });
    }
    await writeFile(resolve(staging, "release-manifest.json"), releaseSource, { flag: "wx", mode: 0o640 });
    files.push({ name: "release-manifest.json", sourcePath: "release-manifest.json",
      digest: sha256(releaseSource), size: releaseSource.byteLength });
    const manifest = { schemaVersion: 1, packageType: "COMPANY_OS_STAGING_RELEASE_BUNDLE",
      release: { releaseVersion: release.releaseVersion, sourceRevision: release.sourceRevision,
        images: release.images }, files: files.sort((left, right) => left.name.localeCompare(right.name)),
      secretMaterialIncluded: false };
    const encoded = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(resolve(staging, "bundle-manifest.json"), encoded, { flag: "wx", mode: 0o640 });
    await rename(staging, output);
    return { ...manifest, bundleManifestDigest: sha256(encoded) };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyStagingReleaseBundle(directory) {
  const root = resolve(directory);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("STAGING_BUNDLE_DIRECTORY_UNSAFE");
  const source = await readFile(resolve(root, "bundle-manifest.json"));
  const manifest = JSON.parse(source.toString("utf8"));
  if (manifest?.schemaVersion !== 1 || manifest.packageType !== "COMPANY_OS_STAGING_RELEASE_BUNDLE" ||
      manifest.secretMaterialIncluded !== false || !Array.isArray(manifest.files)) {
    throw new Error("STAGING_BUNDLE_MANIFEST_INVALID");
  }
  releaseManifest({ schemaVersion: 1, product: "company-os", ...manifest.release });
  const names = manifest.files.map((file) => file?.name);
  if (new Set(names).size !== names.length) throw new Error("STAGING_BUNDLE_FILE_DUPLICATE");
  if (JSON.stringify([...names].sort()) !== JSON.stringify(BUNDLE_FILE_NAMES)) {
    throw new Error("STAGING_BUNDLE_FILE_SET_INVALID");
  }
  for (const file of manifest.files) {
    if (!file || typeof file.name !== "string" || basename(file.name) !== file.name || !DIGEST.test(file.digest) ||
        !Number.isSafeInteger(file.size) || file.size < 1) throw new Error("STAGING_BUNDLE_FILE_RECORD_INVALID");
    const filePath = resolve(root, file.name);
    const fileStat = await lstat(filePath);
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw new Error("STAGING_BUNDLE_FILE_UNSAFE");
    const value = await readFile(filePath);
    if (value.byteLength !== file.size || sha256(value) !== file.digest) throw new Error("STAGING_BUNDLE_FILE_CHANGED");
  }
  const actualNames = (await readdir(root)).sort();
  const expectedNames = [...BUNDLE_FILE_NAMES, "bundle-manifest.json"].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error("STAGING_BUNDLE_UNDECLARED_FILE");
  }
  return { schemaVersion: 1, status: "VERIFIED", releaseVersion: manifest.release.releaseVersion,
    sourceRevision: manifest.release.sourceRevision, bundleManifestDigest: sha256(source) };
}

function releaseManifest(value) {
  if (!value || value.schemaVersion !== 1 || value.product !== "company-os" ||
      typeof value.releaseVersion !== "string" || !VERSION.test(value.releaseVersion) ||
      typeof value.sourceRevision !== "string" || !SHA.test(value.sourceRevision) ||
      !value.images || ![value.images.api, value.images.web, value.images.ops,
        value.images.codexAgentNode, value.images.vaultSecretBroker, value.images.referenceDataNode]
        .every((image) => typeof image === "string" && IMAGE.test(image))) {
    throw new Error("STAGING_BUNDLE_RELEASE_INVALID");
  }
  return value;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const [releaseManifestPath, outputDirectory] = process.argv.slice(2);
  if (!releaseManifestPath || !outputDirectory) throw new Error("USAGE_RELEASE_MANIFEST_AND_OUTPUT_REQUIRED");
  const result = await createStagingReleaseBundle({ root: new URL("../", import.meta.url).pathname,
    releaseManifestPath, outputDirectory });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
