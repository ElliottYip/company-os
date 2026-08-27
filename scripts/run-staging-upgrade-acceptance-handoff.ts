import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { parseSiteRuntimeManifest } from "../adapters/config/site-runtime-contract.ts";
import { readVerifiedStagingReleaseStore, resolveStagingReleaseRecord } from "./read-staging-release-store.mjs";
import { validateCustomerAcceptanceRecord } from "./validate-customer-acceptance-record.mjs";

const LOCK = ".staging-lifecycle.lock";
const CURRENT_STATE = "upgrade-acceptance-handoff-state.json";
const RECORDS = "upgrade-acceptance-handoff-records";
const OPERATION_ID = /^upgrade-[a-z0-9][a-z0-9-]{2,87}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

export interface StagingUpgradeAcceptanceInput {
  readonly rootDirectory: string; readonly operationId: string;
  readonly authorizationReference: string; readonly recordFile: string;
}

export async function planStagingUpgradeAcceptanceHandoff(input: StagingUpgradeAcceptanceInput) {
  if (!OPERATION_ID.test(input.operationId) || !isAbsolute(input.recordFile)) invalid("INPUT_INVALID");
  const root = await privateDirectory(input.rootDirectory, false);
  const store = await readVerifiedStagingReleaseStore(root);
  const startupRaw = await privateFile(join(root, "startup-state.json"));
  const startup = json(startupRaw, "ACTIVE_STATE_INVALID");
  if (startup?.schemaVersion !== 1 || startup.product !== "company-os" ||
      startup.state !== "STARTED_NOT_ACCEPTED" || startup.acceptanceClaimed !== false ||
      startup.automaticRollbackAttempted !== false || startup.activation?.kind !== "UPGRADE" ||
      startup.activation.operationId !== input.operationId || !DIGEST.test(startup.activation.evidenceDigest ?? "")) {
    invalid("ACTIVE_STATE_INVALID");
  }
  const release = resolveStagingReleaseRecord(store, startup.releaseId, startup.sourceRevision);
  if (release.releaseId !== store.prepared.releaseId || !release.siteContract) invalid("RELEASE_INVALID");
  const siteRaw = await verifiedContractFile(release.siteContract, "site-runtime.json");
  const site = parseSiteRuntimeManifest(json(siteRaw, "SITE_CONTRACT_INVALID"));
  if (!site.authorization.acceptance || input.authorizationReference !== site.authorization.acceptance) {
    invalid("AUTHORIZATION_MISMATCH");
  }

  const trafficRaw = await privateFile(join(root, "upgrade-traffic-state.json"));
  const traffic = json(trafficRaw, "TRAFFIC_STATE_INVALID");
  const expectedSteps = ["route-traffic", "observe", "promote-active"];
  if (traffic?.schemaVersion !== 1 || traffic.product !== "company-os" || traffic.phase !== "TRAFFIC_CUTOVER" ||
      traffic.status !== "UPGRADE_OBSERVATION_COMPLETE_PENDING_ACCEPTANCE" ||
      traffic.operationId !== input.operationId || traffic.siteId !== site.site.id ||
      traffic.candidate?.releaseId !== release.releaseId || traffic.trafficMoved !== true ||
      traffic.automaticRollbackAttempted !== false || !Array.isArray(traffic.completedEvidence) ||
      traffic.completedEvidence.length !== expectedSteps.length ||
      traffic.completedEvidence.some((item: any, index: number) =>
        item?.step !== expectedSteps[index] || !DIGEST.test(item.evidenceDigest ?? ""))) invalid("TRAFFIC_STATE_INVALID");

  const environmentFile = resolve(startup.activeConfiguration?.environmentFile ?? "");
  const candidateDirectory = dirname(environmentFile);
  if (!inside(root, candidateDirectory) || environmentFile !== join(candidateDirectory, "candidate.env")) {
    invalid("ACTIVE_CONFIGURATION_INVALID");
  }
  const promotionRaw = await privateFile(join(candidateDirectory, "step-evidence", "promote-active.json"));
  const promotion = json(promotionRaw, "PROMOTION_EVIDENCE_INVALID");
  if (sha256(promotionRaw) !== startup.activation.evidenceDigest || promotion?.operationId !== input.operationId ||
      promotion.siteId !== site.site.id || promotion.candidateReleaseId !== release.releaseId ||
      promotion.step !== "promote-active" || promotion.outcome !== "CANDIDATE_RECORDED_AS_ACTIVE_PENDING_ACCEPTANCE" ||
      promotion.acceptanceClaimed !== false || promotion.customerRecordsIncluded !== false ||
      promotion.secretMaterialIncluded !== false) invalid("PROMOTION_EVIDENCE_INVALID");

  const manifestRaw = await publicFile(join(release.releaseDirectory, "release-manifest.json"));
  const manifest = json(manifestRaw, "RELEASE_MANIFEST_INVALID");
  const recordRaw = await privateFile(resolve(input.recordFile));
  const record = json(recordRaw, "ACCEPTANCE_RECORD_INVALID");
  const validation = validateCustomerAcceptanceRecord(record);
  if (validation.scope !== "CUSTOMER_STAGING" || record.release?.version !== release.releaseVersion ||
      record.release?.sourceRevision !== release.sourceRevision || record.release?.manifestDigest !== sha256(manifestRaw) ||
      manifest?.product !== "company-os" || manifest.releaseVersion !== release.releaseVersion ||
      manifest.sourceRevision !== release.sourceRevision) invalid("ACCEPTANCE_RECORD_RELEASE_MISMATCH");
  await rejectExisting(root, input.operationId);
  return { schemaVersion: 1 as const, product: "company-os" as const, phase: "UPGRADE_ACCEPTANCE_HANDOFF" as const,
    status: "PLANNED_NOT_APPLIED" as const, operationId: input.operationId, siteId: site.site.id,
    releaseId: release.releaseId, releaseVersion: release.releaseVersion, sourceRevision: release.sourceRevision,
    authorizationReference: site.authorization.acceptance, startupStateDigest: sha256(startupRaw),
    trafficStateDigest: sha256(trafficRaw), promotionEvidenceDigest: sha256(promotionRaw),
    releaseManifestDigest: sha256(manifestRaw), acceptanceRecordDigest: sha256(recordRaw),
    recordId: record.recordId, structuralValidationStatus: validation.status,
    completion: { acceptanceClaimed: false, independentlyVerified: false, dispatchReopened: false,
      externalEvidenceRequired: true, nextStatus: "PENDING_EXTERNAL_VERIFICATION" as const } };
}

export async function bindStagingUpgradeAcceptanceHandoff(input: StagingUpgradeAcceptanceInput,
  supplied: { readonly now?: () => string } = {}) {
  const plan = await planStagingUpgradeAcceptanceHandoff(input);
  const root = resolve(input.rootDirectory); const lockPath = join(root, LOCK);
  try { await writeFile(lockPath, `${plan.operationId}:UPGRADE_ACCEPTANCE_HANDOFF\n`, { flag: "wx", mode: 0o600 }); }
  catch (error) { if (isCode(error, "EEXIST")) invalid("ALREADY_RUNNING"); throw error; }
  try {
    const state: Record<string, unknown> = { ...plan,
      status: "UPGRADE_ACCEPTANCE_RECORD_BOUND_PENDING_EXTERNAL_VERIFICATION",
      boundAt: (supplied.now ?? (() => new Date().toISOString()))(), acceptanceClaimed: false,
      independentlyVerified: false, dispatchReopened: false, externalEvidenceRequired: true,
      automaticRollbackAttempted: false };
    delete state.completion;
    const records = await ensurePrivateDirectory(join(root, RECORDS));
    await writeFile(join(records, `${plan.operationId}.json`), `${JSON.stringify(state, null, 2)}\n`,
      { flag: "wx", mode: 0o600 });
    await writeAtomic(join(root, CURRENT_STATE), state);
    return { schemaVersion: 1 as const, product: "company-os" as const, status: state.status,
      operationId: plan.operationId, releaseId: plan.releaseId, authorizationReference: plan.authorizationReference,
      acceptanceClaimed: false as const, independentlyVerified: false as const, dispatchReopened: false as const };
  } finally { await rm(lockPath, { force: true }); }
}

async function verifiedContractFile(contract: { readonly contractDirectory: string;
  readonly digests: Readonly<Record<string, string>> }, name: string) {
  const raw = await privateFile(join(contract.contractDirectory, name));
  if (contract.digests[name] !== sha256(raw)) invalid("SITE_CONTRACT_CHANGED"); return raw;
}
async function rejectExisting(root: string, operationId: string) {
  for (const path of [join(root, CURRENT_STATE), join(root, RECORDS, `${operationId}.json`)]) {
    try { await lstat(path); invalid("REVIEW_REQUIRED"); }
    catch (error) { if (!isCode(error, "ENOENT")) throw error; }
  }
}
async function privateDirectory(value: string, strict: boolean) {
  const path = resolve(value); const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() ||
      (metadata.mode & (strict ? 0o077 : 0o027)) !== 0) invalid("DIRECTORY_UNSAFE"); return path;
}
async function ensurePrivateDirectory(path: string) {
  try { await mkdir(path, { mode: 0o700 }); } catch (error) { if (!isCode(error, "EEXIST")) throw error; }
  return privateDirectory(path, true);
}
async function privateFile(path: string) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o077) !== 0 || metadata.size < 2 || metadata.size > 1_048_576) invalid("FILE_UNSAFE");
  return readFile(path, "utf8");
}
async function publicFile(path: string) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o022) !== 0 || (metadata.mode & 0o007) !== 0 ||
      metadata.size < 2 || metadata.size > 1_048_576) invalid("PUBLIC_FILE_UNSAFE");
  return readFile(path, "utf8");
}
async function writeAtomic(path: string, value: unknown) {
  const partial = `${path}.partial-${process.pid}-${Date.now()}`;
  try { await writeFile(partial, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(partial, path); } finally { await rm(partial, { force: true }); }
}
function inside(root: string, child: string) { const suffix = relative(root, child); return suffix && !suffix.startsWith(".."); }
function json(value: string, suffix: string): any { try { return JSON.parse(value); } catch { invalid(suffix); } }
function sha256(value: string) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function isCode(error: unknown, code: string): boolean { return error instanceof Error && "code" in error && error.code === code; }
function invalid(suffix: string): never { throw new Error(`STAGING_UPGRADE_ACCEPTANCE_${suffix}`); }

function argumentsFrom(values: string[]) {
  const result: any = { rootDirectory: "/srv/company-os/staging", apply: false };
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (flag === "--apply") result.apply = true;
    else if (flag === "--root") result.rootDirectory = values[++index];
    else if (flag === "--operation") result.operationId = values[++index];
    else if (flag === "--authorization") result.authorizationReference = values[++index];
    else if (flag === "--record") result.recordFile = values[++index];
    else invalid("ARGUMENT_INVALID");
  }
  return result;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const options = argumentsFrom(process.argv.slice(2));
  const result = options.apply ? await bindStagingUpgradeAcceptanceHandoff(options) :
    await planStagingUpgradeAcceptanceHandoff(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
