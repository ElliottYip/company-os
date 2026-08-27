import { createHash } from "node:crypto";
import { lstat, readFile, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { parseSiteRuntimeManifest } from "../adapters/config/site-runtime-contract.ts";
import { readVerifiedStagingReleaseStore } from "./read-staging-release-store.mjs";
import { validateCustomerAcceptanceRecord } from "./validate-customer-acceptance-record.mjs";

const LOCK = ".staging-lifecycle.lock";
const STATE = "acceptance-handoff-state.json";

export async function planStagingAcceptanceHandoff(input) {
  if (!isAbsolute(input.recordFile ?? "")) throw new Error("STAGING_ACCEPTANCE_RECORD_PATH_INVALID");
  const store = await readVerifiedStagingReleaseStore(input.rootDirectory);
  if (store.schemaVersion !== 2 || store.prepared.releaseId !== input.releaseId ||
      !store.prepared.siteContract) throw new Error("STAGING_ACCEPTANCE_RELEASE_MISMATCH");
  const prepared = store.prepared; const contract = prepared.siteContract;
  const siteRaw = await verifiedContractFile(contract, "site-runtime.json");
  const site = parseSiteRuntimeManifest(JSON.parse(siteRaw.toString("utf8")));
  const acceptanceAuthorization = site.authorization.acceptance;
  if (!acceptanceAuthorization || input.authorizationReference !== acceptanceAuthorization) {
    throw new Error("STAGING_ACCEPTANCE_AUTHORIZATION_MISMATCH");
  }
  const productStateRaw = await safeFile(join(input.rootDirectory, "product-start-state.json"));
  const productState = parseJson(productStateRaw, "STAGING_ACCEPTANCE_PRODUCT_STATE_INVALID");
  const productAuthorization = site.authorization.productStart;
  if (productState?.schemaVersion !== 1 || productState?.product !== "company-os" ||
      productState?.phase !== "PRODUCT_START" || productState?.status !== "STARTED_NOT_ACCEPTED" ||
      productState?.releaseId !== prepared.releaseId || productState?.sourceRevision !== prepared.sourceRevision ||
      productState?.authorizationReference !== productAuthorization || productState?.acceptanceClaimed !== false ||
      productState?.automaticRollbackAttempted !== false || productState?.serviceMutationMayHaveRun !== true) {
    throw new Error("STAGING_ACCEPTANCE_PRODUCT_STATE_INVALID");
  }
  const releaseRaw = await safePublicFile(join(prepared.releaseDirectory, "release-manifest.json"));
  const release = parseJson(releaseRaw, "STAGING_ACCEPTANCE_RELEASE_MANIFEST_INVALID");
  const recordRaw = await safeFile(resolve(input.recordFile));
  const record = parseJson(recordRaw, "STAGING_ACCEPTANCE_RECORD_INVALID");
  const validation = validateCustomerAcceptanceRecord(record);
  const manifestDigest = sha256(releaseRaw);
  if (validation.scope !== "CUSTOMER_STAGING" || record.release?.version !== prepared.releaseVersion ||
      record.release?.sourceRevision !== prepared.sourceRevision || record.release?.manifestDigest !== manifestDigest) {
    throw new Error("STAGING_ACCEPTANCE_RECORD_RELEASE_MISMATCH");
  }
  await rejectExistingState(input.rootDirectory);
  return { schemaVersion: 1, product: "company-os", status: "PLANNED_NOT_APPLIED",
    phase: "ACCEPTANCE_HANDOFF", siteId: site.site.id, releaseId: prepared.releaseId,
    releaseVersion: prepared.releaseVersion, sourceRevision: prepared.sourceRevision,
    authorizationReference: acceptanceAuthorization, productStateDigest: sha256(productStateRaw),
    releaseManifestDigest: manifestDigest, acceptanceRecordDigest: sha256(recordRaw),
    recordId: record.recordId, structuralValidationStatus: validation.status,
    completion: { acceptanceClaimed: false, independentlyVerified: false,
      externalEvidenceRequired: true, nextStatus: "PENDING_EXTERNAL_VERIFICATION" } };
}

export async function bindStagingAcceptanceHandoff(input, supplied = {}) {
  const plan = await planStagingAcceptanceHandoff(input);
  const now = supplied.now ?? (() => new Date().toISOString());
  const lockPath = join(input.rootDirectory, LOCK);
  try { await writeFile(lockPath, `${plan.releaseId}:ACCEPTANCE_HANDOFF\n`, { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (isCode(error, "EEXIST")) throw new Error("STAGING_ACCEPTANCE_ALREADY_RUNNING");
    throw error;
  }
  try {
    const state = { schemaVersion: 1, product: "company-os", phase: plan.phase,
      status: "ACCEPTANCE_RECORD_BOUND_PENDING_EXTERNAL_VERIFICATION", siteId: plan.siteId,
      releaseId: plan.releaseId, releaseVersion: plan.releaseVersion, sourceRevision: plan.sourceRevision,
      authorizationReference: plan.authorizationReference, productStateDigest: plan.productStateDigest,
      releaseManifestDigest: plan.releaseManifestDigest, acceptanceRecordDigest: plan.acceptanceRecordDigest,
      recordId: plan.recordId, boundAt: now(), acceptanceClaimed: false, independentlyVerified: false,
      externalEvidenceRequired: true, automaticRollbackAttempted: false };
    await writeAtomic(join(input.rootDirectory, STATE), state);
    return { schemaVersion: 1, status: state.status, releaseId: plan.releaseId,
      authorizationReference: plan.authorizationReference };
  } finally { await rm(lockPath, { force: true }); }
}

async function verifiedContractFile(contract, name) {
  const path = join(contract.contractDirectory, name); const raw = await safeFile(path);
  if (contract.digests?.[name] !== sha256(raw)) throw new Error("STAGING_ACCEPTANCE_SITE_CONTRACT_CHANGED");
  return raw;
}

async function rejectExistingState(rootDirectory) {
  try { await safeFile(join(rootDirectory, STATE)); throw new Error("STAGING_ACCEPTANCE_REVIEW_REQUIRED"); }
  catch (error) { if (!isCode(error, "ENOENT")) throw error; }
}

async function safeFile(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o077) !== 0 || metadata.size < 2 || metadata.size > 1_048_576) {
    throw new Error("STAGING_ACCEPTANCE_FILE_UNSAFE");
  }
  return readFile(path);
}

async function safePublicFile(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o022) !== 0 || (metadata.mode & 0o007) !== 0 ||
      metadata.size < 2 || metadata.size > 1_048_576) {
    throw new Error("STAGING_ACCEPTANCE_PUBLIC_FILE_UNSAFE");
  }
  return readFile(path);
}

async function writeAtomic(final, value) {
  const partial = `${final}.partial-${process.pid}-${Date.now()}`;
  try { await writeFile(partial, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(partial, final); } finally { await rm(partial, { force: true }); }
}

function parseJson(value, code) { try { return JSON.parse(value.toString("utf8")); } catch { throw new Error(code); } }
function sha256(value) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function isCode(error, code) { return error instanceof Error && "code" in error && error.code === code; }

function argumentsFrom(values) {
  const result = { rootDirectory: "/srv/company-os/staging", releaseId: undefined,
    authorizationReference: undefined, recordFile: undefined, apply: false };
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (flag === "--apply") result.apply = true;
    else if (flag === "--root") result.rootDirectory = values[++index];
    else if (flag === "--release") result.releaseId = values[++index];
    else if (flag === "--authorization") result.authorizationReference = values[++index];
    else if (flag === "--record") result.recordFile = values[++index];
    else throw new Error("STAGING_ACCEPTANCE_ARGUMENT_INVALID");
  }
  return result;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const options = argumentsFrom(process.argv.slice(2));
  const result = options.apply ? await bindStagingAcceptanceHandoff(options) :
    await planStagingAcceptanceHandoff(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
