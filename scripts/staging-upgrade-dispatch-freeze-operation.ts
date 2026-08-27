import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { StagingUpgradePreparationStepRecord } from
  "./create-staging-upgrade-preparation-adapter.ts";

interface MaintenanceState {
  readonly schemaVersion: 1;
  readonly mode: "OPEN" | "DISPATCH_FROZEN" | "ACCEPTANCE_ONLY";
  readonly revision: number;
  readonly operationId: string | null;
  readonly authorizationReference: string | null;
  readonly acceptance?: unknown;
}

export async function createStagingUpgradeDispatchFreezeOperation(input: {
  readonly candidateDirectory: string;
  readonly operationId: string;
  readonly siteId: string;
  readonly candidateReleaseId: string;
  readonly activeApiLoopbackOrigin: string;
  readonly authorizationReference: string;
  readonly sessionCookieFile: string;
}, supplied: { readonly fetch?: typeof fetch; readonly now?: () => string } = {}) {
  const directory = await privateDirectory(input.candidateDirectory);
  const cookie = (await privateFile(input.sessionCookieFile,
    "STAGING_UPGRADE_DISPATCH_SESSION_FILE_UNSAFE", 16_384)).trim();
  if (!/^\S+=\S+(?:;\s*\S+=\S+)*$/.test(cookie) || /[\r\n]/.test(cookie)) {
    throw new Error("STAGING_UPGRADE_DISPATCH_SESSION_INVALID");
  }
  const origin = loopbackOrigin(input.activeApiLoopbackOrigin);
  const request = supplied.fetch ?? fetch; const now = supplied.now ?? (() => new Date().toISOString());
  const evidenceDirectory = await ensurePrivate(join(directory, "step-evidence"));
  return async (): Promise<StagingUpgradePreparationStepRecord> => {
    const before = await readMaintenance(request, origin, cookie);
    let revision = before.revision;
    let idempotentReplay = false;
    if (before.mode === "DISPATCH_FROZEN") {
      if (before.operationId !== input.operationId ||
          before.authorizationReference !== input.authorizationReference) {
        throw new Error("STAGING_UPGRADE_DISPATCH_ALREADY_FROZEN_BY_OTHER_OPERATION");
      }
      idempotentReplay = true;
    } else {
      const response = await request(`${origin}/api/v1/instance/maintenance`, {
        method: "PATCH", redirect: "error",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ mode: "DISPATCH_FROZEN", expectedRevision: before.revision,
          operationId: input.operationId, authorizationReference: input.authorizationReference }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error(`STAGING_UPGRADE_DISPATCH_FREEZE_HTTP_${response.status}`);
      const changed = exactChanged(await response.json()); revision = changed.revision;
    }
    const after = await readMaintenance(request, origin, cookie);
    if (after.mode !== "DISPATCH_FROZEN" || after.revision !== revision ||
        after.operationId !== input.operationId || after.authorizationReference !== input.authorizationReference) {
      throw new Error("STAGING_UPGRADE_DISPATCH_FREEZE_CONFIRMATION_FAILED");
    }
    const evidence = { schemaVersion: 1, product: "company-os", operationId: input.operationId,
      siteId: input.siteId, candidateReleaseId: input.candidateReleaseId,
      step: "freeze-dispatch", outcome: "NEW_DISPATCH_DISABLED", capturedAt: now(),
      beforeRevision: before.revision, frozenRevision: after.revision, idempotentReplay,
      authorizationReferenceDigest: sha256(`${input.authorizationReference}\n`),
      sessionMaterialIncluded: false, secretMaterialIncluded: false } as const;
    const raw = `${JSON.stringify(evidence, null, 2)}\n`; const evidenceDigest = sha256(raw);
    await writeFile(join(evidenceDirectory, "freeze-dispatch.json"), raw, { flag: "wx", mode: 0o600 });
    return { schemaVersion: 1, product: "company-os", operationId: input.operationId,
      siteId: input.siteId, candidateReleaseId: input.candidateReleaseId,
      step: "freeze-dispatch", outcome: "NEW_DISPATCH_DISABLED", evidenceDigest,
      secretMaterialIncluded: false };
  };
}

async function readMaintenance(request: typeof fetch, origin: string, cookie: string): Promise<MaintenanceState> {
  const response = await request(`${origin}/api/v1/instance/maintenance`, { redirect: "error",
    headers: { cookie }, signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`STAGING_UPGRADE_DISPATCH_READ_HTTP_${response.status}`);
  return exactMaintenance(await response.json());
}
function exactMaintenance(value: unknown): MaintenanceState {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidResponse();
  const record = value as Record<string, unknown>;
  const required = ["schemaVersion", "mode", "revision", "operationId",
    "authorizationReference", "changedBy", "changedAt"];
  const allowed = [...required, "acceptance"];
  if (required.some((key) => !(key in record)) ||
      Object.keys(record).some((key) => !allowed.includes(key)) ||
      record.schemaVersion !== 1 || !["OPEN", "DISPATCH_FROZEN", "ACCEPTANCE_ONLY"].includes(String(record.mode)) ||
      !Number.isSafeInteger(record.revision) || Number(record.revision) < 0 ||
      !nullableText(record.operationId) || !nullableText(record.authorizationReference)) invalidResponse();
  if (record.mode === "ACCEPTANCE_ONLY" ? !record.acceptance : record.acceptance != null) invalidResponse();
  return record as unknown as MaintenanceState;
}
function exactChanged(value: unknown) {
  const record = exact(value, ["mode", "revision"]);
  if (record.mode !== "DISPATCH_FROZEN" || !Number.isSafeInteger(record.revision) ||
      Number(record.revision) < 1) invalidResponse();
  return { mode: "DISPATCH_FROZEN" as const, revision: Number(record.revision) };
}
function exact(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidResponse();
  const record = value as Record<string, unknown>; const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) invalidResponse();
  return record;
}
function nullableText(value: unknown) { return value === null || typeof value === "string" && value.length <= 255; }
function loopbackOrigin(value: string) {
  try { const url = new URL(value);
    if (url.protocol !== "http:" || !["127.0.0.1", "::1", "[::1]"].includes(url.hostname) ||
        !url.port || url.pathname !== "/" || url.search || url.hash || url.username || url.password) throw new Error();
    return url.origin;
  } catch { throw new Error("STAGING_UPGRADE_DISPATCH_ACTIVE_ORIGIN_INVALID"); }
}
async function privateDirectory(value: string) {
  const path = resolve(value); const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) {
    throw new Error("STAGING_UPGRADE_DISPATCH_DIRECTORY_UNSAFE");
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
function invalidResponse(): never { throw new Error("STAGING_UPGRADE_DISPATCH_RESPONSE_INVALID"); }
function sha256(value: string) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
