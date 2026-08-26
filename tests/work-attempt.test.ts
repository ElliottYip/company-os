import assert from "node:assert/strict";
import test from "node:test";
import {
  acquireWorkAttemptLease,
  cancelWorkAttempt,
  completeWorkAttempt,
  createWorkAttempt,
  expireWorkAttemptLease,
  pauseWorkAttemptForApproval,
  reconcileUnknownOutcome,
  resumeWorkAttemptAfterApproval,
  startWorkAttempt,
  timeOutWorkAttempt,
} from "../core/work-attempt.ts";

function draft() {
  return {
    id: "attempt-1",
    companyId: "company-1",
    workId: "work-1",
    agentId: "agent-1",
    attemptNumber: 1,
    idempotencyKey: "work-1:attempt-1",
    timeoutAt: "2026-08-20T10:30:00.000Z",
    authority: {
      responsibilityContractId: "contract-1",
      responsibilityContractRevision: 7,
      accountableHumanId: "human-1",
      actionIds: ["read-data", "publish-result"],
      permissionIds: ["permission-1"],
      dataAuthorizationIds: ["data-contract-1"],
      connectorId: "connector-1",
      connectorCapabilityDigest: `sha256:${"a".repeat(64)}`,
      model: {
        policyId: "default-models",
        routeId: "local-primary",
        providerAdapterId: "provider-one",
        modelReference: "model-one",
        classification: "INTERNAL",
        residency: "LOCAL",
        credentialReferenceId: "model-secret-one",
        credentialVersion: 7,
        providerCapabilityDigest: `sha256:${"b".repeat(64)}`,
      },
    },
    createdAt: "2026-08-20T10:00:00.000Z",
  };
}

test("an attempt freezes the exact responsibility, capability, permission, and data authority", () => {
  const input = draft();
  const attempt = createWorkAttempt(input);
  input.authority.actionIds.push("mutated-action");
  input.authority.permissionIds.push("mutated-permission");

  assert.equal(attempt.status, "QUEUED");
  assert.deepEqual(attempt.authority.actionIds, ["read-data", "publish-result"]);
  assert.deepEqual(attempt.authority.permissionIds, ["permission-1"]);
  assert.equal(attempt.authority.responsibilityContractRevision, 7);
  assert.equal(attempt.authority.model?.routeId, "local-primary");
  assert.equal(attempt.lastFencingToken, 0);
});

test("an attempt rejects a malformed model authority before persistence", () => {
  const input = draft();
  input.authority.model.providerCapabilityDigest = "sha256:not-a-real-digest";
  assert.throws(() => createWorkAttempt(input), /WORK_ATTEMPT_MODEL_CAPABILITY_DIGEST_INVALID/);
});

test("a newer lease fences a stale worker before it can start or complete", () => {
  const queued = createWorkAttempt(draft());
  const firstLease = acquireWorkAttemptLease(queued, {
    ownerId: "worker-a",
    fencingToken: 1,
    acquiredAt: "2026-08-20T10:01:00.000Z",
    expiresAt: "2026-08-20T10:02:00.000Z",
  });
  const requeued = expireWorkAttemptLease(firstLease, "2026-08-20T10:03:00.000Z");
  const secondLease = acquireWorkAttemptLease(requeued, {
    ownerId: "worker-b",
    fencingToken: 2,
    acquiredAt: "2026-08-20T10:03:01.000Z",
    expiresAt: "2026-08-20T10:05:00.000Z",
  });

  assert.throws(
    () => startWorkAttempt(secondLease, 1, "2026-08-20T10:03:02.000Z"),
    /WORK_ATTEMPT_FENCED/,
  );
  const running = startWorkAttempt(secondLease, 2, "2026-08-20T10:03:02.000Z");
  assert.throws(
    () => completeWorkAttempt(running, 1, "SUCCEEDED", "result-1", "2026-08-20T10:04:00.000Z"),
    /WORK_ATTEMPT_FENCED/,
  );
  assert.equal(
    completeWorkAttempt(running, 2, "SUCCEEDED", "result-1", "2026-08-20T10:04:00.000Z").status,
    "SUCCEEDED",
  );
});

test("an expired running lease becomes outcome-unknown and cannot be retried without evidence", () => {
  const leased = acquireWorkAttemptLease(createWorkAttempt(draft()), {
    ownerId: "worker-a",
    fencingToken: 1,
    acquiredAt: "2026-08-20T10:01:00.000Z",
    expiresAt: "2026-08-20T10:02:00.000Z",
  });
  const running = startWorkAttempt(leased, 1, "2026-08-20T10:01:01.000Z");
  const unknown = expireWorkAttemptLease(running, "2026-08-20T10:03:00.000Z");

  assert.equal(unknown.status, "OUTCOME_UNKNOWN");
  assert.throws(
    () => acquireWorkAttemptLease(unknown, {
      ownerId: "worker-b",
      fencingToken: 2,
      acquiredAt: "2026-08-20T10:03:01.000Z",
      expiresAt: "2026-08-20T10:05:00.000Z",
    }),
    /WORK_ATTEMPT_RECONCILIATION_REQUIRED/,
  );
  assert.throws(
    () => reconcileUnknownOutcome(unknown, {
      resolution: "SAFE_TO_RETRY",
      resolvedBy: "human-1",
      evidenceId: "",
      resolvedAt: "2026-08-20T10:04:00.000Z",
    }),
    /WORK_ATTEMPT_RECONCILIATION_EVIDENCE_REQUIRED/,
  );

  const reconciled = reconcileUnknownOutcome(unknown, {
    resolution: "SAFE_TO_RETRY",
    resolvedBy: "human-1",
    evidenceId: "evidence-reconciliation-1",
    resolvedAt: "2026-08-20T10:04:00.000Z",
  });
  assert.equal(reconciled.status, "FAILED");
  assert.equal(reconciled.reconciliation?.resolution, "SAFE_TO_RETRY");
});

test("terminal attempts are monotonic", () => {
  const leased = acquireWorkAttemptLease(createWorkAttempt(draft()), {
    ownerId: "worker-a",
    fencingToken: 1,
    acquiredAt: "2026-08-20T10:01:00.000Z",
    expiresAt: "2026-08-20T10:05:00.000Z",
  });
  const succeeded = completeWorkAttempt(
    startWorkAttempt(leased, 1, "2026-08-20T10:01:01.000Z"),
    1,
    "SUCCEEDED",
    "result-1",
    "2026-08-20T10:02:00.000Z",
  );
  assert.throws(
    () => completeWorkAttempt(succeeded, 1, "FAILED", null, "2026-08-20T10:03:00.000Z"),
    /WORK_ATTEMPT_TERMINAL/,
  );
});

test("approval pause and resume stay bound to one request and one live worker", () => {
  const leased = acquireWorkAttemptLease(createWorkAttempt(draft()), {
    ownerId: "worker-a",
    fencingToken: 1,
    acquiredAt: "2026-08-20T10:01:00.000Z",
    expiresAt: "2026-08-20T10:05:00.000Z",
  });
  const paused = pauseWorkAttemptForApproval(
    startWorkAttempt(leased, 1, "2026-08-20T10:01:01.000Z"),
    1,
    "approval-1",
    "2026-08-20T10:02:00.000Z",
  );
  assert.equal(paused.status, "AWAITING_APPROVAL");
  assert.equal(paused.pendingApprovalId, "approval-1");
  assert.throws(
    () => resumeWorkAttemptAfterApproval(
      paused,
      1,
      "approval-other",
      "2026-08-20T10:02:30.000Z",
    ),
    /WORK_ATTEMPT_APPROVAL_MISMATCH/,
  );
  const resumed = resumeWorkAttemptAfterApproval(
    paused,
    1,
    "approval-1",
    "2026-08-20T10:02:30.000Z",
  );
  assert.equal(resumed.status, "RUNNING");
  assert.equal(resumed.pendingApprovalId, null);
});

test("timeout never guesses the outcome of work that may have reached an external system", () => {
  const queued = createWorkAttempt(draft());
  assert.equal(timeOutWorkAttempt(queued, "2026-08-20T10:31:00.000Z").status, "TIMED_OUT");

  const leased = acquireWorkAttemptLease(queued, {
    ownerId: "worker-a",
    fencingToken: 1,
    acquiredAt: "2026-08-20T10:01:00.000Z",
    expiresAt: "2026-08-20T10:05:00.000Z",
  });
  const running = startWorkAttempt(leased, 1, "2026-08-20T10:01:01.000Z");
  assert.equal(timeOutWorkAttempt(running, "2026-08-20T10:31:00.000Z").status, "OUTCOME_UNKNOWN");
});

test("a leased or running attempt can only be cancelled by its fenced worker", () => {
  const leased = acquireWorkAttemptLease(createWorkAttempt(draft()), {
    ownerId: "worker-a",
    fencingToken: 1,
    acquiredAt: "2026-08-20T10:01:00.000Z",
    expiresAt: "2026-08-20T10:05:00.000Z",
  });
  assert.throws(
    () => cancelWorkAttempt(leased, 2, "2026-08-20T10:02:00.000Z"),
    /WORK_ATTEMPT_FENCED/,
  );
  assert.equal(
    cancelWorkAttempt(leased, 1, "2026-08-20T10:02:00.000Z").status,
    "CANCELLED",
  );
});
