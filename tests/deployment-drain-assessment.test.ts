import assert from "node:assert/strict";
import test from "node:test";

import { assessDeploymentDrain } from "../application/assess-deployment-drain.ts";
import type { CompanyDomainEvent } from "../core/control-plane.ts";

const companyId = "company-one";

function event(id: string, type: string, payload: unknown): CompanyDomainEvent {
  return {
    id, companyId, type, payload, actorId: "operator-one",
    occurredAt: "2026-08-26T10:00:00.000Z", provenance: "PRODUCTION",
  };
}

test("deployment drain admits only fully terminal durable state", () => {
  const result = assessDeploymentDrain({
    observedAt: "2026-08-26T10:01:00.000Z",
    maintenance: { mode: "DISPATCH_FROZEN", revision: 1 },
    companies: [{
      companyId,
      eventSequence: 4,
      pendingPublicationCount: 0,
      events: [
        event("attempt-one", "work-attempt.recorded", {
          attempt: { id: "attempt-one", status: "SUCCEEDED" },
        }),
        event("lease-issued", "secret.lease-issued", {
          leaseId: "lease-one", workAttemptId: "attempt-one",
        }),
        event("lease-revoked", "secret.lease-revoked", {
          leaseId: "lease-one", workAttemptId: "attempt-one",
        }),
        event("approval-decided", "approval.publication.decided", {
          decision: { requestId: "approval-one" },
        }),
      ],
    }],
  });

  assert.equal(result.status, "DRAINED");
  assert.equal(result.restartAllowed, true);
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.snapshot, {
    companyCount: 1,
    eventCount: 4,
    eventSequenceTotal: 4,
    terminalAttemptCount: 1,
    pendingPublicationCount: 0,
    pendingApprovalCount: 0,
    issuedLeaseCount: 1,
    revokedLeaseCount: 1,
    maintenanceRevision: 1,
  });
});

test("deployment drain blocks every non-terminal Attempt and unresolved boundary", () => {
  const result = assessDeploymentDrain({
    observedAt: "2026-08-26T10:01:00.000Z",
    maintenance: { mode: "DISPATCH_FROZEN", revision: 1 },
    companies: [{
      companyId,
      eventSequence: 8,
      pendingPublicationCount: 2,
      events: [
        event("attempt-queued", "work-attempt.recorded", {
          attempt: { id: "attempt-queued", status: "QUEUED" },
        }),
        event("attempt-running", "work-attempt.recorded", {
          attempt: { id: "attempt-running", status: "RUNNING" },
        }),
        event("attempt-paused", "work-attempt.recorded", {
          attempt: { id: "attempt-paused", status: "AWAITING_APPROVAL" },
        }),
        event("attempt-unknown", "work-attempt.recorded", {
          attempt: { id: "attempt-unknown", status: "OUTCOME_UNKNOWN" },
        }),
        event("approval-requested", "approval.publication.requested", {
          request: { id: "approval-one" },
        }),
        event("lease-issued", "secret.lease-issued", {
          leaseId: "lease-one", workAttemptId: "attempt-running",
        }),
      ],
    }],
  });

  assert.equal(result.status, "NOT_DRAINED");
  assert.equal(result.restartAllowed, false);
  assert.deepEqual(result.blockers.map(({ code, count }) => [code, count]), [
    ["NON_TERMINAL_WORK_ATTEMPTS", 4],
    ["PENDING_APPROVALS", 1],
    ["PENDING_CONNECTOR_PUBLICATIONS", 2],
    ["UNREVOKED_SECRET_LEASES", 1],
  ]);
});

test("deployment drain fails closed for malformed relevant events and sequence claims", () => {
  const result = assessDeploymentDrain({
    observedAt: "2026-08-26T10:01:00.000Z",
    maintenance: { mode: "DISPATCH_FROZEN", revision: 1 },
    companies: [{
      companyId,
      eventSequence: 1,
      pendingPublicationCount: 0,
      events: [event("bad-attempt", "work-attempt.recorded", { attempt: { id: 7 } })],
    }],
  });

  assert.equal(result.status, "STATE_INVALID_REQUIRES_REVIEW");
  assert.equal(result.restartAllowed, false);
  assert.deepEqual(result.blockers, [{ code: "DRAIN_SOURCE_STATE_INVALID", count: 1 }]);
});

test("deployment drain rejects an empty but still-open dispatch window", () => {
  const result = assessDeploymentDrain({
    observedAt: "2026-08-26T10:01:00.000Z",
    maintenance: { mode: "OPEN", revision: 0 },
    companies: [],
  });

  assert.equal(result.status, "NOT_DRAINED");
  assert.equal(result.restartAllowed, false);
  assert.deepEqual(result.blockers, [{ code: "DISPATCH_NOT_FROZEN", count: 1 }]);
});
