import { constants } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";

import { verifyStagingReleaseBundle } from "./create-staging-release-bundle.mjs";

const STORE_MARKER = "company-os staging release store v1\n";
const RELEASE_ID = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?-[a-f0-9]{12}$/;

export async function planStagingReleaseInstall(input) {
  const bundleDirectory = safeAbsolutePath(input.bundleDirectory, "STAGING_RELEASE_BUNDLE_ABSOLUTE_PATH_REQUIRED");
  const rootDirectory = safeAbsolutePath(input.rootDirectory, "STAGING_RELEASE_ROOT_ABSOLUTE_PATH_REQUIRED");
  if (rootDirectory === "/" || rootDirectory === resolve(homedir())) {
    throw new Error("STAGING_RELEASE_ROOT_TOO_BROAD");
  }
  const rootStat = await lstat(rootDirectory);
  if (rootStat.isSymbolicLink()) throw new Error("STAGING_RELEASE_ROOT_SYMLINK_FORBIDDEN");
  if (!rootStat.isDirectory()) throw new Error("STAGING_RELEASE_ROOT_NOT_DIRECTORY");
  if ((rootStat.mode & 0o027) !== 0) throw new Error("STAGING_RELEASE_ROOT_MODE_UNSAFE");
  if (typeof process.getuid === "function" && rootStat.uid !== process.getuid()) {
    throw new Error("STAGING_RELEASE_ROOT_NOT_OWNED_BY_OPERATOR");
  }

  const verified = await verifyStagingReleaseBundle(bundleDirectory);
  const releaseId = `${verified.releaseVersion}-${verified.sourceRevision.slice(0, 12)}`;
  if (!RELEASE_ID.test(releaseId)) throw new Error("STAGING_RELEASE_ID_INVALID");
  const releaseDirectory = join(rootDirectory, "releases", releaseId);
  const retained = await retainedRelease(releaseDirectory, verified.bundleManifestDigest);
  const markerPresent = await verifyOptionalStoreMarker(rootDirectory);
  const store = await readStore(rootDirectory);
  if (!markerPresent && (store || await pathExists(join(rootDirectory, "releases")))) {
    throw new Error("STAGING_RELEASE_STORE_MARKER_MISSING");
  }

  return {
    schemaVersion: 1,
    status: "PLANNED_NOT_APPLIED",
    releaseId,
    releaseVersion: verified.releaseVersion,
    sourceRevision: verified.sourceRevision,
    bundleManifestDigest: verified.bundleManifestDigest,
    releaseDirectory,
    retained,
    previousReleaseId: store?.prepared.releaseId ?? null,
    nextCommand: `docker compose --env-file ${join(rootDirectory, "staging.env")} -f ${join(releaseDirectory, "compose.staging.yml")} config`,
  };
}

export async function installStagingReleaseBundle(input) {
  const plan = await planStagingReleaseInstall(input);
  const rootDirectory = safeAbsolutePath(input.rootDirectory, "STAGING_RELEASE_ROOT_ABSOLUTE_PATH_REQUIRED");
  const bundleDirectory = safeAbsolutePath(input.bundleDirectory, "STAGING_RELEASE_BUNDLE_ABSOLUTE_PATH_REQUIRED");
  const releasesDirectory = join(rootDirectory, "releases");
  await initializeStore(rootDirectory, releasesDirectory);

  let reused = plan.retained;
  if (!reused) {
    const staging = await mkdtemp(join(releasesDirectory, `.${plan.releaseId}.partial-`));
    try {
      await chmod(staging, 0o750);
      for (const name of await readdir(bundleDirectory)) {
        const source = join(bundleDirectory, name);
        const sourceStat = await lstat(source);
        if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || basename(name) !== name) {
          throw new Error("STAGING_RELEASE_BUNDLE_ENTRY_UNSAFE");
        }
        await copyFile(source, join(staging, name), constants.COPYFILE_EXCL);
        await chmod(join(staging, name), 0o640);
      }
      const copied = await verifyStagingReleaseBundle(staging);
      if (copied.bundleManifestDigest !== plan.bundleManifestDigest) {
        throw new Error("STAGING_RELEASE_COPY_CHANGED");
      }
      try {
        await rename(staging, plan.releaseDirectory);
      } catch (error) {
        if (!isCode(error, "EEXIST") && !isCode(error, "ENOTEMPTY")) throw error;
        const retained = await retainedRelease(plan.releaseDirectory, plan.bundleManifestDigest);
        if (!retained) throw new Error("STAGING_RELEASE_TARGET_COLLISION");
        reused = true;
      }
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }

  const existing = await readStore(rootDirectory);
  const prepared = releaseRecord(plan);
  const previous = existing && existing.prepared.releaseId !== prepared.releaseId
    ? [existing.prepared, ...existing.previous.filter((item) => item.releaseId !== existing.prepared.releaseId)]
    : existing?.previous ?? [];
  await writeStoreAtomic(rootDirectory, { schemaVersion: 1, product: "company-os",
    state: "PREPARED_NOT_STARTED", prepared, previous });

  return { ...plan, status: "INSTALLED_NOT_STARTED", reused };
}

function releaseRecord(plan) {
  return { releaseId: plan.releaseId, releaseVersion: plan.releaseVersion,
    sourceRevision: plan.sourceRevision, bundleManifestDigest: plan.bundleManifestDigest,
    releaseDirectory: plan.releaseDirectory };
}

async function initializeStore(rootDirectory, releasesDirectory) {
  await mkdir(releasesDirectory, { recursive: true, mode: 0o750 });
  const releasesStat = await lstat(releasesDirectory);
  if (!releasesStat.isDirectory() || releasesStat.isSymbolicLink() || (releasesStat.mode & 0o027) !== 0) {
    throw new Error("STAGING_RELEASES_DIRECTORY_UNSAFE");
  }
  const markerPath = join(rootDirectory, ".company-os-release-store");
  try {
    await writeFile(markerPath, STORE_MARKER, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (!isCode(error, "EEXIST")) throw error;
  }
  await verifyOptionalStoreMarker(rootDirectory, true);
}

async function verifyOptionalStoreMarker(rootDirectory, required = false) {
  const markerPath = join(rootDirectory, ".company-os-release-store");
  try {
    const markerStat = await lstat(markerPath);
    if (!markerStat.isFile() || markerStat.isSymbolicLink() || markerStat.nlink !== 1 ||
        (markerStat.mode & 0o077) !== 0 || await readFile(markerPath, "utf8") !== STORE_MARKER) {
      throw new Error("STAGING_RELEASE_STORE_MARKER_UNSAFE");
    }
    return true;
  } catch (error) {
    if (!required && isCode(error, "ENOENT")) return false;
    throw error;
  }
}

async function retainedRelease(directory, digest) {
  try {
    const value = await verifyStagingReleaseBundle(directory);
    if (value.bundleManifestDigest !== digest) throw new Error("STAGING_RELEASE_TARGET_COLLISION");
    return true;
  } catch (error) {
    if (isCode(error, "ENOENT")) return false;
    throw error;
  }
}

async function readStore(rootDirectory) {
  const path = join(rootDirectory, "release-store.json");
  try {
    const valueStat = await lstat(path);
    if (!valueStat.isFile() || valueStat.isSymbolicLink() || valueStat.nlink !== 1 ||
        (valueStat.mode & 0o077) !== 0) throw new Error("STAGING_RELEASE_STORE_UNSAFE");
    const value = JSON.parse(await readFile(path, "utf8"));
    if (value?.schemaVersion !== 1 || value.product !== "company-os" ||
        value.state !== "PREPARED_NOT_STARTED" || !validRecord(value.prepared, rootDirectory) ||
        !Array.isArray(value.previous) || !value.previous.every((item) => validRecord(item, rootDirectory))) {
      throw new Error("STAGING_RELEASE_STORE_INVALID");
    }
    return value;
  } catch (error) {
    if (isCode(error, "ENOENT")) return null;
    throw error;
  }
}

async function writeStoreAtomic(rootDirectory, value) {
  const finalPath = join(rootDirectory, "release-store.json");
  const temporaryPath = join(rootDirectory, `.release-store.json.partial-${process.pid}-${Date.now()}`);
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(temporaryPath, finalPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function validRecord(value, rootDirectory) {
  return value && RELEASE_ID.test(value.releaseId) && typeof value.releaseVersion === "string" &&
    /^[a-f0-9]{40}$/.test(value.sourceRevision) && /^sha256:[a-f0-9]{64}$/.test(value.bundleManifestDigest) &&
    typeof value.releaseDirectory === "string" && isAbsolute(value.releaseDirectory) &&
    resolve(value.releaseDirectory) === join(rootDirectory, "releases", value.releaseId);
}

async function pathExists(path) {
  try { await lstat(path); return true; }
  catch (error) { if (isCode(error, "ENOENT")) return false; throw error; }
}

function safeAbsolutePath(value, code) {
  if (typeof value !== "string" || !isAbsolute(value)) throw new Error(code);
  return resolve(value);
}

function isCode(error, code) {
  return error instanceof Error && "code" in error && error.code === code;
}

function argumentsFrom(values) {
  let bundleDirectory; let rootDirectory; let apply = false;
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (flag === "--apply") apply = true;
    else if (flag === "--bundle") bundleDirectory = values[++index];
    else if (flag === "--root") rootDirectory = values[++index];
    else throw new Error("STAGING_RELEASE_INSTALL_ARGUMENT_INVALID");
  }
  if (!bundleDirectory || !rootDirectory) throw new Error("STAGING_RELEASE_INSTALL_PATHS_REQUIRED");
  return { bundleDirectory, rootDirectory, apply };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const options = argumentsFrom(process.argv.slice(2));
  const result = options.apply ? await installStagingReleaseBundle(options) : await planStagingReleaseInstall(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
