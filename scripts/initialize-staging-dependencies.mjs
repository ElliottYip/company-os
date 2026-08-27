import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import {
  parseDependencySecretMetadata,
  parseSiteRuntimeManifest,
  planDependencySecretProjections,
  renderReferenceDependencyEnvironment,
  renderReferenceDependencyPublicConfiguration,
} from "../adapters/config/site-runtime-contract.ts";
import { readVerifiedStagingReleaseStore } from "./read-staging-release-store.mjs";

const STORE_MARKER = "company-os staging release store v1\n";

export async function planStagingDependencyInitialization(input) {
  const rootDirectory = safeRoot(input.rootDirectory);
  await verifyMarker(rootDirectory);
  const store = await readVerifiedStagingReleaseStore(rootDirectory);
  if (store.schemaVersion !== 2 || store.prepared.releaseId !== input.releaseId ||
      !store.prepared.siteContract) {
    throw new Error("STAGING_DEPENDENCY_PREPARED_RELEASE_MISMATCH");
  }
  const contract = store.prepared.siteContract;
  const contents = await verifyCanonicalContract(contract);
  const manifest = parseSiteRuntimeManifest(JSON.parse(contents["site-runtime.json"].toString("utf8")));
  if (manifest.product.releaseId !== input.releaseId || manifest.site.deploymentRoot !== rootDirectory ||
      contract.siteId !== manifest.site.id) {
    throw new Error("STAGING_DEPENDENCY_SITE_BINDING_MISMATCH");
  }
  if (manifest.authorization.dependencyInitialization === null) {
    throw new Error("STAGING_DEPENDENCY_INITIALIZATION_AUTHORIZATION_MISSING");
  }
  const metadata = parseDependencySecretMetadata(
    JSON.parse(contents["dependency-secrets.json"].toString("utf8")), manifest.site.id);
  const candidateRoot = join(rootDirectory, "dependency-runtime", "candidates", input.releaseId);
  const publicConfigDirectory = join(candidateRoot, "public");
  const privateConfigDirectory = join(candidateRoot, "private");
  const environment = renderReferenceDependencyEnvironment(
    manifest, metadata, publicConfigDirectory, privateConfigDirectory);
  const publicConfiguration = renderReferenceDependencyPublicConfiguration(manifest, metadata);
  const artifactDigests = Object.fromEntries(Object.entries({ "dependencies.env": environment,
    ...publicConfiguration }).map(([name, value]) => [name, sha256(value)]));
  const definitions = [
    ["VALIDATE_CANONICAL_SITE_CONTRACT", false],
    ["VALIDATE_DEPENDENCY_SECRET_SOURCES", false],
    ["RESOLVE_IMMUTABLE_IMAGE_USERS", false],
    ["RENDER_PUBLIC_CONFIGURATION", true],
    ["RENDER_PRIVATE_OIDC_CONFIGURATION", true],
    ["MATERIALIZE_SECRET_PROJECTIONS", true],
    ["CREATE_DEPENDENCY_RUNTIME", true],
    ["INITIALIZE_POSTGRES", true],
    ["INITIALIZE_OIDC", true],
    ["INITIALIZE_VAULT_AND_APPROLE", true],
    ["START_BROKER_AND_AGENT", true],
    ["VERIFY_TLS_AND_HEALTH", false],
  ];
  return { schemaVersion: 1, product: "company-os", status: "PLANNED_NOT_APPLIED",
    executable: false, nonExecutableReason: "DEPENDENCY_INITIALIZER_APPLY_NOT_IMPLEMENTED",
    siteId: manifest.site.id, releaseId: input.releaseId, oidcRuntime: manifest.dependencies.oidc.runtime,
    authorizationReference: manifest.authorization.dependencyInitialization,
    canonicalContractDirectory: contract.contractDirectory, candidateRoot, publicConfigDirectory,
    privateConfigDirectory, artifactDigests,
    secretProjectionPlan: planDependencySecretProjections(manifest, metadata),
    steps: definitions.map(([id, mutating]) => ({ id, mutating,
      authorizationReference: mutating ? manifest.authorization.dependencyInitialization : null })) };
}

async function verifyCanonicalContract(contract) {
  const names = ["dependency-secrets.json", "site-runtime.json", "staging-dependencies.json", "staging.env"];
  if (contract.schemaVersion !== 1 || !isAbsolute(contract.contractDirectory ?? "") ||
      JSON.stringify(Object.keys(contract.digests ?? {}).sort()) !== JSON.stringify(names)) {
    throw new Error("STAGING_DEPENDENCY_SITE_CONTRACT_INVALID");
  }
  const entries = await Promise.all(names.map(async (name) => {
    const path = join(contract.contractDirectory, name); const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
        (metadata.mode & 0o077) !== 0) throw new Error("STAGING_DEPENDENCY_SITE_CONTRACT_UNSAFE");
    const value = await readFile(path);
    if (sha256(value) !== contract.digests[name]) throw new Error("STAGING_DEPENDENCY_SITE_CONTRACT_CHANGED");
    return [name, value];
  }));
  return Object.fromEntries(entries);
}

function safeRoot(value) {
  if (typeof value !== "string" || !isAbsolute(value)) {
    throw new Error("STAGING_DEPENDENCY_ROOT_ABSOLUTE_PATH_REQUIRED");
  }
  const root = resolve(value);
  if (root === "/" || root === resolve(homedir())) throw new Error("STAGING_DEPENDENCY_ROOT_TOO_BROAD");
  return root;
}

async function verifyMarker(rootDirectory) {
  const root = await lstat(rootDirectory);
  if (!root.isDirectory() || root.isSymbolicLink() || (root.mode & 0o027) !== 0) {
    throw new Error("STAGING_DEPENDENCY_ROOT_UNSAFE");
  }
  const marker = join(rootDirectory, ".company-os-release-store"); const metadata = await lstat(marker);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o077) !== 0 || await readFile(marker, "utf8") !== STORE_MARKER) {
    throw new Error("STAGING_DEPENDENCY_STORE_MARKER_UNSAFE");
  }
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
