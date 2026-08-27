import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { StagingUpgradePreparationStepRecord } from
  "./create-staging-upgrade-preparation-adapter.ts";
import { inspectDeploymentDrain } from "./inspect-deployment-drain.ts";

const DIGEST = /^sha256:[a-f0-9]{64}$/;

export async function createStagingUpgradeStateComparisonOperation(input: {
  readonly candidateDirectory: string;
  readonly operationId: string;
  readonly siteId: string;
  readonly candidateReleaseId: string;
  readonly baselineEvidenceFile?: string;
}, supplied: { readonly inspectCandidate?: typeof inspectDeploymentDrain;
  readonly now?: () => string } = {}) {
  const directory = await privateDirectory(input.candidateDirectory);
  const evidenceDirectory = await ensurePrivate(join(directory, "step-evidence"));
  const baselinePath = input.baselineEvidenceFile ?? join(evidenceDirectory, "reconcile-attempts.json");
  const inspect = supplied.inspectCandidate ?? inspectDeploymentDrain;
  const now = supplied.now ?? (() => new Date().toISOString());
  return async (): Promise<StagingUpgradePreparationStepRecord> => {
    const baseline = parseBaseline(await privateFile(baselinePath,
      "STAGING_UPGRADE_STATE_BASELINE_UNSAFE", 1_048_576), input);
    const candidate = await inspect();
    if (candidate.schemaVersion !== 1 || candidate.status !== "DRAINED" ||
        candidate.restartAllowed !== true || candidate.blockers.length !== 0 ||
        candidate.exactSourceDigest !== baseline.exactSourceDigest ||
        JSON.stringify(candidate.snapshot) !== JSON.stringify(baseline.snapshot)) {
      throw new Error("STAGING_UPGRADE_STATE_COMPARISON_MISMATCH");
    }
    const evidence = { schemaVersion: 1, product: "company-os", operationId: input.operationId,
      siteId: input.siteId, candidateReleaseId: input.candidateReleaseId,
      step: "state-comparison", outcome: "CONTROL_TOTALS_AND_RESPONSIBILITY_EVIDENCE_MATCHED",
      capturedAt: now(), exactSourceDigest: candidate.exactSourceDigest,
      snapshot: candidate.snapshot, customerRecordsIncluded: false,
      secretMaterialIncluded: false } as const;
    const raw = `${JSON.stringify(evidence, null, 2)}\n`; const evidenceDigest = sha256(raw);
    await writeFile(join(evidenceDirectory, "state-comparison.json"), raw, { flag: "wx", mode: 0o600 });
    return { schemaVersion: 1, product: "company-os", operationId: input.operationId,
      siteId: input.siteId, candidateReleaseId: input.candidateReleaseId,
      step: "state-comparison", outcome: "CONTROL_TOTALS_AND_RESPONSIBILITY_EVIDENCE_MATCHED",
      evidenceDigest, secretMaterialIncluded: false };
  };
}

function parseBaseline(raw: string, input: { readonly operationId: string; readonly siteId: string;
  readonly candidateReleaseId: string }) {
  let value: unknown; try { value = JSON.parse(raw); }
  catch { throw new Error("STAGING_UPGRADE_STATE_BASELINE_INVALID"); }
  if (!record(value) || value.schemaVersion !== 1 || value.product !== "company-os" ||
      value.operationId !== input.operationId || value.siteId !== input.siteId ||
      value.candidateReleaseId !== input.candidateReleaseId || value.step !== "reconcile-attempts" ||
      value.outcome !== "EVERY_IN_FLIGHT_ATTEMPT_DRAINED_CANCELLED_OR_DURABLY_RECOVERABLE" ||
      !DIGEST.test(String(value.exactSourceDigest)) || !validSnapshot(value.snapshot) ||
      !Array.isArray(value.blockers) || value.blockers.length !== 0 || value.customerRecordsIncluded !== false ||
      value.secretMaterialIncluded !== false) throw new Error("STAGING_UPGRADE_STATE_BASELINE_INVALID");
  return value as unknown as { readonly exactSourceDigest: string; readonly snapshot: Record<string, number> };
}
function validSnapshot(value: unknown): value is Record<string, number> {
  if (!record(value)) return false; const entries = Object.entries(value);
  return entries.length === 9 && entries.every(([, item]) => Number.isSafeInteger(item) && Number(item) >= 0);
}
async function privateDirectory(value: string) {
  const path = resolve(value); const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) {
    throw new Error("STAGING_UPGRADE_STATE_DIRECTORY_UNSAFE");
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
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function sha256(value: string) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
