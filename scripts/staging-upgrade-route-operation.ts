import { createHash } from "node:crypto";
import { lstat, mkdir, readlink, rename, rm, symlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { parseStagingIngressRouteContract, renderStagingIngressRouteGeneration,
  type StagingIngressRouteContract } from "../adapters/config/staging-ingress-route-contract.ts";
import { parseStagingUpgradeRuntimeContract,
  type StagingUpgradeRuntimeContract } from "../adapters/config/staging-upgrade-runtime-contract.ts";

const RELEASE_ID = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?-[a-f0-9]{12}$/;

export async function createStagingUpgradeRouteOperation(input: {
  readonly candidateDirectory: string;
  readonly routeDirectory: string;
  readonly operationId: string;
  readonly siteId: string;
  readonly candidateReleaseId: string;
  readonly runtimeContract: StagingUpgradeRuntimeContract;
  readonly routeContract: StagingIngressRouteContract;
}, supplied: {
  readonly validateConfiguration: (configurationFile: string) => Promise<void>;
  readonly reloadConfiguration: (configurationFile: string) => Promise<void>;
  readonly fetch?: typeof fetch;
  readonly now?: () => string;
}) {
  const candidateDirectory = await privateDirectory(input.candidateDirectory,
    "STAGING_UPGRADE_ROUTE_CANDIDATE_DIRECTORY_UNSAFE");
  const routeDirectory = await privateDirectory(input.routeDirectory,
    "STAGING_UPGRADE_ROUTE_DIRECTORY_UNSAFE");
  const runtime = parseStagingUpgradeRuntimeContract(input.runtimeContract);
  const route = parseStagingIngressRouteContract(input.routeContract, runtime);
  if (input.siteId !== runtime.siteId || input.candidateReleaseId !== runtime.candidate.releaseId ||
      !RELEASE_ID.test(input.candidateReleaseId)) throw new Error("STAGING_UPGRADE_ROUTE_BINDING_INVALID");
  const generation = renderStagingIngressRouteGeneration(route, runtime, "candidate");
  const evidenceDirectory = await ensurePrivate(join(candidateDirectory, "step-evidence"));
  const generations = await ensurePrivate(join(routeDirectory, "generations"));
  const request = supplied.fetch ?? fetch;
  const now = supplied.now ?? (() => new Date().toISOString());

  return async () => {
    const generationDirectory = join(generations, generation.releaseId);
    await mkdir(generationDirectory, { mode: 0o700 });
    const configurationFile = join(generationDirectory, "Caddyfile");
    await writeFile(configurationFile, generation.caddyfile, { flag: "wx", mode: 0o600 });
    await supplied.validateConfiguration(configurationFile);

    const current = join(routeDirectory, "current");
    const previousReleaseId = await currentReleaseId(current);
    const partial = join(routeDirectory, `.current.partial-${process.pid}-${Date.now()}`);
    try {
      await symlink(join("generations", generation.releaseId), partial, "dir");
      await rename(partial, current);
    } finally { await rm(partial, { force: true }); }
    await supplied.reloadConfiguration(join(current, "Caddyfile"));

    const verified = await Promise.all([
      verifyRelease(request, route.router.stablePorts.web, "/", generation.releaseId),
      verifyRelease(request, route.router.stablePorts.api, "/health", generation.releaseId),
    ]);
    const evidence = { schemaVersion: 1, product: "company-os", operationId: input.operationId,
      siteId: input.siteId, candidateReleaseId: generation.releaseId, step: "route-traffic",
      outcome: "STABLE_WEB_AND_API_ROUTE_TO_CANDIDATE_RELEASE", capturedAt: now(),
      previousReleaseId, routeConfigurationDigest: sha256(generation.caddyfile),
      verifiedStableEndpointCount: verified.length, customerRecordsIncluded: false,
      secretMaterialIncluded: false, automaticRollbackAttempted: false } as const;
    const raw = `${JSON.stringify(evidence, null, 2)}\n`; const evidenceDigest = sha256(raw);
    await writeFile(join(evidenceDirectory, "route-traffic.json"), raw, { flag: "wx", mode: 0o600 });
    return { schemaVersion: 1 as const, product: "company-os" as const,
      operationId: input.operationId, siteId: input.siteId, candidateReleaseId: generation.releaseId,
      step: "route-traffic" as const, outcome: evidence.outcome,
      evidenceDigest, secretMaterialIncluded: false as const };
  };
}

async function verifyRelease(request: typeof fetch, port: number, path: string, releaseId: string) {
  const response = await request(`http://127.0.0.1:${port}${path}`, { method: "GET", redirect: "error",
    signal: AbortSignal.timeout(5_000) });
  if (!response.ok || response.headers.get("x-company-os-release-id") !== releaseId) {
    throw new Error("STAGING_UPGRADE_ROUTE_RELEASE_ID_MISMATCH");
  }
  await response.body?.cancel();
  return true;
}
async function currentReleaseId(path: string): Promise<string | null> {
  try {
    const metadata = await lstat(path);
    if (!metadata.isSymbolicLink()) throw new Error("STAGING_UPGRADE_ROUTE_CURRENT_UNSAFE");
    const target = await readlink(path); const releaseId = basename(target);
    if (target !== join("generations", releaseId) || !RELEASE_ID.test(releaseId)) {
      throw new Error("STAGING_UPGRADE_ROUTE_CURRENT_UNSAFE");
    }
    return releaseId;
  } catch (error) { if (isCode(error, "ENOENT")) return null; throw error; }
}
async function privateDirectory(value: string, code: string) {
  const path = resolve(value); const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) throw new Error(code);
  return path;
}
async function ensurePrivate(path: string) {
  try { await mkdir(path, { mode: 0o700 }); } catch (error) { if (!isCode(error, "EEXIST")) throw error; }
  return privateDirectory(path, "STAGING_UPGRADE_ROUTE_DIRECTORY_UNSAFE");
}
function sha256(value: string) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
