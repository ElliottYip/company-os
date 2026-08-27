import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { chmod, chown, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm,
  writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import {
  parseDependencySecretMetadata,
  parseSiteRuntimeManifest,
  planDependencySecretProjections,
  renderReferenceDependencyEnvironment,
  renderReferenceDependencyPublicConfiguration,
} from "../adapters/config/site-runtime-contract.ts";
import { parseDexBootstrapSecret, renderDexPrivateConfiguration } from
  "../adapters/config/dex-reference-runtime.ts";
import { createOciImageUserResolver } from "../adapters/config/oci-image-user.ts";
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
  const secretProjectionRootDirectory = join(candidateRoot, "secret-projections");
  const environment = renderReferenceDependencyEnvironment(
    manifest, metadata, publicConfigDirectory, privateConfigDirectory, secretProjectionRootDirectory);
  const publicConfiguration = renderReferenceDependencyPublicConfiguration(manifest, metadata);
  const artifactDigests = Object.fromEntries(Object.entries({ "dependencies.env": environment,
    ...publicConfiguration }).map(([name, value]) => [name, sha256(value)]));
  const projectionPlan = planDependencySecretProjections(manifest, metadata, secretProjectionRootDirectory);
  const imageUsersRequired = [...new Set([manifest.dependencies.oidc.image,
    ...projectionPlan.projections.map(({ image }) => image)])];
  const dependencyImages = [...new Set([manifest.product.images.ops, manifest.dependencies.postgres.image,
    manifest.dependencies.oidc.image, manifest.dependencies.vault.image,
    manifest.dependencies.secretBroker.image, manifest.dependencies.agentNode.image,
    ...projectionPlan.projections.map(({ image }) => image)])];
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
    executable: true,
    siteId: manifest.site.id, releaseId: input.releaseId, productNetwork: manifest.site.productNetwork,
    oidcRuntime: manifest.dependencies.oidc.runtime,
    authorizationReference: manifest.authorization.dependencyInitialization,
    rootDirectory, canonicalContractDirectory: contract.contractDirectory, candidateRoot, publicConfigDirectory,
    privateConfigDirectory, secretProjectionRootDirectory, artifactDigests, dependencyImages,
    imageUsersRequired, secretProjectionPlan: projectionPlan,
    steps: definitions.map(([id, mutating]) => ({ id, mutating,
      authorizationReference: mutating ? manifest.authorization.dependencyInitialization : null })) };
}

export async function materializeStagingDependencyConfiguration(input, supplied = {}) {
  const plan = await planStagingDependencyInitialization(input);
  if (input.authorizationReference !== plan.authorizationReference) {
    throw new Error("STAGING_DEPENDENCY_INITIALIZATION_AUTHORIZATION_MISMATCH");
  }
  const store = await readVerifiedStagingReleaseStore(input.rootDirectory);
  const contract = store.prepared.siteContract;
  const contents = await verifyCanonicalContract(contract);
  const manifest = parseSiteRuntimeManifest(JSON.parse(contents["site-runtime.json"].toString("utf8")));
  const metadata = parseDependencySecretMetadata(
    JSON.parse(contents["dependency-secrets.json"].toString("utf8")), manifest.site.id);
  const sourceFiles = await validateSecretSources(metadata);
  const oidcBootstrap = parseDexBootstrapSecret(JSON.parse(
    sourceFiles.get("OIDC_BOOTSTRAP").toString("utf8")));
  const oidcClientSecret = sourceFiles.get("OIDC_CLIENT").toString("utf8").trim();
  const dexConfiguration = renderDexPrivateConfiguration(manifest, oidcBootstrap, oidcClientSecret);
  const publicConfiguration = renderReferenceDependencyPublicConfiguration(manifest, metadata);
  const caddy = await safeReleaseFile(join(store.prepared.releaseDirectory,
    "staging-dependencies.Caddyfile"));
  const readyProjections = plan.secretProjectionPlan.projections.filter((projection) =>
    projection.files.every(({ purpose }) => sourceFiles.has(purpose)));
  const pendingConsumers = plan.secretProjectionPlan.projections
    .filter((projection) => !readyProjections.includes(projection)).map(({ consumer }) => consumer);
  const resolveImageUser = supplied.resolveImageUser ?? (supplied.imageUserInspections
    ? createOciImageUserResolver(supplied.imageUserInspections) : defaultResolveImageUser);
  const applyOwnership = supplied.applyOwnership ?? chown;
  const resolved = new Map();
  for (const projection of readyProjections) {
    resolved.set(projection.consumer, await validImageUser(resolveImageUser,
      projection.image, projection.runtimeUser));
  }
  resolved.set("OIDC", await validImageUser(resolveImageUser, manifest.dependencies.oidc.image));
  await rejectExistingCandidate(plan.candidateRoot);

  const candidatesRoot = join(plan.rootDirectory, "dependency-runtime", "candidates");
  await mkdir(candidatesRoot, { recursive: true, mode: 0o750 });
  const staging = await mkdtemp(join(candidatesRoot, `.${plan.releaseId}.partial-`));
  try {
    await chmod(staging, 0o750);
    const publicDirectory = join(staging, "public"); const privateDirectory = join(staging, "private");
    await mkdir(publicDirectory, { mode: 0o755 }); await mkdir(privateDirectory, { mode: 0o700 });
    await writeMode(join(staging, "dependencies.env"),
      renderReferenceDependencyEnvironment(manifest, metadata, plan.publicConfigDirectory,
        plan.privateConfigDirectory, plan.secretProjectionRootDirectory), 0o600);
    await writeMode(join(publicDirectory, "vault.hcl"), publicConfiguration["vault.hcl"], 0o444);
    await writeMode(join(publicDirectory, "secret-references.json"),
      publicConfiguration["secret-references.json"], 0o444);
    await writeMode(join(publicDirectory, "Caddyfile"), caddy, 0o444);
    const dexPath = join(privateDirectory, "dex.json"); await writeMode(dexPath, dexConfiguration, 0o400);
    const oidcUser = resolved.get("OIDC"); await applyOwnership(dexPath, oidcUser.uid, oidcUser.gid);

    for (const projection of readyProjections) {
      const relative = projection.directory.slice(`${plan.candidateRoot}/`.length);
      if (!relative || relative.startsWith("/") || relative.includes("..")) {
        throw new Error("STAGING_DEPENDENCY_PROJECTION_PATH_INVALID");
      }
      const directory = join(staging, relative); await mkdir(directory, { recursive: true, mode: 0o700 });
      const user = resolved.get(projection.consumer);
      for (const file of projection.files) {
        const target = join(directory, file.targetPath.slice(`${projection.directory}/`.length));
        await copyFile(file.sourcePath, target, constants.COPYFILE_EXCL);
        await chmod(target, file.mode); await applyOwnership(target, user.uid, user.gid);
      }
    }
    const evidence = { schemaVersion: 1, product: "company-os",
      status: "PRE_BOOTSTRAP_CONFIGURATION_MATERIALIZED_NOT_STARTED", siteId: plan.siteId,
      releaseId: plan.releaseId, authorizationReference: plan.authorizationReference,
      artifactDigests: plan.artifactDigests,
      runtimeOwners: Object.fromEntries([...resolved].map(([consumer, user]) =>
        [consumer, { uid: user.uid, gid: user.gid }])), pendingConsumers, runtimeObjectsCreated: false };
    await writeMode(join(staging, "materialization-evidence.json"),
      `${JSON.stringify(evidence, null, 2)}\n`, 0o600);
    await rename(staging, plan.candidateRoot);
    return { schemaVersion: 1, status: "PRE_BOOTSTRAP_CONFIGURATION_MATERIALIZED_NOT_STARTED",
      siteId: plan.siteId, releaseId: plan.releaseId, candidateRoot: plan.candidateRoot,
      publicConfigDirectory: plan.publicConfigDirectory, privateConfigDirectory: plan.privateConfigDirectory,
      secretProjectionRootDirectory: plan.secretProjectionRootDirectory,
      pendingConsumers, runtimeObjectsCreated: false, artifactDigests: plan.artifactDigests };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function materializePostBootstrapDependencyConfiguration(input, supplied = {}) {
  const plan = await planStagingDependencyInitialization(input);
  if (input.authorizationReference !== plan.authorizationReference) {
    throw new Error("STAGING_DEPENDENCY_INITIALIZATION_AUTHORIZATION_MISMATCH");
  }
  const preBootstrapEvidence = await readPreBootstrapEvidence(plan);
  const store = await readVerifiedStagingReleaseStore(input.rootDirectory);
  const contract = store.prepared.siteContract;
  const contents = await verifyCanonicalContract(contract);
  const manifest = parseSiteRuntimeManifest(JSON.parse(contents["site-runtime.json"].toString("utf8")));
  const metadata = parseDependencySecretMetadata(
    JSON.parse(contents["dependency-secrets.json"].toString("utf8")), manifest.site.id);
  const sourceFiles = await validateSecretSources(metadata,
    new Set(["GENERATED_ON_TARGET", "BOOTSTRAP_OUTPUT"]));
  const oidcBootstrap = parseDexBootstrapSecret(JSON.parse(
    sourceFiles.get("OIDC_BOOTSTRAP").toString("utf8")));
  const oidcClientSecret = sourceFiles.get("OIDC_CLIENT").toString("utf8").trim();
  const dexConfiguration = renderDexPrivateConfiguration(manifest, oidcBootstrap, oidcClientSecret);
  const publicConfiguration = renderReferenceDependencyPublicConfiguration(manifest, metadata);
  const caddy = await safeReleaseFile(join(store.prepared.releaseDirectory,
    "staging-dependencies.Caddyfile"));

  const candidateRoot = join(plan.candidateRoot, "post-bootstrap");
  const publicConfigDirectory = join(candidateRoot, "public");
  const privateConfigDirectory = join(candidateRoot, "private");
  const secretProjectionRootDirectory = join(candidateRoot, "secret-projections");
  const projectionPlan = planDependencySecretProjections(manifest, metadata, secretProjectionRootDirectory);
  if (projectionPlan.projections.some((projection) =>
    projection.files.some(({ purpose }) => !sourceFiles.has(purpose)))) {
    throw new Error("STAGING_DEPENDENCY_POST_BOOTSTRAP_OUTPUT_MISSING");
  }
  const resolveImageUser = supplied.resolveImageUser ?? (supplied.imageUserInspections
    ? createOciImageUserResolver(supplied.imageUserInspections) : defaultResolveImageUser);
  const applyOwnership = supplied.applyOwnership ?? chown;
  const resolved = new Map();
  for (const projection of projectionPlan.projections) {
    resolved.set(projection.consumer, await validImageUser(resolveImageUser,
      projection.image, projection.runtimeUser));
  }
  resolved.set("OIDC", await validImageUser(resolveImageUser, manifest.dependencies.oidc.image));
  await rejectExistingCandidate(candidateRoot);

  const staging = await mkdtemp(join(plan.candidateRoot, ".post-bootstrap.partial-"));
  try {
    await chmod(staging, 0o750);
    const publicDirectory = join(staging, "public"); const privateDirectory = join(staging, "private");
    await mkdir(publicDirectory, { mode: 0o755 }); await mkdir(privateDirectory, { mode: 0o700 });
    const environment = renderReferenceDependencyEnvironment(manifest, metadata, publicConfigDirectory,
      privateConfigDirectory, secretProjectionRootDirectory);
    await writeMode(join(staging, "dependencies.env"), environment, 0o600);
    await writeMode(join(publicDirectory, "vault.hcl"), publicConfiguration["vault.hcl"], 0o444);
    await writeMode(join(publicDirectory, "secret-references.json"),
      publicConfiguration["secret-references.json"], 0o444);
    await writeMode(join(publicDirectory, "Caddyfile"), caddy, 0o444);
    const dexPath = join(privateDirectory, "dex.json"); await writeMode(dexPath, dexConfiguration, 0o400);
    const oidcUser = resolved.get("OIDC"); await applyOwnership(dexPath, oidcUser.uid, oidcUser.gid);
    for (const projection of projectionPlan.projections) {
      const relative = projection.directory.slice(`${candidateRoot}/`.length);
      if (!relative || relative.startsWith("/") || relative.includes("..")) {
        throw new Error("STAGING_DEPENDENCY_PROJECTION_PATH_INVALID");
      }
      const directory = join(staging, relative); await mkdir(directory, { recursive: true, mode: 0o700 });
      const user = resolved.get(projection.consumer);
      for (const file of projection.files) {
        const target = join(directory, file.targetPath.slice(`${projection.directory}/`.length));
        await copyFile(file.sourcePath, target, constants.COPYFILE_EXCL);
        await chmod(target, file.mode); await applyOwnership(target, user.uid, user.gid);
      }
    }
    const artifactDigests = Object.fromEntries(Object.entries({ "dependencies.env": environment,
      ...publicConfiguration }).map(([name, value]) => [name, sha256(value)]));
    const evidence = { schemaVersion: 1, product: "company-os",
      status: "POST_BOOTSTRAP_CONFIGURATION_MATERIALIZED_NOT_STARTED", siteId: plan.siteId,
      releaseId: plan.releaseId, authorizationReference: plan.authorizationReference,
      previousMaterializationEvidenceDigest: sha256(preBootstrapEvidence.raw), artifactDigests,
      runtimeOwners: Object.fromEntries([...resolved].map(([consumer, user]) =>
        [consumer, { uid: user.uid, gid: user.gid }])), pendingConsumers: [], runtimeObjectsCreated: false };
    await writeMode(join(staging, "materialization-evidence.json"),
      `${JSON.stringify(evidence, null, 2)}\n`, 0o600);
    await rename(staging, candidateRoot);
    return { schemaVersion: 1, status: "POST_BOOTSTRAP_CONFIGURATION_MATERIALIZED_NOT_STARTED",
      siteId: plan.siteId, releaseId: plan.releaseId, candidateRoot, publicConfigDirectory,
      privateConfigDirectory, secretProjectionRootDirectory, pendingConsumers: [],
      runtimeObjectsCreated: false, artifactDigests };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
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

async function validateSecretSources(metadata, generationMethods = new Set(["GENERATED_ON_TARGET"])) {
  const directory = await lstat(metadata.directory);
  if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o077) !== 0) {
    throw new Error("STAGING_DEPENDENCY_SECRET_SOURCE_INVALID");
  }
  const sourceEntries = metadata.entries.filter(({ generationMethod }) =>
    generationMethods.has(generationMethod));
  const expected = sourceEntries.map(({ filename }) => filename).sort();
  if (JSON.stringify((await readdir(metadata.directory)).sort()) !== JSON.stringify(expected)) {
    throw new Error("STAGING_DEPENDENCY_SECRET_SOURCE_INVALID");
  }
  const values = new Map();
  for (const entry of sourceEntries) {
    const path = join(metadata.directory, entry.filename); const file = await lstat(path);
    if (!file.isFile() || file.isSymbolicLink() || file.nlink !== 1 || file.size < 1 ||
        file.size > 65_536 || (file.mode & 0o777) !== entry.mode) {
      throw new Error("STAGING_DEPENDENCY_SECRET_SOURCE_INVALID");
    }
    values.set(entry.purpose, await readFile(path));
  }
  return values;
}

async function readPreBootstrapEvidence(plan) {
  const path = join(plan.candidateRoot, "materialization-evidence.json");
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o077) !== 0 || metadata.size > 1_048_576) {
    throw new Error("STAGING_DEPENDENCY_PRE_BOOTSTRAP_EVIDENCE_INVALID");
  }
  const raw = await readFile(path);
  let evidence;
  try { evidence = JSON.parse(raw.toString("utf8")); }
  catch { throw new Error("STAGING_DEPENDENCY_PRE_BOOTSTRAP_EVIDENCE_INVALID"); }
  if (evidence?.schemaVersion !== 1 || evidence?.product !== "company-os" ||
      evidence?.status !== "PRE_BOOTSTRAP_CONFIGURATION_MATERIALIZED_NOT_STARTED" ||
      evidence?.siteId !== plan.siteId || evidence?.releaseId !== plan.releaseId ||
      evidence?.authorizationReference !== plan.authorizationReference ||
      evidence?.runtimeObjectsCreated !== false ||
      JSON.stringify(evidence?.pendingConsumers) !== JSON.stringify(["VAULT_SECRET_BROKER"])) {
    throw new Error("STAGING_DEPENDENCY_PRE_BOOTSTRAP_EVIDENCE_INVALID");
  }
  return { raw, evidence };
}

async function safeReleaseFile(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 || metadata.size > 1_048_576) {
    throw new Error("STAGING_DEPENDENCY_RELEASE_FILE_UNSAFE");
  }
  return readFile(path, "utf8");
}

async function validImageUser(resolver, image, explicitUser = null) {
  const value = await resolver(image, explicitUser);
  if (!value || !Number.isSafeInteger(value.uid) || !Number.isSafeInteger(value.gid) ||
      value.uid < 1 || value.uid > 65_535 || value.gid < 1 || value.gid > 65_535) {
    throw new Error("STAGING_DEPENDENCY_IMAGE_USER_INVALID");
  }
  return { uid: value.uid, gid: value.gid };
}

async function defaultResolveImageUser() {
  throw new Error("STAGING_DEPENDENCY_IMAGE_USER_RESOLVER_REQUIRED");
}

async function rejectExistingCandidate(path) {
  try { await lstat(path); throw new Error("STAGING_DEPENDENCY_CANDIDATE_EXISTS"); }
  catch (error) { if (!isCode(error, "ENOENT")) throw error; }
}

async function writeMode(path, value, mode) {
  await writeFile(path, value, { flag: "wx", mode }); await chmod(path, mode);
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

function isCode(error, code) { return error instanceof Error && "code" in error && error.code === code; }
