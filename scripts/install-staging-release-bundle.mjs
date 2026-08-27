import { createHash } from "node:crypto";
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
import { parsePublicStagingEnvironment } from "../adapters/config/staging-deployment-doctor.ts";
import { parseDependencySecretMetadata, parseSiteRuntimeManifest,
  renderSitePublicEnvironment } from "../adapters/config/site-runtime-contract.ts";
import { stagingDependencyExpectationFromPublicEnvironment,
  validateStagingDependencies } from "./validate-staging-dependencies.ts";

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

export async function adoptStagingSiteContract(input) {
  const rootDirectory = safeAbsolutePath(input.rootDirectory, "STAGING_RELEASE_ROOT_ABSOLUTE_PATH_REQUIRED");
  const store = await readStore(rootDirectory);
  if (!store || store.prepared.releaseId !== input.releaseId) {
    throw new Error("STAGING_SITE_PREPARED_RELEASE_MISMATCH");
  }
  const sources = {
    "site-runtime.json": safeAbsolutePath(input.siteRuntimeFile, "STAGING_SITE_RUNTIME_PATH_REQUIRED"),
    "staging.env": safeAbsolutePath(input.publicEnvironmentFile, "STAGING_SITE_ENV_PATH_REQUIRED"),
    "staging-dependencies.json": safeAbsolutePath(input.dependencyManifestFile,
      "STAGING_SITE_DEPENDENCY_PATH_REQUIRED"),
    "dependency-secrets.json": safeAbsolutePath(input.dependencySecretMetadataFile,
      "STAGING_SITE_SECRET_METADATA_PATH_REQUIRED"),
  };
  const productSecretDirectory = safeAbsolutePath(input.productSecretDirectory,
    "STAGING_SITE_PRODUCT_SECRET_DIRECTORY_REQUIRED");
  const contents = Object.fromEntries(await Promise.all(Object.entries(sources).map(async ([name, path]) =>
    [name, await readPublicArtifact(path)])));
  const manifest = parseSiteRuntimeManifest(JSON.parse(contents["site-runtime.json"].toString("utf8")));
  if (manifest.site.deploymentRoot !== rootDirectory || manifest.product.releaseId !== input.releaseId) {
    throw new Error("STAGING_SITE_RELEASE_BINDING_MISMATCH");
  }
  const release = JSON.parse(await readFile(join(store.prepared.releaseDirectory, "release-manifest.json"), "utf8"));
  if (JSON.stringify(manifest.product.images) !== JSON.stringify(release.images)) {
    throw new Error("STAGING_SITE_RELEASE_IMAGE_MISMATCH");
  }
  const publicSource = contents["staging.env"].toString("utf8");
  const environment = parsePublicStagingEnvironment(publicSource);
  if (publicSource !== renderSitePublicEnvironment(manifest, productSecretDirectory)) {
    throw new Error("STAGING_SITE_PUBLIC_ENVIRONMENT_MISMATCH");
  }
  const dependencyAdmission = await validateStagingDependencies(sources["staging-dependencies.json"],
    stagingDependencyExpectationFromPublicEnvironment(environment, rootDirectory));
  parseDependencySecretMetadata(JSON.parse(contents["dependency-secrets.json"].toString("utf8")),
    manifest.site.id);

  const digests = Object.fromEntries(Object.entries(contents).map(([name, value]) => [name, sha256(value)]));
  const contractDirectory = join(rootDirectory, "site-contracts", manifest.site.id, input.releaseId);
  let reused = false;
  try {
    const metadata = await lstat(contractDirectory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error("STAGING_SITE_TARGET_UNSAFE");
    for (const [name, digest] of Object.entries(digests)) {
      if (sha256(await readPublicArtifact(join(contractDirectory, name))) !== digest) {
        throw new Error("STAGING_SITE_TARGET_COLLISION");
      }
    }
    reused = true;
  } catch (error) {
    if (!isCode(error, "ENOENT")) throw error;
    const parent = join(rootDirectory, "site-contracts", manifest.site.id);
    await mkdir(parent, { recursive: true, mode: 0o750 });
    const staging = await mkdtemp(join(parent, `.${input.releaseId}.partial-`));
    try {
      await chmod(staging, 0o750);
      for (const [name, source] of Object.entries(sources)) {
        await copyFile(source, join(staging, name), constants.COPYFILE_EXCL);
        await chmod(join(staging, name), 0o600);
      }
      await rename(staging, contractDirectory);
    } finally { await rm(staging, { recursive: true, force: true }); }
  }
  const siteContract = { schemaVersion: 1, siteId: manifest.site.id, releaseId: input.releaseId,
    contractDirectory, digests, dependencyManifestDigest: dependencyAdmission.manifestDigest };
  const existingContract = store.prepared.siteContract;
  if (existingContract && JSON.stringify(existingContract) !== JSON.stringify(siteContract)) {
    throw new Error("STAGING_SITE_STORE_COLLISION");
  }
  await writeStoreAtomic(rootDirectory, { ...store, schemaVersion: 2,
    prepared: { ...store.prepared, siteContract } });
  const evidenceDirectory = join(rootDirectory, "evidence", "site-adoptions");
  await mkdir(evidenceDirectory, { recursive: true, mode: 0o750 });
  const evidencePath = join(evidenceDirectory, `${manifest.site.id}-${input.releaseId}.json`);
  const evidence = `${JSON.stringify({ schemaVersion: 1, product: "company-os",
    status: "SITE_CONTRACT_ADOPTED_NOT_STARTED", ...siteContract }, null, 2)}\n`;
  try { await writeFile(evidencePath, evidence, { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (!isCode(error, "EEXIST") || await readFile(evidencePath, "utf8") !== evidence) throw error;
  }
  return { schemaVersion: 1, status: "SITE_CONTRACT_ADOPTED_NOT_STARTED",
    siteId: manifest.site.id, releaseId: input.releaseId, contractDirectory, digests,
    dependencyManifestDigest: dependencyAdmission.manifestDigest, reused };
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
    if (![1, 2].includes(value?.schemaVersion) || value.product !== "company-os" ||
        value.state !== "PREPARED_NOT_STARTED" || !validRecord(value.prepared, rootDirectory) ||
        (value.schemaVersion === 2 && !validSiteContract(value.prepared.siteContract,
          value.prepared, rootDirectory)) ||
        !Array.isArray(value.previous) || !value.previous.every((item) => validRecord(item, rootDirectory))) {
      throw new Error("STAGING_RELEASE_STORE_INVALID");
    }
    return value;
  } catch (error) {
    if (isCode(error, "ENOENT")) return null;
    throw error;
  }
}

function validSiteContract(value, release, rootDirectory) {
  const names = ["dependency-secrets.json", "site-runtime.json", "staging-dependencies.json", "staging.env"];
  return value?.schemaVersion === 1 && typeof value.siteId === "string" &&
    value.releaseId === release.releaseId && /^sha256:[a-f0-9]{64}$/.test(value.dependencyManifestDigest ?? "") &&
    typeof value.contractDirectory === "string" && isAbsolute(value.contractDirectory) &&
    resolve(value.contractDirectory) === join(rootDirectory, "site-contracts", value.siteId, value.releaseId) &&
    JSON.stringify(Object.keys(value.digests ?? {}).sort()) === JSON.stringify(names) &&
    names.every((name) => /^sha256:[a-f0-9]{64}$/.test(value.digests[name] ?? ""));
}

async function readPublicArtifact(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      metadata.size < 2 || metadata.size > 256 * 1024 || (metadata.mode & 0o022) !== 0) {
    throw new Error("STAGING_SITE_ARTIFACT_UNSAFE");
  }
  return readFile(path);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
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
