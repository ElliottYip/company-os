import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readlink, rename, rm, symlink, writeFile } from "node:fs/promises";
import { cpus, freemem, totalmem } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { evaluateStagingUpgradeCapacity, type StagingUpgradeHostCapacitySnapshot } from
  "../adapters/config/staging-upgrade-capacity.ts";

const EVIDENCE_TTL_MS = 5 * 60 * 1000;

export async function admitStagingUpgradeCapacity(input: {
  readonly rootDirectory: string;
  readonly runtimeContractFile: string;
  readonly activeSiteManifestFile: string;
}, supplied: {
  readonly now?: () => string;
  readonly capture?: () => Promise<StagingUpgradeHostCapacitySnapshot>;
} = {}) {
  const root = await safeDirectory(input.rootDirectory, "STAGING_UPGRADE_CAPACITY_ROOT_UNSAFE", 0o027);
  const [runtimeRaw, siteRaw] = await Promise.all([
    privateFile(input.runtimeContractFile, "STAGING_UPGRADE_CAPACITY_RUNTIME_FILE_UNSAFE"),
    privateFile(input.activeSiteManifestFile, "STAGING_UPGRADE_CAPACITY_SITE_FILE_UNSAFE"),
  ]);
  const now = supplied.now ?? (() => new Date().toISOString());
  const evaluatedAt = exactInstant(now(), "STAGING_UPGRADE_CAPACITY_TIME_INVALID");
  const snapshot = supplied.capture ? await supplied.capture() : await captureLinuxHostCapacity(evaluatedAt);
  const capturedAt = exactInstant(snapshot.capturedAt, "STAGING_UPGRADE_CAPACITY_CAPTURE_TIME_INVALID");
  const age = Date.parse(evaluatedAt) - Date.parse(capturedAt);
  if (age < -30_000 || age > EVIDENCE_TTL_MS) throw new Error("STAGING_UPGRADE_CAPACITY_SNAPSHOT_STALE");
  const admission = evaluateStagingUpgradeCapacity(JSON.parse(runtimeRaw), JSON.parse(siteRaw), snapshot);
  const expiresAt = new Date(Date.parse(evaluatedAt) + EVIDENCE_TTL_MS).toISOString();
  const evidence = {
    ...admission,
    evaluatedAt,
    expiresAt,
    bindings: { runtimeContractDigest: sha256(runtimeRaw), activeSiteManifestDigest: sha256(siteRaw),
      snapshotDigest: sha256(`${JSON.stringify(snapshot)}\n`) },
  } as const;
  const runtimeDirectory = await ensurePrivate(join(root, "upgrade-runtime"));
  const records = await ensurePrivate(join(runtimeDirectory, "capacity-records"));
  const operationDirectory = await ensurePrivate(join(records, admission.operationId));
  const evidenceRaw = `${JSON.stringify(evidence, null, 2)}\n`;
  const evidenceDigest = sha256(evidenceRaw);
  const recordName = `${snapshot.capturedAt.replaceAll(":", "-")}-${evidenceDigest.slice(7, 23)}.json`;
  const recordPath = join(operationDirectory, recordName);
  await writeFile(recordPath, evidenceRaw, { flag: "wx", mode: 0o600 });
  const currentLink = join(runtimeDirectory, "capacity-admission.json");
  const partialLink = `${currentLink}.partial-${process.pid}-${Date.now()}`;
  try {
    await symlink(join("capacity-records", admission.operationId, recordName), partialLink);
    await rename(partialLink, currentLink);
  } finally { await rm(partialLink, { force: true }); }
  return { ...evidence, evidenceDigest, evidenceFile: recordPath };
}

export async function readCurrentStagingUpgradeCapacityAdmission(input: {
  readonly rootDirectory: string;
  readonly operationId: string;
  readonly runtimeContractDigest: string;
  readonly activeSiteManifestDigest: string;
  readonly now?: string;
}) {
  const root = await safeDirectory(input.rootDirectory, "STAGING_UPGRADE_CAPACITY_ROOT_UNSAFE", 0o027);
  const runtimeDirectory = await safeDirectory(join(root, "upgrade-runtime"),
    "STAGING_UPGRADE_CAPACITY_DIRECTORY_UNSAFE", 0o077);
  const link = join(runtimeDirectory, "capacity-admission.json");
  const metadata = await lstat(link);
  if (!metadata.isSymbolicLink()) throw new Error("STAGING_UPGRADE_CAPACITY_CURRENT_POINTER_UNSAFE");
  const target = await readlink(link);
  const expectedPrefix = join("capacity-records", input.operationId) + "/";
  if (isAbsolute(target) || !target.startsWith(expectedPrefix) || target.includes("..")) {
    throw new Error("STAGING_UPGRADE_CAPACITY_CURRENT_POINTER_UNSAFE");
  }
  const raw = await privateFile(join(runtimeDirectory, target), "STAGING_UPGRADE_CAPACITY_EVIDENCE_UNSAFE");
  const evidence = JSON.parse(raw);
  const now = exactInstant(input.now ?? new Date().toISOString(), "STAGING_UPGRADE_CAPACITY_TIME_INVALID");
  if (evidence?.schemaVersion !== 1 || evidence.product !== "company-os" ||
      evidence.operationId !== input.operationId || evidence.status !== "READY_FOR_CANDIDATE_CREATION" ||
      evidence.bindings?.runtimeContractDigest !== input.runtimeContractDigest ||
      evidence.bindings?.activeSiteManifestDigest !== input.activeSiteManifestDigest ||
      Date.parse(now) > Date.parse(String(evidence.expiresAt))) {
    throw new Error("STAGING_UPGRADE_CAPACITY_EVIDENCE_NOT_ADMISSIBLE");
  }
  return { evidence, evidenceDigest: sha256(raw), evidenceFile: join(runtimeDirectory, target) };
}

async function captureLinuxHostCapacity(capturedAt: string): Promise<StagingUpgradeHostCapacitySnapshot> {
  let pidMaximum: number;
  try { pidMaximum = Number((await readFile("/proc/sys/kernel/pid_max", "utf8")).trim()); }
  catch { throw new Error("STAGING_UPGRADE_CAPACITY_LINUX_PID_LIMIT_UNAVAILABLE"); }
  return { schemaVersion: 1, capturedAt, logicalCpuCount: cpus().length,
    totalMemoryBytes: totalmem(), availableMemoryBytes: freemem(), pidMaximum };
}

async function privateFile(pathValue: string, code: string) {
  if (!isAbsolute(pathValue)) throw new Error(code);
  const path = resolve(pathValue); const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o077) !== 0 || metadata.size < 2 || metadata.size > 1_048_576) throw new Error(code);
  return readFile(path, "utf8");
}
async function safeDirectory(pathValue: string, code: string, forbiddenMode: number) {
  if (!isAbsolute(pathValue)) throw new Error(code);
  const path = resolve(pathValue); const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & forbiddenMode) !== 0) {
    throw new Error(code);
  }
  return path;
}
async function ensurePrivate(path: string) {
  try { await mkdir(path, { mode: 0o700 }); }
  catch (error) { if (!isCode(error, "EEXIST")) throw error; }
  return safeDirectory(path, "STAGING_UPGRADE_CAPACITY_DIRECTORY_UNSAFE", 0o077);
}
function exactInstant(value: string, code: string) {
  if (!Number.isFinite(Date.parse(value))) throw new Error(code);
  try { if (new Date(value).toISOString() !== value) throw new Error(code); }
  catch { throw new Error(code); }
  return value;
}
function sha256(value: string) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
