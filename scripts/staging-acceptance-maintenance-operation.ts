import { createHash } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

const ID = /^[a-z0-9][a-z0-9-]{2,95}$/;
const AUTHORITY = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,255}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const MODES = ["OPEN", "DISPATCH_FROZEN", "ACCEPTANCE_ONLY"] as const;
type Mode = typeof MODES[number];

interface AcceptanceScope {
  readonly schemaVersion: 1;
  readonly product: "company-os";
  readonly operationId: string;
  readonly planId: string;
  readonly planDigest: `sha256:${string}`;
  readonly authorizationReference: string;
  readonly work: readonly { readonly companyId: string; readonly workId: string }[];
}

interface MaintenanceState {
  readonly schemaVersion: 1;
  readonly mode: Mode;
  readonly revision: number;
  readonly operationId: string | null;
  readonly authorizationReference: string | null;
  readonly acceptance: null | Pick<AcceptanceScope, "planId" | "planDigest" | "work">;
  readonly changedBy: string | null;
  readonly changedAt: string | null;
}

interface CommonInput {
  readonly rootDirectory: string;
  readonly evidenceDirectory: string;
}

interface HttpInput extends CommonInput {
  readonly activeApiLoopbackOrigin: string;
  readonly sessionCookieFile: string;
}

export async function openStagingAcceptanceWindow(input: HttpInput & { readonly scopeFile: string },
  supplied: { readonly fetch?: typeof fetch; readonly now?: () => string } = {}) {
  const root = await privateDirectory(input.rootDirectory, false);
  const evidenceDirectory = await privateDirectory(input.evidenceDirectory, true);
  if (!inside(root, evidenceDirectory)) invalid("DIRECTORY_UNSAFE");
  const scope = await acceptanceScope(input.scopeFile);
  const cookie = await sessionCookie(input.sessionCookieFile);
  const origin = loopbackOrigin(input.activeApiLoopbackOrigin);
  const request = supplied.fetch ?? fetch;
  const before = await readMaintenance(request, origin, cookie);
  if (before.mode !== "DISPATCH_FROZEN" || before.operationId !== scope.operationId) {
    invalid("FROZEN_OPERATION_REQUIRED");
  }
  if (before.authorizationReference === scope.authorizationReference) invalid("AUTHORIZATION_REUSED");
  const response = await request(`${origin}/api/v1/instance/maintenance`, {
    method: "PATCH", redirect: "error", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ mode: "ACCEPTANCE_ONLY", expectedRevision: before.revision,
      operationId: scope.operationId, authorizationReference: scope.authorizationReference,
      acceptance: { planId: scope.planId, planDigest: scope.planDigest, work: scope.work } }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) invalid(`OPEN_HTTP_${response.status}`);
  const changed = exactChanged(await response.json(), "ACCEPTANCE_ONLY");
  const after = await readMaintenance(request, origin, cookie);
  if (after.mode !== "ACCEPTANCE_ONLY" || after.revision !== changed.revision ||
      after.operationId !== scope.operationId ||
      after.authorizationReference !== scope.authorizationReference ||
      canonical(after.acceptance) !== canonical({ planId: scope.planId, planDigest: scope.planDigest,
        work: scope.work })) invalid("OPEN_CONFIRMATION_FAILED");
  const evidence = { schemaVersion: 1, product: "company-os", operationId: scope.operationId,
    status: "ACCEPTANCE_ONLY", planId: scope.planId, planDigest: scope.planDigest,
    workScopeDigest: sha256(canonical(scope.work)), beforeRevision: before.revision,
    acceptanceRevision: after.revision, authorizationReferenceDigest: referenceDigest(scope.authorizationReference),
    openedAt: (supplied.now ?? (() => new Date().toISOString()))(),
    sessionMaterialIncluded: false, secretMaterialIncluded: false } as const;
  await exclusiveRecord(join(evidenceDirectory, "acceptance-window-opened.json"), evidence);
  return { schemaVersion: 1 as const, product: "company-os" as const,
    status: "ACCEPTANCE_ONLY" as const, operationId: scope.operationId,
    planId: scope.planId, revision: after.revision };
}

export async function bindStagingAcceptanceDecision(input: CommonInput & {
  readonly scopeFile: string;
  readonly handoffStateFile: string;
  readonly decisionFile: string;
}, supplied: { readonly now?: () => string } = {}) {
  const root = await privateDirectory(input.rootDirectory, false);
  const evidenceDirectory = await privateDirectory(input.evidenceDirectory, true);
  if (!inside(root, evidenceDirectory)) invalid("DIRECTORY_UNSAFE");
  const scope = await acceptanceScope(input.scopeFile);
  let windowRaw: string;
  try { windowRaw = await privateFile(join(evidenceDirectory, "acceptance-window-opened.json")); }
  catch (error) { if (isCode(error, "ENOENT")) invalid("WINDOW_EVIDENCE_REQUIRED"); throw error; }
  const window = object(JSON.parse(windowRaw), "WINDOW_EVIDENCE_INVALID");
  if (window.schemaVersion !== 1 || window.product !== "company-os" || window.status !== "ACCEPTANCE_ONLY" ||
      window.operationId !== scope.operationId || window.planId !== scope.planId ||
      window.planDigest !== scope.planDigest ||
      window.authorizationReferenceDigest !== referenceDigest(scope.authorizationReference)) {
    invalid("WINDOW_EVIDENCE_INVALID");
  }
  const handoffRaw = await privateFile(input.handoffStateFile);
  const handoff = object(JSON.parse(handoffRaw), "HANDOFF_INVALID");
  if (handoff.schemaVersion !== 1 || handoff.product !== "company-os" ||
      !["ACCEPTANCE_RECORD_BOUND_PENDING_EXTERNAL_VERIFICATION",
        "UPGRADE_ACCEPTANCE_RECORD_BOUND_PENDING_EXTERNAL_VERIFICATION"].includes(String(handoff.status)) ||
      !DIGEST.test(String(handoff.acceptanceRecordDigest)) ||
      handoff.independentlyVerified !== false || handoff.dispatchReopened === true ||
      (handoff.operationId !== undefined && handoff.operationId !== scope.operationId)) invalid("HANDOFF_INVALID");
  const decisionRaw = await privateFile(input.decisionFile);
  const decision = object(JSON.parse(decisionRaw), "DECISION_INVALID");
  const decisionKeys = ["schemaVersion", "product", "decisionId", "operationId", "planId", "planDigest",
    "decision", "acceptanceRecordDigest", "evidenceDigest", "authorizationReference", "decidedAt",
    "secretMaterialIncluded"];
  if (Object.keys(decision).some((key) => !decisionKeys.includes(key)) ||
      decisionKeys.some((key) => !(key in decision)) || decision.schemaVersion !== 1 ||
      decision.product !== "company-os" || !ID.test(String(decision.decisionId)) ||
      decision.operationId !== scope.operationId || decision.planId !== scope.planId ||
      decision.planDigest !== scope.planDigest || !["ACCEPTED", "REJECTED"].includes(String(decision.decision)) ||
      decision.acceptanceRecordDigest !== handoff.acceptanceRecordDigest ||
      !DIGEST.test(String(decision.evidenceDigest)) ||
      !AUTHORITY.test(String(decision.authorizationReference)) ||
      decision.authorizationReference === scope.authorizationReference ||
      typeof decision.decidedAt !== "string" || !Number.isFinite(Date.parse(decision.decidedAt)) ||
      decision.secretMaterialIncluded !== false) invalid("DECISION_INVALID");
  const state = { schemaVersion: 1, product: "company-os", operationId: scope.operationId,
    status: "ACCEPTANCE_CONFIRMED_DISPATCH_STILL_CLOSED",
    decisionId: decision.decisionId, decision: decision.decision, planId: scope.planId,
    planDigest: scope.planDigest, acceptanceRecordDigest: handoff.acceptanceRecordDigest,
    externalEvidenceDigest: decision.evidenceDigest, handoffStateDigest: sha256(handoffRaw),
    acceptanceWindowEvidenceDigest: sha256(windowRaw),
    sourceDecisionDigest: sha256(decisionRaw),
    activationAuthorizationReferenceDigest: referenceDigest(scope.authorizationReference),
    verificationAuthorizationReferenceDigest: referenceDigest(String(decision.authorizationReference)),
    decidedAt: decision.decidedAt, boundAt: (supplied.now ?? (() => new Date().toISOString()))(),
    independentlyVerified: true, dispatchReopened: false,
    customerRecordIncluded: false, secretMaterialIncluded: false } as const;
  await exclusiveRecord(join(evidenceDirectory, "acceptance-decision-bound.json"), state);
  return { schemaVersion: 1 as const, product: "company-os" as const,
    status: state.status, operationId: state.operationId, decisionId: state.decisionId,
    decision: state.decision, dispatchReopened: false as const };
}

export async function completeStagingAcceptance(input: HttpInput & {
  readonly completionAuthorizationReference: string;
}, supplied: { readonly fetch?: typeof fetch; readonly now?: () => string } = {}) {
  const root = await privateDirectory(input.rootDirectory, false);
  const evidenceDirectory = await privateDirectory(input.evidenceDirectory, true);
  if (!inside(root, evidenceDirectory)) invalid("DIRECTORY_UNSAFE");
  if (!AUTHORITY.test(input.completionAuthorizationReference)) invalid("COMPLETION_AUTHORIZATION_INVALID");
  let boundRaw: string;
  try { boundRaw = await privateFile(join(evidenceDirectory, "acceptance-decision-bound.json")); }
  catch (error) { if (isCode(error, "ENOENT")) invalid("DECISION_REQUIRED"); throw error; }
  const bound = object(JSON.parse(boundRaw), "DECISION_STATE_INVALID");
  const boundKeys = ["schemaVersion", "product", "operationId", "status", "decisionId", "decision",
    "planId", "planDigest", "acceptanceRecordDigest", "externalEvidenceDigest", "handoffStateDigest",
    "acceptanceWindowEvidenceDigest", "sourceDecisionDigest", "activationAuthorizationReferenceDigest",
    "verificationAuthorizationReferenceDigest", "decidedAt", "boundAt", "independentlyVerified",
    "dispatchReopened", "customerRecordIncluded", "secretMaterialIncluded"];
  if (Object.keys(bound).some((key) => !boundKeys.includes(key)) ||
      boundKeys.some((key) => !(key in bound)) || bound.schemaVersion !== 1 || bound.product !== "company-os" ||
      bound.status !== "ACCEPTANCE_CONFIRMED_DISPATCH_STILL_CLOSED" ||
      !ID.test(String(bound.operationId)) || !ID.test(String(bound.planId)) ||
      !DIGEST.test(String(bound.planDigest)) || !["ACCEPTED", "REJECTED"].includes(String(bound.decision)) ||
      ![bound.acceptanceRecordDigest, bound.externalEvidenceDigest, bound.handoffStateDigest,
        bound.acceptanceWindowEvidenceDigest, bound.sourceDecisionDigest,
        bound.activationAuthorizationReferenceDigest, bound.verificationAuthorizationReferenceDigest]
        .every((value) => DIGEST.test(String(value))) ||
      bound.independentlyVerified !== true || bound.dispatchReopened !== false ||
      bound.customerRecordIncluded !== false || bound.secretMaterialIncluded !== false ||
      [bound.activationAuthorizationReferenceDigest, bound.verificationAuthorizationReferenceDigest]
        .includes(referenceDigest(input.completionAuthorizationReference))) invalid("DECISION_STATE_INVALID");
  const cookie = await sessionCookie(input.sessionCookieFile);
  const origin = loopbackOrigin(input.activeApiLoopbackOrigin);
  const request = supplied.fetch ?? fetch;
  const before = await readMaintenance(request, origin, cookie);
  if (before.mode !== "ACCEPTANCE_ONLY" || before.operationId !== bound.operationId ||
      before.acceptance?.planId !== bound.planId || before.acceptance?.planDigest !== bound.planDigest) {
    invalid("ACTIVE_WINDOW_MISMATCH");
  }
  const targetMode = bound.decision === "ACCEPTED" ? "OPEN" : "DISPATCH_FROZEN";
  const response = await request(`${origin}/api/v1/instance/maintenance`, {
    method: "PATCH", redirect: "error", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ mode: targetMode, expectedRevision: before.revision,
      operationId: bound.operationId, authorizationReference: input.completionAuthorizationReference }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) invalid(`COMPLETE_HTTP_${response.status}`);
  const changed = exactChanged(await response.json(), targetMode);
  const after = await readMaintenance(request, origin, cookie);
  if (after.mode !== targetMode || after.revision !== changed.revision ||
      after.operationId !== bound.operationId || after.acceptance !== null ||
      after.authorizationReference !== input.completionAuthorizationReference) {
    invalid("COMPLETE_CONFIRMATION_FAILED");
  }
  const status = targetMode === "OPEN"
    ? "DISPATCH_REOPENED_AFTER_ACCEPTANCE"
    : "ACCEPTANCE_REJECTED_DISPATCH_FROZEN";
  const evidence = { schemaVersion: 1, product: "company-os", operationId: bound.operationId,
    status, decisionId: bound.decisionId, decision: bound.decision, planId: bound.planId,
    decisionStateDigest: sha256(boundRaw), beforeRevision: before.revision, completedRevision: after.revision,
    completionAuthorizationReferenceDigest: referenceDigest(input.completionAuthorizationReference),
    completedAt: (supplied.now ?? (() => new Date().toISOString()))(), dispatchReopened: targetMode === "OPEN",
    sessionMaterialIncluded: false, secretMaterialIncluded: false } as const;
  const name = targetMode === "OPEN" ? "dispatch-reopened.json" : "acceptance-rejected.json";
  await exclusiveRecord(join(evidenceDirectory, name), evidence);
  return { schemaVersion: 1 as const, product: "company-os" as const, status,
    operationId: String(bound.operationId), revision: after.revision,
    dispatchReopened: targetMode === "OPEN" };
}

async function acceptanceScope(path: string): Promise<AcceptanceScope> {
  const value = object(JSON.parse(await privateFile(path)), "SCOPE_INVALID");
  const keys = ["schemaVersion", "product", "operationId", "planId", "planDigest",
    "authorizationReference", "work"];
  if (Object.keys(value).some((key) => !keys.includes(key)) || keys.some((key) => !(key in value)) ||
      value.schemaVersion !== 1 || value.product !== "company-os" ||
      !ID.test(String(value.operationId)) || !ID.test(String(value.planId)) ||
      !DIGEST.test(String(value.planDigest)) || !AUTHORITY.test(String(value.authorizationReference)) ||
      !Array.isArray(value.work) || value.work.length < 1 || value.work.length > 32) invalid("SCOPE_INVALID");
  const seen = new Set<string>();
  for (const item of value.work as unknown[]) {
    const row = object(item, "SCOPE_INVALID"); const itemKeys = Object.keys(row);
    if (itemKeys.length !== 2 || !itemKeys.includes("companyId") || !itemKeys.includes("workId") ||
        !ID.test(String(row.companyId)) || !ID.test(String(row.workId)) ||
        seen.has(`${row.companyId}:${row.workId}`)) invalid("SCOPE_INVALID");
    seen.add(`${row.companyId}:${row.workId}`);
  }
  return structuredClone(value) as unknown as AcceptanceScope;
}

async function readMaintenance(request: typeof fetch, origin: string, cookie: string): Promise<MaintenanceState> {
  const response = await request(`${origin}/api/v1/instance/maintenance`, { redirect: "error",
    headers: { cookie }, signal: AbortSignal.timeout(5_000) });
  if (!response.ok) invalid(`READ_HTTP_${response.status}`);
  const value = object(await response.json(), "MAINTENANCE_RESPONSE_INVALID");
  const required = ["schemaVersion", "mode", "revision", "operationId", "authorizationReference",
    "changedBy", "changedAt"];
  if (required.some((key) => !(key in value)) ||
      Object.keys(value).some((key) => ![...required, "acceptance"].includes(key)) ||
      value.schemaVersion !== 1 || !MODES.includes(value.mode as Mode) ||
      !Number.isSafeInteger(value.revision) || Number(value.revision) < 0 ||
      !nullableBounded(value.operationId) || !nullableBounded(value.authorizationReference) ||
      (value.mode === "ACCEPTANCE_ONLY" ? !value.acceptance : value.acceptance != null)) {
    invalid("MAINTENANCE_RESPONSE_INVALID");
  }
  return { ...value, acceptance: value.acceptance ?? null } as unknown as MaintenanceState;
}

function exactChanged(value: unknown, mode: Mode) {
  const row = object(value, "MAINTENANCE_RESPONSE_INVALID");
  if (Object.keys(row).length !== 2 || row.mode !== mode ||
      !Number.isSafeInteger(row.revision) || Number(row.revision) < 1) invalid("MAINTENANCE_RESPONSE_INVALID");
  return { mode, revision: Number(row.revision) };
}

async function sessionCookie(path: string) {
  const value = (await privateFile(path)).trim();
  if (!/^\S+=\S+(?:;\s*\S+=\S+)*$/.test(value) || /[\r\n]/.test(value)) invalid("SESSION_INVALID");
  return value;
}

async function privateDirectory(pathValue: string, strict: boolean) {
  const path = resolve(pathValue); const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() ||
      (metadata.mode & (strict ? 0o077 : 0o027)) !== 0) invalid("DIRECTORY_UNSAFE");
  return path;
}

async function privateFile(pathValue: string) {
  const path = resolve(pathValue); const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o077) !== 0 || metadata.size < 2 || metadata.size > 1_048_576) invalid("FILE_UNSAFE");
  return readFile(path, "utf8");
}

async function exclusiveRecord(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
}

function loopbackOrigin(value: string) {
  try { const url = new URL(value);
    if (url.protocol !== "http:" || !["127.0.0.1", "::1", "[::1]"].includes(url.hostname) ||
        !url.port || url.pathname !== "/" || url.search || url.hash || url.username || url.password) throw new Error();
    return url.origin;
  } catch { invalid("ACTIVE_ORIGIN_INVALID"); }
}

function object(value: unknown, suffix: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(suffix);
  return value as Record<string, unknown>;
}
function nullableBounded(value: unknown) { return value === null || typeof value === "string" && value.length <= 255; }
function inside(root: string, child: string) {
  const suffix = relative(root, child);
  return suffix.length > 0 && !suffix.startsWith("..") && !isAbsolute(suffix);
}
function canonical(value: unknown) { return JSON.stringify(value); }
function sha256(value: string) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function referenceDigest(value: string) { return sha256(`${value}\n`); }
function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
function invalid(suffix: string): never { throw new Error(`STAGING_ACCEPTANCE_${suffix}`); }

function argumentsFrom(values: string[]) {
  const result: Record<string, string | boolean> = { apply: false };
  const flags: Record<string, string> = { "--action": "action", "--root": "rootDirectory",
    "--evidence": "evidenceDirectory", "--origin": "activeApiLoopbackOrigin",
    "--session": "sessionCookieFile", "--scope": "scopeFile", "--handoff": "handoffStateFile",
    "--decision": "decisionFile", "--authorization": "completionAuthorizationReference" };
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (flag === "--apply") result.apply = true;
    else if (flag && flags[flag]) {
      const value = values[++index]; if (!value) invalid("ARGUMENT_INVALID");
      result[flags[flag] as string] = value;
    } else invalid("ARGUMENT_INVALID");
  }
  return result;
}

function requiredArgument(input: Record<string, string | boolean>, key: string): string {
  const value = input[key]; if (typeof value !== "string" || !value) invalid("ARGUMENT_INVALID");
  return value;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const options = argumentsFrom(process.argv.slice(2));
  const action = requiredArgument(options, "action");
  if (!["open", "bind-decision", "complete"].includes(action)) invalid("ARGUMENT_INVALID");
  if (options.apply !== true) {
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, product: "company-os",
      action, status: "PLANNED_NOT_APPLIED", mutationAuthorized: false }, null, 2)}\n`);
  } else {
    const common = { rootDirectory: requiredArgument(options, "rootDirectory"),
      evidenceDirectory: requiredArgument(options, "evidenceDirectory") };
    const result = action === "open"
      ? await openStagingAcceptanceWindow({ ...common,
        activeApiLoopbackOrigin: requiredArgument(options, "activeApiLoopbackOrigin"),
        sessionCookieFile: requiredArgument(options, "sessionCookieFile"),
        scopeFile: requiredArgument(options, "scopeFile") })
      : action === "bind-decision"
        ? await bindStagingAcceptanceDecision({ ...common,
          scopeFile: requiredArgument(options, "scopeFile"),
          handoffStateFile: requiredArgument(options, "handoffStateFile"),
          decisionFile: requiredArgument(options, "decisionFile") })
        : await completeStagingAcceptance({ ...common,
          activeApiLoopbackOrigin: requiredArgument(options, "activeApiLoopbackOrigin"),
          sessionCookieFile: requiredArgument(options, "sessionCookieFile"),
          completionAuthorizationReference: requiredArgument(options, "completionAuthorizationReference") });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
