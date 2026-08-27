import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { renderStagingUpgradeCandidateEnvironment } from
  "../adapters/config/staging-upgrade-candidate-environment.ts";
import { readVerifiedStagingReleaseStore, resolveStagingReleaseRecord } from
  "./read-staging-release-store.mjs";
import { planStagingUpgradeFromStore } from "./plan-staging-upgrade.ts";

export async function materializeStagingUpgradeCandidate(input: {
  readonly rootDirectory: string;
  readonly authorizationFile: string;
  readonly authorizationReference: string;
  readonly runtimeContractFile: string;
  readonly activeEnvironmentFile: string;
  readonly secretProjectionDirectory: string;
  readonly now?: string;
}, supplied: { readonly validateCompose?: (argv: readonly string[]) => Promise<boolean> } = {}) {
  const plan = await planStagingUpgradeFromStore(input);
  const [activeEnvironmentRaw, runtimeContractRaw] = await Promise.all([
    privateFile(input.activeEnvironmentFile, "STAGING_UPGRADE_ACTIVE_ENVIRONMENT_FILE_UNSAFE"),
    privateFile(input.runtimeContractFile, "STAGING_UPGRADE_RUNTIME_CONTRACT_FILE_UNSAFE"),
  ]);
  const rendered = renderStagingUpgradeCandidateEnvironment(JSON.parse(runtimeContractRaw),
    activeEnvironmentRaw, input.secretProjectionDirectory);
  const store = await readVerifiedStagingReleaseStore(input.rootDirectory);
  const candidate = resolveStagingReleaseRecord(store, plan.candidate.releaseId,
    plan.candidate.sourceRevision);
  const composeRaw = await publicFile(join(candidate.releaseDirectory, "compose.staging.yml"),
    "STAGING_UPGRADE_CANDIDATE_COMPOSE_FILE_UNSAFE");
  const parent = join(input.rootDirectory, "upgrade-runtime", "candidates");
  await secureDirectories(input.rootDirectory, [join(input.rootDirectory, "upgrade-runtime"), parent]);
  const finalDirectory = join(parent, plan.operationId);
  await rejectExisting(finalDirectory);
  const staging = await mkdtemp(join(parent, `.${plan.operationId}.partial-`));
  try {
    const environmentFile = join(staging, "candidate.env");
    const composeFile = join(staging, "compose.staging.yml");
    const runtimeFile = join(staging, "runtime-contract.json");
    await Promise.all([
      writeFile(environmentFile, rendered, { flag: "wx", mode: 0o600 }),
      writeFile(composeFile, composeRaw, { flag: "wx", mode: 0o600 }),
      writeFile(runtimeFile, runtimeContractRaw, { flag: "wx", mode: 0o600 }),
    ]);
    const argv = ["docker", "compose", "--env-file", environmentFile, "-f", composeFile,
      "config", "--quiet"];
    const validateCompose = supplied.validateCompose ?? defaultValidateCompose;
    if (!await validateCompose(argv)) throw new Error("STAGING_UPGRADE_CANDIDATE_COMPOSE_INVALID");
    const evidence = { schemaVersion: 1, product: "company-os",
      status: "CANDIDATE_CONFIGURATION_MATERIALIZED_NOT_STARTED",
      operationId: plan.operationId, siteId: plan.siteId, active: plan.active,
      candidate: plan.candidate, cutover: plan.cutover,
      authorizationReference: plan.authorizationReference,
      files: { environmentDigest: sha256(rendered), composeDigest: sha256(composeRaw),
        runtimeContractDigest: sha256(runtimeContractRaw) },
      composeValidated: true, secretMaterialIncluded: false, runtimeObjectsCreated: false,
      trafficMoved: false, automaticRollbackAttempted: false } as const;
    await writeFile(join(staging, "materialization-evidence.json"),
      `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(staging, finalDirectory);
    return { ...evidence, candidateDirectory: finalDirectory };
  } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
}

async function secureDirectories(root: string, paths: readonly string[]) {
  for (const path of paths) {
    try { await mkdir(path, { mode: 0o700 }); }
    catch (error) { if (!isCode(error, "EEXIST")) throw error; }
    const metadata = await lstat(path);
    if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) {
      throw new Error("STAGING_UPGRADE_CANDIDATE_DIRECTORY_UNSAFE");
    }
  }
  const rootMetadata = await lstat(root);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink() || (rootMetadata.mode & 0o027) !== 0) {
    throw new Error("STAGING_UPGRADE_ROOT_UNSAFE");
  }
}
async function rejectExisting(path: string) {
  try { await lstat(path); throw new Error("STAGING_UPGRADE_CANDIDATE_ALREADY_MATERIALIZED"); }
  catch (error) { if (!isCode(error, "ENOENT")) throw error; }
}
async function privateFile(path: string, code: string) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o077) !== 0 || metadata.size < 2 || metadata.size > 1_048_576) throw new Error(code);
  return readFile(path, "utf8");
}
async function publicFile(path: string, code: string) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o022) !== 0 || metadata.size < 2 || metadata.size > 1_048_576) throw new Error(code);
  return readFile(path, "utf8");
}
function defaultValidateCompose(argv: readonly string[]) {
  const result = spawnSync(argv[0], argv.slice(1), { stdio: "inherit", timeout: 60_000 });
  return Promise.resolve(result.status === 0);
}
function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
