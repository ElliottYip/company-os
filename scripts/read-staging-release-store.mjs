import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

const RELEASE_ID = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?-[a-f0-9]{12}$/;
const REVISION = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

export async function readVerifiedStagingReleaseStore(rootDirectory) {
  const path = join(rootDirectory, "release-store.json"); const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o077) !== 0) throw new Error("STAGING_RELEASE_STORE_UNSAFE");
  let value;
  try { value = JSON.parse(await readFile(path, "utf8")); }
  catch { throw new Error("STAGING_RELEASE_STORE_INVALID"); }
  if (![1, 2].includes(value?.schemaVersion) || value.product !== "company-os" ||
      value.state !== "PREPARED_NOT_STARTED" || !validRecord(value.prepared, rootDirectory) ||
      (value.schemaVersion === 2 && !validSiteContract(value.prepared.siteContract,
        value.prepared, rootDirectory)) ||
      !Array.isArray(value.previous) || !value.previous.every((item) => validRecord(item, rootDirectory))) {
    throw new Error("STAGING_RELEASE_STORE_INVALID");
  }
  const records = [value.prepared, ...value.previous];
  if (new Set(records.map(({ releaseId }) => releaseId)).size !== records.length) {
    throw new Error("STAGING_RELEASE_STORE_DUPLICATE_RELEASE");
  }
  return structuredClone(value);
}

function validSiteContract(value, release, rootDirectory) {
  const names = ["dependency-secrets.json", "site-runtime.json", "staging-dependencies.json", "staging.env"];
  return value?.schemaVersion === 1 && typeof value.siteId === "string" &&
    value.releaseId === release.releaseId && DIGEST.test(value.dependencyManifestDigest ?? "") &&
    typeof value.contractDirectory === "string" && isAbsolute(value.contractDirectory) &&
    resolve(value.contractDirectory) === join(rootDirectory, "site-contracts", value.siteId, value.releaseId) &&
    JSON.stringify(Object.keys(value.digests ?? {}).sort()) === JSON.stringify(names) &&
    names.every((name) => DIGEST.test(value.digests[name] ?? ""));
}

export function resolveStagingReleaseRecord(store, releaseId, sourceRevision) {
  const record = [store.prepared, ...store.previous].find((item) =>
    item.releaseId === releaseId && (sourceRevision === undefined || item.sourceRevision === sourceRevision));
  if (!record) throw new Error("STAGING_RELEASE_RECORD_NOT_FOUND");
  return structuredClone(record);
}

function validRecord(value, rootDirectory) {
  return value && RELEASE_ID.test(value.releaseId ?? "") &&
    typeof value.releaseVersion === "string" && REVISION.test(value.sourceRevision ?? "") &&
    DIGEST.test(value.bundleManifestDigest ?? "") && typeof value.releaseDirectory === "string" &&
    isAbsolute(value.releaseDirectory) &&
    resolve(value.releaseDirectory) === join(rootDirectory, "releases", value.releaseId);
}
