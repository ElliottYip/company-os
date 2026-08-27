import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { parseStagingUpgradeAuthorization } from
  "../adapters/config/staging-upgrade-authorization.ts";
import { verifyStagingReleaseBundle } from "./create-staging-release-bundle.mjs";
import { createReleaseCutoverPlan } from "./plan-release-cutover.mjs";
import { readVerifiedStagingReleaseStore, resolveStagingReleaseRecord } from
  "./read-staging-release-store.mjs";

const STORE_MARKER = "company-os staging release store v1\n";

export interface StagingUpgradeEvidence {
  readonly activeRaw: string;
  readonly candidateRaw: string;
  readonly startupRaw: string;
  readonly siteContractRaw: string;
}

export function createStagingUpgradePreparationPlan(
  authorizationValue: unknown,
  evidence: StagingUpgradeEvidence,
  options: { readonly now: string; readonly authorizationReference: string },
) {
  const authorization = parseStagingUpgradeAuthorization(authorizationValue);
  if (!validTimestamp(options.now) || Date.parse(options.now) >= Date.parse(authorization.operation.expiresAt)) {
    throw new Error("STAGING_UPGRADE_AUTHORIZATION_EXPIRED");
  }
  if (options.authorizationReference !== authorization.authorization.preparation) {
    throw new Error("STAGING_UPGRADE_PREPARATION_AUTHORIZATION_MISMATCH");
  }
  if (sha256(evidence.startupRaw) !== authorization.active.startupStateDigest) {
    throw new Error("STAGING_UPGRADE_ACTIVE_STATE_MISMATCH");
  }
  const startup = json(evidence.startupRaw, "STAGING_UPGRADE_ACTIVE_STATE_INVALID");
  if (startup?.schemaVersion !== 1 || startup.product !== "company-os" ||
      startup.state !== "STARTED_NOT_ACCEPTED" || startup.acceptanceClaimed !== false ||
      startup.automaticRollbackAttempted !== false ||
      startup.releaseId !== authorization.active.releaseId ||
      startup.sourceRevision !== authorization.active.sourceRevision) {
    throw new Error("STAGING_UPGRADE_ACTIVE_STATE_INVALID");
  }
  if (sha256(evidence.activeRaw) !== authorization.active.releaseManifestDigest) {
    throw new Error("STAGING_UPGRADE_ACTIVE_RELEASE_MISMATCH");
  }
  if (sha256(evidence.candidateRaw) !== authorization.candidate.releaseManifestDigest) {
    throw new Error("STAGING_UPGRADE_CANDIDATE_RELEASE_MISMATCH");
  }
  const active = json(evidence.activeRaw, "STAGING_UPGRADE_ACTIVE_RELEASE_INVALID");
  const candidate = json(evidence.candidateRaw, "STAGING_UPGRADE_CANDIDATE_RELEASE_INVALID");
  releaseBinding(active, authorization.active, "ACTIVE");
  releaseBinding(candidate, authorization.candidate, "CANDIDATE");
  if (sha256(evidence.siteContractRaw) !== authorization.candidate.siteContractDigest) {
    throw new Error("STAGING_UPGRADE_CANDIDATE_CONTRACT_MISMATCH");
  }
  const siteContract = json(evidence.siteContractRaw, "STAGING_UPGRADE_CANDIDATE_CONTRACT_INVALID");
  if (siteContract?.schemaVersion !== 1 || siteContract.siteId !== authorization.operation.siteId ||
      siteContract.releaseId !== authorization.candidate.releaseId) {
    throw new Error("STAGING_UPGRADE_CANDIDATE_CONTRACT_INVALID");
  }
  const cutover = createReleaseCutoverPlan(active, candidate);
  if (cutover.cutoverId !== authorization.cutover.planId ||
      sha256(JSON.stringify(cutover)) !== authorization.cutover.planDigest) {
    throw new Error("STAGING_UPGRADE_CUTOVER_PLAN_MISMATCH");
  }
  const steps = cutover.orderedSteps.map(({ id }) => id)
    .filter((id) => id !== "route-traffic" && id !== "observe");
  return {
    schemaVersion: 1,
    product: "company-os",
    status: "PLANNED_NOT_APPLIED",
    phase: "UPGRADE_PREPARATION",
    operationId: authorization.operation.id,
    siteId: authorization.operation.siteId,
    accountableOperatorReference: authorization.operation.accountableOperatorReference,
    expiresAt: authorization.operation.expiresAt,
    active: { releaseId: authorization.active.releaseId,
      sourceRevision: authorization.active.sourceRevision,
      releaseManifestDigest: authorization.active.releaseManifestDigest,
      startupStateDigest: authorization.active.startupStateDigest },
    candidate: { releaseId: authorization.candidate.releaseId,
      sourceRevision: authorization.candidate.sourceRevision,
      releaseManifestDigest: authorization.candidate.releaseManifestDigest,
      siteContractDigest: authorization.candidate.siteContractDigest },
    cutover: { planId: cutover.cutoverId, planDigest: authorization.cutover.planDigest },
    authorizationReference: authorization.authorization.preparation,
    steps,
    trafficMoved: false,
    automaticRollbackAttempted: false,
    nextPhase: { id: "TRAFFIC_CUTOVER",
      authorizationReference: authorization.authorization.trafficCutover,
      prerequisiteStatus: "UPGRADE_PREPARATION_COMPLETE_NOT_ROUTED" },
    rollback: { authorizationReference: authorization.authorization.rollback,
      automatic: false, strategy: cutover.rollback.strategy },
  } as const;
}

export async function inspectStagingUpgradeBindings(input: { readonly rootDirectory: string }) {
  const gathered = await gatherStoreEvidence(input.rootDirectory);
  return {
    schemaVersion: 1,
    product: "company-os",
    status: "UPGRADE_BINDINGS_INSPECTED_NOT_AUTHORIZED",
    siteId: gathered.siteId,
    active: gathered.activeBinding,
    candidate: gathered.candidateBinding,
    cutover: gathered.cutoverBinding,
    authorizationPresent: false,
    mutationPerformed: false,
  } as const;
}

export async function planStagingUpgradeFromStore(input: {
  readonly rootDirectory: string;
  readonly authorizationFile: string;
  readonly authorizationReference: string;
  readonly now?: string;
}) {
  const authorizationPath = safeAbsolute(input.authorizationFile,
    "STAGING_UPGRADE_AUTHORIZATION_PATH_REQUIRED");
  const authorizationRaw = await safePrivateFile(authorizationPath,
    "STAGING_UPGRADE_AUTHORIZATION_FILE_UNSAFE");
  const authorization = json(authorizationRaw, "STAGING_UPGRADE_AUTHORIZATION_INVALID");
  const gathered = await gatherStoreEvidence(input.rootDirectory);
  return createStagingUpgradePreparationPlan(authorization, gathered.evidence, {
    now: input.now ?? new Date().toISOString(),
    authorizationReference: input.authorizationReference,
  });
}

async function gatherStoreEvidence(rootValue: string) {
  const rootDirectory = await safeRoot(rootValue);
  const store = await readVerifiedStagingReleaseStore(rootDirectory);
  const startupRaw = await safePrivateFile(join(rootDirectory, "startup-state.json"),
    "STAGING_UPGRADE_ACTIVE_STATE_FILE_UNSAFE");
  const startup = json(startupRaw, "STAGING_UPGRADE_ACTIVE_STATE_INVALID");
  const active = resolveStagingReleaseRecord(store, startup?.releaseId, startup?.sourceRevision);
  const candidate = store.prepared;
  if (candidate.releaseId === active.releaseId || !candidate.siteContract) {
    throw new Error("STAGING_UPGRADE_CANDIDATE_NOT_PREPARED");
  }
  await Promise.all([
    verifyStagingReleaseBundle(active.releaseDirectory),
    verifyStagingReleaseBundle(candidate.releaseDirectory),
  ]);
  const activeRaw = await safePublicFile(join(active.releaseDirectory, "release-manifest.json"),
    "STAGING_UPGRADE_ACTIVE_RELEASE_FILE_UNSAFE");
  const candidateRaw = await safePublicFile(join(candidate.releaseDirectory, "release-manifest.json"),
    "STAGING_UPGRADE_CANDIDATE_RELEASE_FILE_UNSAFE");
  const activeManifest = json(activeRaw, "STAGING_UPGRADE_ACTIVE_RELEASE_INVALID");
  const candidateManifest = json(candidateRaw, "STAGING_UPGRADE_CANDIDATE_RELEASE_INVALID");
  const siteContractRaw = `${JSON.stringify(candidate.siteContract)}\n`;
  const cutover = createReleaseCutoverPlan(activeManifest, candidateManifest);
  const activeBinding = { releaseId: active.releaseId, sourceRevision: active.sourceRevision,
    releaseManifestDigest: sha256(activeRaw), startupStateDigest: sha256(startupRaw) };
  const candidateBinding = { releaseId: candidate.releaseId, sourceRevision: candidate.sourceRevision,
    releaseManifestDigest: sha256(candidateRaw), siteContractDigest: sha256(siteContractRaw) };
  const cutoverBinding = { planId: cutover.cutoverId, planDigest: sha256(JSON.stringify(cutover)) };
  return { siteId: candidate.siteContract.siteId, activeBinding, candidateBinding, cutoverBinding,
    evidence: { activeRaw, candidateRaw, startupRaw, siteContractRaw } };
}

function releaseBinding(value: unknown, expected: { readonly releaseId: string; readonly sourceRevision: string },
  side: "ACTIVE" | "CANDIDATE") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`STAGING_UPGRADE_${side}_RELEASE_INVALID`);
  }
  const record = value as Record<string, unknown>;
  const releaseId = `${String(record.releaseVersion)}-${String(record.sourceRevision).slice(0, 12)}`;
  if (record.product !== "company-os" || record.sourceRevision !== expected.sourceRevision ||
      releaseId !== expected.releaseId) throw new Error(`STAGING_UPGRADE_${side}_RELEASE_MISMATCH`);
}

function json(value: string, code: string): any {
  try { return JSON.parse(value); } catch { throw new Error(code); }
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function validTimestamp(value: string): boolean {
  if (!Number.isFinite(Date.parse(value))) return false;
  try { return new Date(value).toISOString() === value; } catch { return false; }
}

async function safeRoot(value: string): Promise<string> {
  const root = safeAbsolute(value, "STAGING_UPGRADE_ROOT_ABSOLUTE_PATH_REQUIRED");
  if (root === "/" || root === resolve(homedir())) throw new Error("STAGING_UPGRADE_ROOT_TOO_BROAD");
  const metadata = await lstat(root);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o027) !== 0) {
    throw new Error("STAGING_UPGRADE_ROOT_UNSAFE");
  }
  const marker = await safePrivateFile(join(root, ".company-os-release-store"),
    "STAGING_UPGRADE_STORE_MARKER_UNSAFE");
  if (marker !== STORE_MARKER) throw new Error("STAGING_UPGRADE_STORE_MARKER_UNSAFE");
  return root;
}

async function safePrivateFile(path: string, code: string): Promise<string> {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o077) !== 0 || metadata.size < 2 || metadata.size > 1_048_576) {
    throw new Error(code);
  }
  return readFile(path, "utf8");
}

async function safePublicFile(path: string, code: string): Promise<string> {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o022) !== 0 || (metadata.mode & 0o007) !== 0 ||
      metadata.size < 2 || metadata.size > 1_048_576) throw new Error(code);
  return readFile(path, "utf8");
}

function safeAbsolute(value: string, code: string): string {
  if (typeof value !== "string" || !isAbsolute(value)) throw new Error(code);
  return resolve(value);
}

function argumentsFrom(values: readonly string[]) {
  const result: { rootDirectory: string; authorizationFile?: string;
    authorizationReference?: string; inspectBindings: boolean } = {
      rootDirectory: "/srv/company-os/staging", inspectBindings: false,
    };
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (flag === "--inspect-bindings") result.inspectBindings = true;
    else if (flag === "--root") result.rootDirectory = values[++index] ?? "";
    else if (flag === "--authorization-file") result.authorizationFile = values[++index];
    else if (flag === "--authorization") result.authorizationReference = values[++index];
    else throw new Error("STAGING_UPGRADE_ARGUMENT_INVALID");
  }
  if (!result.inspectBindings && (!result.authorizationFile || !result.authorizationReference)) {
    throw new Error("STAGING_UPGRADE_AUTHORIZATION_ARGUMENTS_REQUIRED");
  }
  if (result.inspectBindings && (result.authorizationFile || result.authorizationReference)) {
    throw new Error("STAGING_UPGRADE_INSPECTION_MUST_BE_UNAUTHORIZED");
  }
  return result;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const options = argumentsFrom(process.argv.slice(2));
  const result = options.inspectBindings
    ? await inspectStagingUpgradeBindings({ rootDirectory: options.rootDirectory })
    : await planStagingUpgradeFromStore({ rootDirectory: options.rootDirectory,
      authorizationFile: options.authorizationFile!,
      authorizationReference: options.authorizationReference! });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
