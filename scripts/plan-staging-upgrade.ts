import { createHash } from "node:crypto";

import { parseStagingUpgradeAuthorization } from
  "../adapters/config/staging-upgrade-authorization.ts";
import { createReleaseCutoverPlan } from "./plan-release-cutover.mjs";

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
