import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { StagingUpgradePreparationStepRecord } from
  "./create-staging-upgrade-preparation-adapter.ts";

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAXIMUM_RESPONSE_BYTES = 2 * 1024 * 1024;

interface SmokeCase {
  readonly schemaVersion: 1;
  readonly classification: "SYNTHETIC_NON_PRODUCTION";
  readonly companyId: string;
  readonly workId: string;
  readonly attemptId: string;
  readonly accountableHumanId: string;
  readonly executingAgentId: string;
  readonly responsibilityContractId: string;
  readonly approvalId: string;
  readonly evidenceId: string;
  readonly resultId: string;
}

export async function createStagingUpgradeCustomerSmokeOperation(input: {
  readonly candidateDirectory: string;
  readonly operationId: string;
  readonly siteId: string;
  readonly candidateReleaseId: string;
  readonly candidateApiLoopbackOrigin: string;
  readonly sessionCookieFile: string;
  readonly smokeCaseFile: string;
}, supplied: { readonly fetch?: typeof fetch; readonly now?: () => string } = {}) {
  const directory = await privateDirectory(input.candidateDirectory);
  const evidenceDirectory = await ensurePrivate(join(directory, "step-evidence"));
  const origin = loopbackOrigin(input.candidateApiLoopbackOrigin);
  const cookie = (await privateFile(input.sessionCookieFile,
    "STAGING_UPGRADE_SMOKE_SESSION_FILE_UNSAFE", 16_384)).trim();
  if (!/^\S+=\S+(?:;\s*\S+=\S+)*$/.test(cookie) || /[\r\n]/.test(cookie)) {
    throw new Error("STAGING_UPGRADE_SMOKE_SESSION_INVALID");
  }
  const smokeCaseRaw = await privateFile(input.smokeCaseFile,
    "STAGING_UPGRADE_SMOKE_CASE_FILE_UNSAFE", 32_768);
  const smokeCase = parseSmokeCase(smokeCaseRaw);
  const request = supplied.fetch ?? fetch;
  const now = supplied.now ?? (() => new Date().toISOString());

  return async (): Promise<StagingUpgradePreparationStepRecord> => {
    const access = await getJson(request, origin, "/api/v1/access", cookie);
    if (!record(access) || access.schemaVersion !== 1 || access.mode !== "FORMAL" ||
        access.entryState !== "READY" || !record(access.session) ||
        access.session.authenticated !== true || !record(access.capabilities) ||
        ["companyData", "companyMutation", "execution", "approval", "governance"]
          .some((name) => access.capabilities?.[name] !== true)) invalid("ACCESS_PATH_INVALID");

    const directoryProjection = await getJson(request, origin, "/api/v1/companies", cookie);
    if (!record(directoryProjection) || directoryProjection.schemaVersion !== 1 ||
        !Array.isArray(directoryProjection.companies) ||
        !directoryProjection.companies.some((company) => record(company) &&
          company.id === smokeCase.companyId)) invalid("COMPANY_PATH_INVALID");

    const base = `/api/v1/companies/${encodeURIComponent(smokeCase.companyId)}`;
    const projection = await getJson(request, origin, `${base}/agent-boss`, cookie);
    validateProjection(projection, smokeCase);
    const ledger = await getJson(request, origin, `${base}/accountability-ledger`, cookie);
    validateLedger(ledger, smokeCase);

    const evidence = { schemaVersion: 1, product: "company-os", operationId: input.operationId,
      siteId: input.siteId, candidateReleaseId: input.candidateReleaseId,
      step: "customer-smoke", outcome: "IDENTITY_COMPANY_WORK_APPROVAL_EVIDENCE_PATH_PASSED",
      capturedAt: now(), classification: smokeCase.classification,
      smokeCaseDigest: sha256(canonicalJson(smokeCase)), verifiedPathCount: 4,
      customerRecordsIncluded: false, sessionMaterialIncluded: false,
      secretMaterialIncluded: false } as const;
    const raw = `${JSON.stringify(evidence, null, 2)}\n`; const evidenceDigest = sha256(raw);
    await writeFile(join(evidenceDirectory, "customer-smoke.json"), raw, { flag: "wx", mode: 0o600 });
    return { schemaVersion: 1, product: "company-os", operationId: input.operationId,
      siteId: input.siteId, candidateReleaseId: input.candidateReleaseId,
      step: "customer-smoke", outcome: "IDENTITY_COMPANY_WORK_APPROVAL_EVIDENCE_PATH_PASSED",
      evidenceDigest, secretMaterialIncluded: false };
  };
}

function validateProjection(value: unknown, smoke: SmokeCase) {
  if (!record(value) || value.schemaVersion !== 1 || value.mode !== "PRODUCTION" ||
      !record(value.organization) || !record(value.organization.company) ||
      value.organization.company.id !== smoke.companyId || !record(value.responsibilities) ||
      !Array.isArray(value.responsibilities.contracts) || !Array.isArray(value.work) ||
      !Array.isArray(value.attempts)) invalid("AGENT_BOSS_PATH_INVALID");
  const contract = value.responsibilities.contracts.find((item) => record(item) &&
    item.id === smoke.responsibilityContractId && item.agentId === smoke.executingAgentId &&
    item.accountableHumanId === smoke.accountableHumanId);
  const work = value.work.find((item) => record(item) && item.id === smoke.workId &&
    item.companyId === smoke.companyId && item.agentId === smoke.executingAgentId &&
    item.accountableHumanId === smoke.accountableHumanId &&
    item.responsibilityContractId === smoke.responsibilityContractId);
  const attempt = value.attempts.find((item) => record(item) && item.id === smoke.attemptId &&
    item.workId === smoke.workId && item.status === "SUCCEEDED" &&
    Array.isArray(item.evidenceReferences) && item.evidenceReferences.includes(smoke.evidenceId) &&
    item.resultId === smoke.resultId);
  if (!contract || !work || !attempt) invalid("AGENT_BOSS_PATH_INVALID");
}

function validateLedger(value: unknown, smoke: SmokeCase) {
  if (!record(value) || value.schemaVersion !== 1 || value.companyId !== smoke.companyId ||
      !Array.isArray(value.approvals) || !Array.isArray(value.evidence)) {
    invalid("ACCOUNTABILITY_PATH_INVALID");
  }
  const approval = value.approvals.find((item) => record(item) && item.status === "APPROVED" &&
    record(item.request) && item.request.id === smoke.approvalId &&
    record(item.request.binding) && item.request.binding.workId === smoke.workId &&
    item.request.binding.executingAgentId === smoke.executingAgentId &&
    item.request.binding.accountableHumanId === smoke.accountableHumanId &&
    item.request.binding.responsibilityContractId === smoke.responsibilityContractId &&
    record(item.decision) && item.decision.requestId === smoke.approvalId &&
    item.decision.decision === "APPROVED");
  const evidence = new Set(value.evidence.filter((item) => record(item) &&
    item.workId === smoke.workId && item.attemptId === smoke.attemptId &&
    item.provenance === "PRODUCTION" && /^sha256:[a-f0-9]{64}$/.test(String(item.contentDigest)))
    .map((item) => (item as Record<string, unknown>).id));
  if (!approval || !evidence.has(smoke.evidenceId) || !evidence.has(smoke.resultId)) {
    invalid("ACCOUNTABILITY_PATH_INVALID");
  }
}

async function getJson(request: typeof fetch, origin: string, path: string, cookie: string) {
  const response = await request(`${origin}${path}`, { method: "GET", redirect: "error",
    headers: { accept: "application/json", cookie }, signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`STAGING_UPGRADE_SMOKE_HTTP_${response.status}`);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAXIMUM_RESPONSE_BYTES) invalid("RESPONSE_TOO_LARGE");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 2 || bytes.byteLength > MAXIMUM_RESPONSE_BYTES) invalid("RESPONSE_TOO_LARGE");
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { invalid("RESPONSE_INVALID"); }
}

function parseSmokeCase(raw: string): SmokeCase {
  let value: unknown; try { value = JSON.parse(raw); } catch { invalid("CASE_INVALID"); }
  if (!record(value) || value.schemaVersion !== 1 || value.classification !== "SYNTHETIC_NON_PRODUCTION" ||
      Object.keys(value).length !== 11 || ["companyId", "workId", "attemptId", "accountableHumanId",
        "executingAgentId", "responsibilityContractId", "approvalId", "evidenceId", "resultId"]
        .some((key) => !ID.test(String(value[key])))) invalid("CASE_INVALID");
  return value as unknown as SmokeCase;
}
function loopbackOrigin(value: string) {
  try { const url = new URL(value);
    if (url.protocol !== "http:" || !["127.0.0.1", "::1", "[::1]"].includes(url.hostname) ||
        !url.port || url.pathname !== "/" || url.search || url.hash || url.username || url.password) throw new Error();
    return url.origin;
  } catch { throw new Error("STAGING_UPGRADE_SMOKE_ORIGIN_INVALID"); }
}
async function privateDirectory(value: string) {
  const path = resolve(value); const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) {
    throw new Error("STAGING_UPGRADE_SMOKE_DIRECTORY_UNSAFE");
  }
  return path;
}
async function ensurePrivate(path: string) {
  try { await mkdir(path, { mode: 0o700 }); } catch (error) { if (!isCode(error, "EEXIST")) throw error; }
  return privateDirectory(path);
}
async function privateFile(pathValue: string, code: string, maximum: number) {
  const path = resolve(pathValue); const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o077) !== 0 || metadata.size < 2 || metadata.size > maximum) throw new Error(code);
  return readFile(path, "utf8");
}
function record(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (record(value)) return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function invalid(suffix: string): never { throw new Error(`STAGING_UPGRADE_SMOKE_${suffix}`); }
function sha256(value: string) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
