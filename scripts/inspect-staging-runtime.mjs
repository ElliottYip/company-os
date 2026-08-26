import { spawnSync } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { evaluateStagingRuntimeStatus } from "../adapters/config/staging-runtime-status.ts";
import { verifyStagingReleaseBundle } from "./create-staging-release-bundle.mjs";

const STORE_MARKER = "company-os staging release store v1\n";
const RELEASE_ID = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?-[a-f0-9]{12}$/;
const REVISION = /^[a-f0-9]{40}$/;
const START_STATES = new Set(["STARTING", "STARTED_NOT_ACCEPTED", "START_FAILED_REQUIRES_REVIEW"]);

export async function inspectStagingRuntime(input, supplied = {}) {
  const rootDirectory = await validatedRoot(input.rootDirectory);
  const prepared = await preparedRelease(rootDirectory);
  await verifyStagingReleaseBundle(prepared.releaseDirectory);
  const release = JSON.parse(await readFile(join(prepared.releaseDirectory, "release-manifest.json"), "utf8"));
  const expected = { releaseId: prepared.releaseId, releaseVersion: prepared.releaseVersion,
    sourceRevision: prepared.sourceRevision, images: { api: release.images.api, web: release.images.web } };
  const startupState = await readStartupState(rootDirectory);
  if (!startupState) return evaluateStagingRuntimeStatus({ expected, startupState: null,
    containers: [], probes: { apiReady: false, webReachable: false } });

  const dependencies = { listContainers: defaultListContainers, probe: defaultProbe, ...supplied };
  const containers = await dependencies.listContainers();
  const [apiReady, webReachable] = await Promise.all([
    dependencies.probe({ id: "API_READY", url: "http://127.0.0.1:4601/ready" }),
    dependencies.probe({ id: "WEB_REACHABLE", url: "http://127.0.0.1:4600/" }),
  ]);
  return evaluateStagingRuntimeStatus({ expected, startupState, containers,
    probes: { apiReady, webReachable } });
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

async function preparedRelease(rootDirectory) {
  const path = join(rootDirectory, "release-store.json"); const valueStat = await lstat(path);
  if (!valueStat.isFile() || valueStat.isSymbolicLink() || valueStat.nlink !== 1 || (valueStat.mode & 0o077) !== 0) {
    throw new Error("STAGING_STATUS_RELEASE_STORE_UNSAFE");
  }
  const store = JSON.parse(await readFile(path, "utf8")); const prepared = store?.prepared;
  if (store?.schemaVersion !== 1 || store.product !== "company-os" || store.state !== "PREPARED_NOT_STARTED" ||
      !prepared || !RELEASE_ID.test(prepared.releaseId ?? "") || !REVISION.test(prepared.sourceRevision ?? "") ||
      typeof prepared.releaseVersion !== "string" ||
      resolve(prepared.releaseDirectory ?? "") !== join(rootDirectory, "releases", prepared.releaseId)) {
    throw new Error("STAGING_STATUS_RELEASE_STORE_INVALID");
  }
  return prepared;
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
        typeof value.acceptanceClaimed !== "boolean") throw new Error("STAGING_STATUS_STATE_INVALID");
    return { state: value.state, releaseId: value.releaseId, sourceRevision: value.sourceRevision,
      acceptanceClaimed: value.acceptanceClaimed };
  } catch (error) {
    if (isCode(error, "ENOENT")) return null;
    throw error;
  }
}

function defaultListContainers() {
  const ids = command(["docker", "ps", "-a", "--filter",
    "label=com.docker.compose.project=company-os-staging", "--format", "{{.ID}}"])
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
