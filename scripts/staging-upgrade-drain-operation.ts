import { createHash } from "node:crypto";
import { lstat, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { StagingUpgradePreparationStepRecord } from
  "./create-staging-upgrade-preparation-adapter.ts";
import { inspectDeploymentDrain } from "./inspect-deployment-drain.ts";

export async function createStagingUpgradeDrainOperation(input: {
  readonly candidateDirectory: string;
  readonly operationId: string;
  readonly siteId: string;
  readonly candidateReleaseId: string;
}, supplied: { readonly inspectDrain?: typeof inspectDeploymentDrain } = {}) {
  const directory = await privateDirectory(input.candidateDirectory);
  const records = await ensurePrivate(join(directory, "step-evidence"));
  const inspect = supplied.inspectDrain ?? inspectDeploymentDrain;
  return async (): Promise<StagingUpgradePreparationStepRecord> => {
    const drain = await inspect();
    if (drain.schemaVersion !== 1 || drain.status !== "DRAINED" || drain.restartAllowed !== true ||
        drain.blockers.length !== 0 || !/^sha256:[a-f0-9]{64}$/.test(drain.exactSourceDigest) ||
        drain.snapshot.maintenanceRevision < 1) {
      throw new Error(`STAGING_UPGRADE_DRAIN_NOT_READY:${drain.status}`);
    }
    const evidence = { schemaVersion: 1, product: "company-os", operationId: input.operationId,
      siteId: input.siteId, candidateReleaseId: input.candidateReleaseId,
      step: "reconcile-attempts", outcome:
        "EVERY_IN_FLIGHT_ATTEMPT_DRAINED_CANCELLED_OR_DURABLY_RECOVERABLE",
      observedAt: drain.observedAt, exactSourceDigest: drain.exactSourceDigest,
      snapshot: drain.snapshot, blockers: [], customerRecordsIncluded: false,
      secretMaterialIncluded: false } as const;
    const raw = `${JSON.stringify(evidence, null, 2)}\n`; const evidenceDigest = sha256(raw);
    await writeFile(join(records, "reconcile-attempts.json"), raw, { flag: "wx", mode: 0o600 });
    return { schemaVersion: 1, product: "company-os", operationId: input.operationId,
      siteId: input.siteId, candidateReleaseId: input.candidateReleaseId,
      step: "reconcile-attempts",
      outcome: "EVERY_IN_FLIGHT_ATTEMPT_DRAINED_CANCELLED_OR_DURABLY_RECOVERABLE",
      evidenceDigest, secretMaterialIncluded: false };
  };
}

async function privateDirectory(value: string) {
  const path = resolve(value); const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) {
    throw new Error("STAGING_UPGRADE_DRAIN_DIRECTORY_UNSAFE");
  }
  return path;
}
async function ensurePrivate(path: string) {
  try { await mkdir(path, { mode: 0o700 }); } catch (error) { if (!isCode(error, "EEXIST")) throw error; }
  return privateDirectory(path);
}
function sha256(value: string) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
