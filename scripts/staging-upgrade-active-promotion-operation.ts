import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { parsePublicStagingEnvironment } from
  "../adapters/config/staging-deployment-doctor.ts";
import { parseStagingUpgradeRuntimeContract, type StagingUpgradeRuntimeContract } from
  "../adapters/config/staging-upgrade-runtime-contract.ts";
import { readVerifiedStagingReleaseStore, resolveStagingReleaseRecord } from
  "./read-staging-release-store.mjs";
import { stagingDependencyExpectationFromPublicEnvironment, validateStagingDependencies } from
  "./validate-staging-dependencies.ts";

const DIGEST = /^sha256:[a-f0-9]{64}$/;

export async function createStagingUpgradeActivePromotionOperation(input: {
  readonly rootDirectory: string;
  readonly candidateDirectory: string;
  readonly operationId: string;
  readonly siteId: string;
  readonly authorizationReference: string;
  readonly expectedActiveStateDigest: string;
  readonly runtimeContract: StagingUpgradeRuntimeContract;
}, supplied: { readonly now?: () => string } = {}) {
  const root = await privateDirectory(input.rootDirectory, false);
  const candidateDirectory = await privateDirectory(input.candidateDirectory, true);
  if (!inside(root, candidateDirectory) || !DIGEST.test(input.expectedActiveStateDigest)) invalid("BINDING_INVALID");
  const runtime = parseStagingUpgradeRuntimeContract(input.runtimeContract);
  if (runtime.operationId !== input.operationId || runtime.siteId !== input.siteId) invalid("BINDING_INVALID");
  const store = await readVerifiedStagingReleaseStore(root);
  const active = resolveStagingReleaseRecord(store, runtime.active.releaseId);
  const candidate = resolveStagingReleaseRecord(store, runtime.candidate.releaseId);
  if (!candidate.siteContract || candidate.siteContract.siteId !== input.siteId) invalid("CANDIDATE_INVALID");
  const environmentFile = join(candidateDirectory, "candidate.env");
  const dependencyFile = join(candidateDirectory, "staging-dependencies.json");
  const environmentRaw = await privateFile(environmentFile);
  await privateFile(dependencyFile);
  const environment = parsePublicStagingEnvironment(environmentRaw);
  if (environment.COMPANY_OS_RELEASE_ID !== candidate.releaseId ||
      environment.COMPANY_OS_COMPOSE_PROJECT !== runtime.candidate.composeProject ||
      environment.COMPANY_OS_PRODUCT_NETWORK !== runtime.candidate.productNetwork ||
      environment.COMPANY_OS_API_LOOPBACK_PORT !== String(runtime.candidate.ports.api) ||
      environment.COMPANY_OS_WEB_LOOPBACK_PORT !== String(runtime.candidate.ports.web) ||
      environment.COMPANY_OS_REFERENCE_DATA_NODE_PORT !== String(runtime.candidate.ports.referenceDataNode)) {
    invalid("CANDIDATE_INVALID");
  }
  const dependencyAdmission = await validateStagingDependencies(dependencyFile,
    stagingDependencyExpectationFromPublicEnvironment(environment, root));
  const activeStatePath = join(root, "startup-state.json");
  const evidenceDirectory = await ensurePrivate(join(candidateDirectory, "step-evidence"));
  const recordsDirectory = await ensurePrivate(join(root, "upgrade-active-records"));
  const now = supplied.now ?? (() => new Date().toISOString());
  return async () => {
    const [routeRaw, observationRaw, activeStateRaw] = await Promise.all([
      privateFile(join(candidateDirectory, "step-evidence", "route-traffic.json")),
      privateFile(join(candidateDirectory, "step-evidence", "observe.json")),
      privateFile(activeStatePath),
    ]);
    validateStep(routeRaw, input, "route-traffic", "STABLE_WEB_AND_API_ROUTE_TO_CANDIDATE_RELEASE");
    validateStep(observationRaw, input, "observe", "BOUNDED_STABLE_ROUTE_AND_RESPONSIBILITY_STATE_OBSERVED");
    if (sha256(activeStateRaw) !== input.expectedActiveStateDigest) invalid("ACTIVE_STATE_CHANGED");
    const activeState = json(activeStateRaw); if (activeState.releaseId !== active.releaseId ||
        activeState.sourceRevision !== active.sourceRevision || activeState.acceptanceClaimed !== false) {
      invalid("ACTIVE_STATE_INVALID");
    }
    const previousStatePath = join(recordsDirectory, `${input.operationId}.previous-startup-state.json`);
    await writeFile(previousStatePath, activeStateRaw, { flag: "wx", mode: 0o600 });
    const evidence = { schemaVersion: 1, product: "company-os", operationId: input.operationId,
      siteId: input.siteId, candidateReleaseId: candidate.releaseId, step: "promote-active",
      outcome: "CANDIDATE_RECORDED_AS_ACTIVE_PENDING_ACCEPTANCE", capturedAt: now(),
      predecessorReleaseId: active.releaseId, previousStartupStateDigest: sha256(activeStateRaw),
      routeEvidenceDigest: sha256(routeRaw), observationEvidenceDigest: sha256(observationRaw),
      dependencyManifestDigest: dependencyAdmission.manifestDigest,
      customerRecordsIncluded: false, secretMaterialIncluded: false,
      acceptanceClaimed: false, automaticRollbackAttempted: false } as const;
    const evidenceRaw = `${JSON.stringify(evidence, null, 2)}\n`; const evidenceDigest = sha256(evidenceRaw);
    await writeFile(join(evidenceDirectory, "promote-active.json"), evidenceRaw, { flag: "wx", mode: 0o600 });
    const state = { schemaVersion: 1, product: "company-os", releaseId: candidate.releaseId,
      releaseVersion: candidate.releaseVersion, sourceRevision: candidate.sourceRevision,
      dependencyManifestDigest: dependencyAdmission.manifestDigest,
      authorizationReference: input.authorizationReference,
      phaseAuthorizationReferences: { upgradeTrafficCutover: input.authorizationReference },
      state: "STARTED_NOT_ACCEPTED", startedAt: now(), acceptanceClaimed: false,
      automaticRollbackAttempted: false, activation: { kind: "UPGRADE", operationId: input.operationId,
        predecessorReleaseId: active.releaseId, evidenceDigest },
      activeRuntime: { composeProject: runtime.candidate.composeProject,
        productNetwork: runtime.candidate.productNetwork, ports: runtime.candidate.ports },
      activeConfiguration: { environmentFile, dependencyManifestFile: dependencyFile } };
    await writeAtomic(activeStatePath, state);
    return { schemaVersion: 1 as const, product: "company-os" as const,
      operationId: input.operationId, siteId: input.siteId, candidateReleaseId: candidate.releaseId,
      step: "promote-active" as const, outcome: evidence.outcome,
      evidenceDigest, secretMaterialIncluded: false as const };
  };
}

function validateStep(raw: string, input: { readonly operationId: string; readonly siteId: string },
  step: string, outcome: string) {
  const value = json(raw);
  if (value?.schemaVersion !== 1 || value.product !== "company-os" ||
      value.operationId !== input.operationId || value.siteId !== input.siteId ||
      value.step !== step || value.outcome !== outcome || value.customerRecordsIncluded !== false ||
      value.secretMaterialIncluded !== false) invalid("EVIDENCE_INVALID");
}
async function privateDirectory(value: string, strict: boolean) {
  const path = resolve(value); const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & (strict ? 0o077 : 0o027)) !== 0) {
    invalid("DIRECTORY_UNSAFE");
  }
  return path;
}
async function ensurePrivate(path: string) {
  try { await mkdir(path, { mode: 0o700 }); } catch (error) { if (!isCode(error, "EEXIST")) throw error; }
  return privateDirectory(path, true);
}
async function privateFile(path: string) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o077) !== 0 || metadata.size < 2 || metadata.size > 1_048_576) invalid("FILE_UNSAFE");
  return readFile(path, "utf8");
}
async function writeAtomic(path: string, value: unknown) {
  const partial = `${path}.partial-${process.pid}-${Date.now()}`;
  try { await writeFile(partial, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(partial, path); } finally { await rm(partial, { force: true }); }
}
function inside(root: string, child: string) { const suffix = relative(root, child); return suffix && !suffix.startsWith(".."); }
function json(value: string): any { try { return JSON.parse(value); } catch { invalid("JSON_INVALID"); } }
function sha256(value: string) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
function invalid(suffix: string): never { throw new Error(`STAGING_UPGRADE_ACTIVE_PROMOTION_${suffix}`); }
