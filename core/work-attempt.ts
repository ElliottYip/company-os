import type { Identifier } from "./control-plane.ts";
import type { ModelExecutionAuthority } from "./model-governance.ts";

export type WorkAttemptStatus =
  | "QUEUED"
  | "LEASED"
  | "RUNNING"
  | "AWAITING_APPROVAL"
  | "CANCELLATION_REQUESTED"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT"
  | "OUTCOME_UNKNOWN";

export interface WorkAuthoritySnapshot {
  readonly responsibilityContractId: Identifier;
  readonly responsibilityContractRevision: number;
  readonly accountableHumanId: Identifier;
  readonly actionIds: readonly Identifier[];
  readonly permissionIds: readonly Identifier[];
  readonly dataAuthorizationIds: readonly Identifier[];
  readonly connectorId: Identifier;
  readonly connectorCapabilityDigest: string;
  /** Absent on legacy records; normalized to null when a new Attempt is created. */
  readonly model?: ModelExecutionAuthority | null;
}

export interface WorkAttemptLease {
  readonly ownerId: Identifier;
  readonly fencingToken: number;
  readonly acquiredAt: string;
  readonly expiresAt: string;
}

export type UnknownOutcomeResolution =
  | "CONFIRMED_SUCCEEDED"
  | "CONFIRMED_FAILED"
  | "SAFE_TO_RETRY";

export interface WorkAttemptReconciliation {
  readonly resolution: UnknownOutcomeResolution;
  readonly resolvedBy: Identifier;
  readonly evidenceId: Identifier;
  readonly resolvedAt: string;
}

export interface WorkAttempt {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly workId: Identifier;
  readonly agentId: Identifier;
  readonly attemptNumber: number;
  readonly idempotencyKey: string;
  readonly timeoutAt: string;
  readonly authority: WorkAuthoritySnapshot;
  readonly status: WorkAttemptStatus;
  readonly lease: WorkAttemptLease | null;
  readonly lastFencingToken: number;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly resultId: Identifier | null;
  readonly pendingApprovalId: Identifier | null;
  readonly reconciliation: WorkAttemptReconciliation | null;
}

export interface WorkAttemptDraft {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly workId: Identifier;
  readonly agentId: Identifier;
  readonly attemptNumber: number;
  readonly idempotencyKey: string;
  readonly timeoutAt: string;
  readonly authority: WorkAuthoritySnapshot;
  readonly createdAt: string;
}

const PORTABLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;
const PORTABLE_REFERENCE = /^[a-z0-9][a-z0-9-]{0,127}$/;
const TERMINAL = new Set<WorkAttemptStatus>([
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
]);

function id(value: string, code: string): Identifier {
  const normalized = value.trim();
  if (!PORTABLE_ID.test(normalized)) throw new Error(code);
  return normalized;
}

function instant(value: string, code: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) throw new Error(code);
  return value;
}

function uniqueIds(values: readonly Identifier[], code: string): readonly Identifier[] {
  const normalized = values.map((value) => id(value, code));
  if (new Set(normalized).size !== normalized.length) throw new Error(code);
  return normalized;
}

function modelAuthority(value: ModelExecutionAuthority | null | undefined): ModelExecutionAuthority | null {
  if (!value) return null;
  if (![value.policyId, value.routeId, value.providerAdapterId, value.modelReference,
    value.credentialReferenceId].every((reference) => PORTABLE_REFERENCE.test(reference))) {
    throw new Error("WORK_ATTEMPT_MODEL_REFERENCE_INVALID");
  }
  if (!Number.isSafeInteger(value.credentialVersion) || value.credentialVersion < 1) {
    throw new Error("WORK_ATTEMPT_MODEL_CREDENTIAL_VERSION_INVALID");
  }
  if (!SHA256_DIGEST.test(value.providerCapabilityDigest)) {
    throw new Error("WORK_ATTEMPT_MODEL_CAPABILITY_DIGEST_INVALID");
  }
  if (!["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"].includes(value.classification) ||
      !["MANAGED_CLOUD", "LOCAL"].includes(value.residency)) {
    throw new Error("WORK_ATTEMPT_MODEL_AUTHORITY_INVALID");
  }
  return structuredClone(value);
}

function requireActiveLease(
  attempt: WorkAttempt,
  fencingToken: number,
  now: string,
): WorkAttemptLease {
  if (TERMINAL.has(attempt.status)) throw new Error("WORK_ATTEMPT_TERMINAL");
  const lease = attempt.lease;
  if (!lease || lease.fencingToken !== fencingToken) throw new Error("WORK_ATTEMPT_FENCED");
  if (Date.parse(instant(now, "WORK_ATTEMPT_TIME_INVALID")) >= Date.parse(lease.expiresAt)) {
    throw new Error("WORK_ATTEMPT_LEASE_EXPIRED");
  }
  return lease;
}

export function createWorkAttempt(draft: WorkAttemptDraft): WorkAttempt {
  if (!Number.isSafeInteger(draft.attemptNumber) || draft.attemptNumber < 1) {
    throw new Error("WORK_ATTEMPT_NUMBER_INVALID");
  }
  if (!Number.isSafeInteger(draft.authority.responsibilityContractRevision) ||
      draft.authority.responsibilityContractRevision < 1) {
    throw new Error("WORK_ATTEMPT_CONTRACT_REVISION_INVALID");
  }
  const createdAt = instant(draft.createdAt, "WORK_ATTEMPT_CREATED_AT_INVALID");
  const timeoutAt = instant(draft.timeoutAt, "WORK_ATTEMPT_TIMEOUT_INVALID");
  if (Date.parse(timeoutAt) <= Date.parse(createdAt)) {
    throw new Error("WORK_ATTEMPT_TIMEOUT_INVALID");
  }
  if (!draft.idempotencyKey.trim()) throw new Error("WORK_ATTEMPT_IDEMPOTENCY_KEY_REQUIRED");
  if (!SHA256_DIGEST.test(draft.authority.connectorCapabilityDigest)) {
    throw new Error("WORK_ATTEMPT_CAPABILITY_DIGEST_INVALID");
  }

  return {
    id: id(draft.id, "WORK_ATTEMPT_ID_INVALID"),
    companyId: id(draft.companyId, "WORK_ATTEMPT_COMPANY_ID_INVALID"),
    workId: id(draft.workId, "WORK_ATTEMPT_WORK_ID_INVALID"),
    agentId: id(draft.agentId, "WORK_ATTEMPT_AGENT_ID_INVALID"),
    attemptNumber: draft.attemptNumber,
    idempotencyKey: draft.idempotencyKey.trim(),
    timeoutAt,
    authority: {
      responsibilityContractId: id(
        draft.authority.responsibilityContractId,
        "WORK_ATTEMPT_CONTRACT_ID_INVALID",
      ),
      responsibilityContractRevision: draft.authority.responsibilityContractRevision,
      accountableHumanId: id(
        draft.authority.accountableHumanId,
        "WORK_ATTEMPT_ACCOUNTABLE_HUMAN_ID_INVALID",
      ),
      actionIds: uniqueIds(draft.authority.actionIds, "WORK_ATTEMPT_ACTION_IDS_INVALID"),
      permissionIds: uniqueIds(
        draft.authority.permissionIds,
        "WORK_ATTEMPT_PERMISSION_IDS_INVALID",
      ),
      dataAuthorizationIds: uniqueIds(
        draft.authority.dataAuthorizationIds,
        "WORK_ATTEMPT_DATA_AUTHORIZATION_IDS_INVALID",
      ),
      connectorId: id(draft.authority.connectorId, "WORK_ATTEMPT_CONNECTOR_ID_INVALID"),
      connectorCapabilityDigest: draft.authority.connectorCapabilityDigest,
      model: modelAuthority(draft.authority.model),
    },
    status: "QUEUED",
    lease: null,
    lastFencingToken: 0,
    createdAt,
    startedAt: null,
    completedAt: null,
    resultId: null,
    pendingApprovalId: null,
    reconciliation: null,
  };
}

export function acquireWorkAttemptLease(
  attempt: WorkAttempt,
  lease: WorkAttemptLease,
): WorkAttempt {
  if (attempt.status === "OUTCOME_UNKNOWN") {
    throw new Error("WORK_ATTEMPT_RECONCILIATION_REQUIRED");
  }
  if (attempt.status !== "QUEUED") throw new Error("WORK_ATTEMPT_NOT_QUEUED");
  if (!Number.isSafeInteger(lease.fencingToken) || lease.fencingToken <= attempt.lastFencingToken) {
    throw new Error("WORK_ATTEMPT_FENCING_TOKEN_STALE");
  }
  const acquiredAt = instant(lease.acquiredAt, "WORK_ATTEMPT_LEASE_TIME_INVALID");
  const expiresAt = instant(lease.expiresAt, "WORK_ATTEMPT_LEASE_TIME_INVALID");
  if (Date.parse(expiresAt) <= Date.parse(acquiredAt) || Date.parse(expiresAt) >= Date.parse(attempt.timeoutAt)) {
    throw new Error("WORK_ATTEMPT_LEASE_TIME_INVALID");
  }
  return {
    ...attempt,
    status: "LEASED",
    lease: {
      ownerId: id(lease.ownerId, "WORK_ATTEMPT_LEASE_OWNER_INVALID"),
      fencingToken: lease.fencingToken,
      acquiredAt,
      expiresAt,
    },
    lastFencingToken: lease.fencingToken,
  };
}

export function startWorkAttempt(
  attempt: WorkAttempt,
  fencingToken: number,
  startedAt: string,
): WorkAttempt {
  if (attempt.status !== "LEASED") throw new Error("WORK_ATTEMPT_NOT_LEASED");
  requireActiveLease(attempt, fencingToken, startedAt);
  return { ...attempt, status: "RUNNING", startedAt };
}

export function completeWorkAttempt(
  attempt: WorkAttempt,
  fencingToken: number,
  outcome: "SUCCEEDED" | "FAILED",
  resultId: Identifier | null,
  completedAt: string,
): WorkAttempt {
  requireActiveLease(attempt, fencingToken, completedAt);
  if (attempt.status !== "RUNNING") throw new Error("WORK_ATTEMPT_NOT_RUNNING");
  if (outcome === "SUCCEEDED" && !resultId) throw new Error("WORK_ATTEMPT_RESULT_REQUIRED");
  return {
    ...attempt,
    status: outcome,
    lease: null,
    completedAt,
    resultId: resultId ? id(resultId, "WORK_ATTEMPT_RESULT_ID_INVALID") : null,
    pendingApprovalId: null,
  };
}

export function pauseWorkAttemptForApproval(
  attempt: WorkAttempt,
  fencingToken: number,
  approvalRequestId: Identifier,
  pausedAt: string,
): WorkAttempt {
  requireActiveLease(attempt, fencingToken, pausedAt);
  if (attempt.status !== "RUNNING") throw new Error("WORK_ATTEMPT_NOT_RUNNING");
  return {
    ...attempt,
    status: "AWAITING_APPROVAL",
    pendingApprovalId: id(approvalRequestId, "WORK_ATTEMPT_APPROVAL_ID_INVALID"),
  };
}

export function resumeWorkAttemptAfterApproval(
  attempt: WorkAttempt,
  fencingToken: number,
  approvalRequestId: Identifier,
  resumedAt: string,
): WorkAttempt {
  requireActiveLease(attempt, fencingToken, resumedAt);
  if (attempt.status !== "AWAITING_APPROVAL") {
    throw new Error("WORK_ATTEMPT_NOT_AWAITING_APPROVAL");
  }
  if (attempt.pendingApprovalId !== approvalRequestId) {
    throw new Error("WORK_ATTEMPT_APPROVAL_MISMATCH");
  }
  return { ...attempt, status: "RUNNING", pendingApprovalId: null };
}

export function cancelWorkAttempt(
  attempt: WorkAttempt,
  fencingToken: number | null,
  cancelledAt: string,
): WorkAttempt {
  if (TERMINAL.has(attempt.status)) throw new Error("WORK_ATTEMPT_TERMINAL");
  const at = instant(cancelledAt, "WORK_ATTEMPT_TIME_INVALID");
  if (attempt.status === "OUTCOME_UNKNOWN") {
    throw new Error("WORK_ATTEMPT_RECONCILIATION_REQUIRED");
  }
  if (attempt.status !== "QUEUED") {
    if (fencingToken === null) throw new Error("WORK_ATTEMPT_FENCED");
    requireActiveLease(attempt, fencingToken, at);
  }
  return {
    ...attempt,
    status: "CANCELLED",
    lease: null,
    completedAt: at,
    pendingApprovalId: null,
  };
}

export function requestWorkAttemptCancellation(
  attempt: WorkAttempt,
  fencingToken: number | null,
  requestedAt: string,
): WorkAttempt {
  if (TERMINAL.has(attempt.status)) throw new Error("WORK_ATTEMPT_TERMINAL");
  const at = instant(requestedAt, "WORK_ATTEMPT_TIME_INVALID");
  if (attempt.status === "OUTCOME_UNKNOWN") throw new Error("WORK_ATTEMPT_RECONCILIATION_REQUIRED");
  if (attempt.status === "CANCELLATION_REQUESTED") return attempt;
  if (attempt.status !== "QUEUED") {
    if (fencingToken === null) throw new Error("WORK_ATTEMPT_FENCED");
    requireActiveLease(attempt, fencingToken, at);
  }
  return { ...attempt, status: "CANCELLATION_REQUESTED", pendingApprovalId: null };
}

export function timeOutWorkAttempt(attempt: WorkAttempt, timedOutAt: string): WorkAttempt {
  if (TERMINAL.has(attempt.status)) throw new Error("WORK_ATTEMPT_TERMINAL");
  const at = instant(timedOutAt, "WORK_ATTEMPT_TIME_INVALID");
  if (Date.parse(at) < Date.parse(attempt.timeoutAt)) {
    throw new Error("WORK_ATTEMPT_TIMEOUT_NOT_REACHED");
  }
  if (attempt.status === "OUTCOME_UNKNOWN") return attempt;
  const outcomeMayExist = attempt.status === "RUNNING" || attempt.status === "AWAITING_APPROVAL" ||
    attempt.status === "CANCELLATION_REQUESTED";
  return {
    ...attempt,
    status: outcomeMayExist ? "OUTCOME_UNKNOWN" : "TIMED_OUT",
    lease: null,
    completedAt: outcomeMayExist ? null : at,
    pendingApprovalId: null,
  };
}

export function expireWorkAttemptLease(attempt: WorkAttempt, expiredAt: string): WorkAttempt {
  if (!attempt.lease) throw new Error("WORK_ATTEMPT_LEASE_MISSING");
  const at = instant(expiredAt, "WORK_ATTEMPT_TIME_INVALID");
  if (Date.parse(at) < Date.parse(attempt.lease.expiresAt)) {
    throw new Error("WORK_ATTEMPT_LEASE_ACTIVE");
  }
  if (attempt.status === "LEASED") return { ...attempt, status: "QUEUED", lease: null };
  if (attempt.status === "RUNNING" || attempt.status === "AWAITING_APPROVAL" ||
      attempt.status === "CANCELLATION_REQUESTED") {
    return { ...attempt, status: "OUTCOME_UNKNOWN", lease: null, pendingApprovalId: null };
  }
  throw new Error("WORK_ATTEMPT_LEASE_STATE_INVALID");
}

export function reconcileUnknownOutcome(
  attempt: WorkAttempt,
  reconciliation: WorkAttemptReconciliation,
): WorkAttempt {
  if (attempt.status !== "OUTCOME_UNKNOWN") {
    throw new Error("WORK_ATTEMPT_NOT_OUTCOME_UNKNOWN");
  }
  if (!reconciliation.evidenceId.trim()) {
    throw new Error("WORK_ATTEMPT_RECONCILIATION_EVIDENCE_REQUIRED");
  }
  const resolvedAt = instant(reconciliation.resolvedAt, "WORK_ATTEMPT_TIME_INVALID");
  return {
    ...attempt,
    status: reconciliation.resolution === "CONFIRMED_SUCCEEDED" ? "SUCCEEDED" : "FAILED",
    completedAt: resolvedAt,
    pendingApprovalId: null,
    reconciliation: {
      resolution: reconciliation.resolution,
      resolvedBy: id(reconciliation.resolvedBy, "WORK_ATTEMPT_RECONCILER_INVALID"),
      evidenceId: id(reconciliation.evidenceId, "WORK_ATTEMPT_RECONCILIATION_EVIDENCE_INVALID"),
      resolvedAt,
    },
  };
}
