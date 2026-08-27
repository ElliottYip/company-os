import { spawnSync } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { evaluateStagingRuntimeStatus } from "../adapters/config/staging-runtime-status.ts";
import { verifyStagingReleaseBundle } from "./create-staging-release-bundle.mjs";
import {
  stagingDependencyExpectationFromPublicEnvironment,
  validateStagingDependencies,
} from "./validate-staging-dependencies.ts";
import { parsePublicStagingEnvironment } from
  "../adapters/config/staging-deployment-doctor.ts";
import {
  readVerifiedStagingReleaseStore,
  resolveStagingReleaseRecord,
} from "./read-staging-release-store.mjs";

const STORE_MARKER = "company-os staging release store v1\n";
const RELEASE_ID = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?-[a-f0-9]{12}$/;
const REVISION = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const START_STATES = new Set(["STARTING", "STARTED_NOT_ACCEPTED", "START_FAILED_REQUIRES_REVIEW"]);

export async function inspectStagingRuntime(input, supplied = {}) {
  const rootDirectory = await validatedRoot(input.rootDirectory);
  const startupState = await readStartupState(rootDirectory);
  const store = await readVerifiedStagingReleaseStore(rootDirectory);
  const active = startupState
    ? resolveStagingReleaseRecord(store, startupState.releaseId, startupState.sourceRevision)
    : store.prepared;
  await verifyStagingReleaseBundle(active.releaseDirectory);
  const release = JSON.parse(await readFile(join(active.releaseDirectory, "release-manifest.json"), "utf8"));
  const dependencyAdmission = startupState ? await (async () => {
    const publicEnvironment = parsePublicStagingEnvironment(
      await safeRuntimeFile(startupState.environmentFile));
    if (publicEnvironment.COMPANY_OS_COMPOSE_PROJECT !== startupState.composeProject ||
        publicEnvironment.COMPANY_OS_PRODUCT_NETWORK !== startupState.productNetwork ||
        publicEnvironment.COMPANY_OS_API_LOOPBACK_PORT !== String(startupState.ports.api) ||
        publicEnvironment.COMPANY_OS_WEB_LOOPBACK_PORT !== String(startupState.ports.web) ||
        publicEnvironment.COMPANY_OS_REFERENCE_DATA_NODE_PORT !== String(startupState.ports.referenceDataNode)) {
      throw new Error("STAGING_STATUS_ACTIVE_TOPOLOGY_MISMATCH");
    }
    await safeRuntimeFile(startupState.dependencyManifestFile);
    return validateStagingDependencies(startupState.dependencyManifestFile,
      stagingDependencyExpectationFromPublicEnvironment(publicEnvironment, rootDirectory));
  })() : null;
  const expected = { releaseId: active.releaseId, releaseVersion: active.releaseVersion,
    sourceRevision: active.sourceRevision,
    dependencyManifestDigest: dependencyAdmission?.manifestDigest ?? `sha256:${"0".repeat(64)}`,
    images: { api: release.images.api, web: release.images.web,
      referenceDataNode: release.images.referenceDataNode } };
  const candidate = store.prepared.releaseId === active.releaseId ? null : {
    id: store.prepared.releaseId, version: store.prepared.releaseVersion,
    sourceRevision: store.prepared.sourceRevision,
  };
  if (!startupState) return { ...evaluateStagingRuntimeStatus({ expected, startupState: null,
    containers: [], probes: { apiReady: false, webReachable: false } }), candidate };

  const dependencies = { listContainers: () => defaultListContainers(startupState.composeProject),
    probe: defaultProbe, ...supplied };
  const containers = await dependencies.listContainers();
  const [apiReady, webReachable] = await Promise.all([
    dependencies.probe({ id: "API_READY", url: `http://127.0.0.1:${startupState.ports.api}/ready` }),
    dependencies.probe({ id: "WEB_REACHABLE", url: `http://127.0.0.1:${startupState.ports.web}/` }),
  ]);
  return { ...evaluateStagingRuntimeStatus({ expected, startupState, containers,
    probes: { apiReady, webReachable } }), candidate };
}

async function validatedRoot(value) {
  if (typeof value !== "string" || !isAbsolute(value)) throw new Error("STAGING_STATUS_ROOT_ABSOLUTE_PATH_REQUIRED");
  const rootDirectory = resolve(value);
  if (rootDirectory === "/" || rootDirectory === resolve(homedir())) throw new Error("STAGING_STATUS_ROOT_TOO_BROAD");
  const rootStat = await lstat(rootDirectory);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || (rootStat.mode & 0o027) !== 0) {
    throw new Error("STAGING_STATUS_ROOT_UNSAFE");
  }
  const markerPath = join(rootDirectory, ".company-os-release-store"); const marker = await lstat(markerPath);
  if (!marker.isFile() || marker.isSymbolicLink() || marker.nlink !== 1 || (marker.mode & 0o077) !== 0 ||
      await readFile(markerPath, "utf8") !== STORE_MARKER) throw new Error("STAGING_STATUS_STORE_MARKER_UNSAFE");
  return rootDirectory;
}

async function readStartupState(rootDirectory) {
  const path = join(rootDirectory, "startup-state.json");
  try {
    const valueStat = await lstat(path);
    if (!valueStat.isFile() || valueStat.isSymbolicLink() || valueStat.nlink !== 1 || (valueStat.mode & 0o077) !== 0) {
      throw new Error("STAGING_STATUS_STATE_UNSAFE");
    }
    const value = JSON.parse(await readFile(path, "utf8"));
    if (value?.schemaVersion !== 1 || value.product !== "company-os" || !START_STATES.has(value.state) ||
        !RELEASE_ID.test(value.releaseId ?? "") || !REVISION.test(value.sourceRevision ?? "") ||
        !DIGEST.test(value.dependencyManifestDigest ?? "") ||
        typeof value.acceptanceClaimed !== "boolean") throw new Error("STAGING_STATUS_STATE_INVALID");
    const runtime = activeRuntime(value.activeRuntime);
    const configuration = activeConfiguration(value.activeConfiguration, rootDirectory);
    return { state: value.state, releaseId: value.releaseId, sourceRevision: value.sourceRevision,
      dependencyManifestDigest: value.dependencyManifestDigest,
      acceptanceClaimed: value.acceptanceClaimed,
      composeProject: runtime?.composeProject ?? "company-os-staging",
      productNetwork: runtime?.productNetwork ?? "company-os-staging_internal",
      ports: runtime?.ports ?? { api: 4601, web: 4600, referenceDataNode: 4322 },
      environmentFile: configuration?.environmentFile ?? join(rootDirectory, "staging.env"),
      dependencyManifestFile: configuration?.dependencyManifestFile ??
        join(rootDirectory, "staging-dependencies.json") };
  } catch (error) {
    if (isCode(error, "ENOENT")) return null;
    throw error;
  }
}

function defaultListContainers(composeProject) {
  const ids = command(["docker", "ps", "-a", "--filter",
    `label=com.docker.compose.project=${composeProject}`, "--format", "{{.ID}}"])
    .split(/\r?\n/).filter(Boolean);
  return Promise.resolve(ids.map((id) => {
    const template = "{\"service\":{{json (index .Config.Labels \"com.docker.compose.service\")}}," +
      "\"image\":{{json .Config.Image}},\"status\":{{json .State.Status}}," +
      "\"health\":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}}";
    const value = JSON.parse(command(["docker", "inspect", "--format", template, id]));
    if (!["service", "image", "status", "health"].every((key) => Object.hasOwn(value, key)) ||
        typeof value.service !== "string" || typeof value.image !== "string" ||
        typeof value.status !== "string" || (value.health !== null && typeof value.health !== "string")) {
      throw new Error("STAGING_STATUS_CONTAINER_RECORD_INVALID");
    }
    return value;
  }));
}

function activeRuntime(value) {
  if (value === undefined) return null;
  const ports = value?.ports;
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      typeof value.composeProject !== "string" || !/^[a-z0-9][a-z0-9-]{2,95}$/.test(value.composeProject) ||
      typeof value.productNetwork !== "string" || !/^[a-z0-9][a-z0-9-]{2,95}$/.test(value.productNetwork) ||
      !ports || typeof ports !== "object" || Array.isArray(ports) ||
      ![ports.api, ports.web, ports.referenceDataNode].every((port) =>
        Number.isSafeInteger(port) && port >= 1024 && port <= 65535) ||
      new Set([ports.api, ports.web, ports.referenceDataNode]).size !== 3) {
    throw new Error("STAGING_STATUS_ACTIVE_RUNTIME_INVALID");
  }
  return { composeProject: value.composeProject, productNetwork: value.productNetwork,
    ports: { api: ports.api, web: ports.web,
    referenceDataNode: ports.referenceDataNode } };
}

function activeConfiguration(value, rootDirectory) {
  if (value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("STAGING_STATUS_ACTIVE_CONFIGURATION_INVALID");
  }
  const environmentFile = safeContained(value.environmentFile, rootDirectory);
  const dependencyManifestFile = safeContained(value.dependencyManifestFile, rootDirectory);
  return { environmentFile, dependencyManifestFile };
}

function safeContained(value, rootDirectory) {
  if (typeof value !== "string" || !isAbsolute(value)) throw new Error("STAGING_STATUS_ACTIVE_CONFIGURATION_INVALID");
  const path = resolve(value); const suffix = path.slice(rootDirectory.length + 1);
  if (!path.startsWith(`${rootDirectory}/`) || !suffix) throw new Error("STAGING_STATUS_ACTIVE_CONFIGURATION_INVALID");
  return path;
}

async function safeRuntimeFile(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o077) !== 0 || metadata.size < 2 || metadata.size > 1_048_576) {
    throw new Error("STAGING_STATUS_ACTIVE_CONFIGURATION_FILE_UNSAFE");
  }
  return readFile(path, "utf8");
}

function command(argv) {
  const result = spawnSync(argv[0], argv.slice(1), { encoding: "utf8", timeout: 10_000,
    stdio: ["ignore", "pipe", "ignore"] });
  if (result.status !== 0) throw new Error("STAGING_STATUS_DOCKER_INSPECTION_FAILED");
  return result.stdout.trim();
}

async function defaultProbe({ url }) {
  try { const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(3_000) });
    return response.ok; }
  catch { return false; }
}

function isCode(error, code) { return error instanceof Error && "code" in error && error.code === code; }

function argumentsFrom(values) {
  const result = { rootDirectory: "/srv/company-os/staging" };
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index]; const value = values[index + 1];
    if (flag !== "--root" || !value) throw new Error("STAGING_STATUS_ARGUMENT_INVALID");
    result.rootDirectory = value;
  }
  return result;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  process.stdout.write(`${JSON.stringify(await inspectStagingRuntime(argumentsFrom(process.argv.slice(2))), null, 2)}\n`);
}
