import type { WorkAttemptStatus } from "../core/work-attempt.ts";
import type { InstanceMaintenanceState } from "../core/instance-maintenance.ts";
import type { DeploymentDrainCompanySource } from "../ports/deployment-drain-state-port.ts";

const ATTEMPT_STATUSES = new Set<WorkAttemptStatus>([
  "QUEUED", "LEASED", "RUNNING", "AWAITING_APPROVAL", "CANCELLATION_REQUESTED",
  "SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT", "OUTCOME_UNKNOWN",
]);
const TERMINAL_ATTEMPT_STATUSES = new Set<WorkAttemptStatus>([
  "SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT",
]);

export interface DeploymentDrainCompanyState extends DeploymentDrainCompanySource {}

export interface DeploymentDrainInput {
  readonly observedAt: string;
  readonly maintenance: Pick<InstanceMaintenanceState, "mode" | "revision">;
  readonly companies: readonly DeploymentDrainCompanyState[];
}

export interface DeploymentDrainBlocker {
  readonly code:
    | "DRAIN_SOURCE_STATE_INVALID"
    | "DISPATCH_NOT_FROZEN"
    | "NON_TERMINAL_WORK_ATTEMPTS"
    | "PENDING_APPROVALS"
    | "PENDING_CONNECTOR_PUBLICATIONS"
    | "UNREVOKED_SECRET_LEASES";
  readonly count: number;
}

export interface DeploymentDrainAssessment {
  readonly schemaVersion: 1;
  readonly status: "DRAINED" | "NOT_DRAINED" | "STATE_INVALID_REQUIRES_REVIEW";
  readonly restartAllowed: boolean;
  readonly observedAt: string;
  readonly blockers: readonly DeploymentDrainBlocker[];
  readonly snapshot: {
    readonly companyCount: number;
    readonly eventCount: number;
    readonly eventSequenceTotal: number;
    readonly terminalAttemptCount: number;
    readonly pendingPublicationCount: number;
    readonly pendingApprovalCount: number;
    readonly issuedLeaseCount: number;
    readonly revokedLeaseCount: number;
    readonly maintenanceRevision: number;
  };
}

/**
 * Evaluates whether a planned deployment restart can begin without abandoning
 * accountable work or execution-edge authority. It is intentionally stricter
 * than crash recovery: every non-terminal Attempt blocks a planned restart.
 */
export function assessDeploymentDrain(input: DeploymentDrainInput): DeploymentDrainAssessment {
  const attempts = new Map<string, WorkAttemptStatus>();
  const approvalRequests = new Set<string>();
  const approvalDecisions = new Set<string>();
  const issuedLeases = new Set<string>();
  const revokedLeases = new Set<string>();
  const companyIds = new Set<string>();
  let invalidCount = Number.isFinite(Date.parse(input.observedAt)) ? 0 : 1;
  if (!Number.isSafeInteger(input.maintenance.revision) || input.maintenance.revision < 0 ||
      !["OPEN", "DISPATCH_FROZEN"].includes(input.maintenance.mode)) invalidCount += 1;
  let eventCount = 0;
  let eventSequenceTotal = 0;
  let pendingPublicationCount = 0;

  for (const company of input.companies) {
    eventCount += company.events.length;
    if (companyIds.has(company.companyId) || !portableId(company.companyId) ||
        !Number.isSafeInteger(company.eventSequence) || company.eventSequence < company.events.length ||
        !Number.isSafeInteger(company.pendingPublicationCount) || company.pendingPublicationCount < 0) {
      invalidCount += 1;
      continue;
    }
    companyIds.add(company.companyId);
    eventSequenceTotal += company.eventSequence;
    pendingPublicationCount += company.pendingPublicationCount;
    for (const event of company.events) {
      if (event.companyId !== company.companyId) { invalidCount += 1; continue; }
      const payload = record(event.payload);
      if (!payload) { invalidCount += 1; continue; }
      if (event.type === "work-attempt.recorded") {
        const attempt = record(payload.attempt);
        if (!attempt || !portableId(attempt.id) || typeof attempt.status !== "string" ||
            !ATTEMPT_STATUSES.has(attempt.status as WorkAttemptStatus)) invalidCount += 1;
        else attempts.set(`${company.companyId}:${attempt.id}`, attempt.status as WorkAttemptStatus);
      } else if (event.type === "approval.publication.requested") {
        const request = record(payload.request);
        if (!request || !portableId(request.id)) invalidCount += 1;
        else approvalRequests.add(`${company.companyId}:${request.id}`);
      } else if (event.type === "approval.publication.decided") {
        const decision = record(payload.decision);
        if (!decision || !portableId(decision.requestId)) invalidCount += 1;
        else approvalDecisions.add(`${company.companyId}:${decision.requestId}`);
      } else if (event.type === "secret.lease-issued") {
        if (!portableId(payload.leaseId) || !portableId(payload.workAttemptId)) invalidCount += 1;
        else issuedLeases.add(`${company.companyId}:${payload.leaseId}`);
      } else if (event.type === "secret.lease-revoked") {
        if (!portableId(payload.leaseId) || !portableId(payload.workAttemptId)) invalidCount += 1;
        else revokedLeases.add(`${company.companyId}:${payload.leaseId}`);
      }
    }
  }

  const pendingApprovalCount = [...approvalRequests].filter((id) => !approvalDecisions.has(id)).length;
  const unrevokedLeaseCount = [...issuedLeases].filter((id) => !revokedLeases.has(id)).length;
  const terminalAttemptCount = [...attempts.values()].filter((status) =>
    TERMINAL_ATTEMPT_STATUSES.has(status)).length;
  const nonTerminalAttemptCount = attempts.size - terminalAttemptCount;
  const snapshot = {
    companyCount: companyIds.size, eventCount, eventSequenceTotal, terminalAttemptCount,
    pendingPublicationCount, pendingApprovalCount,
    issuedLeaseCount: issuedLeases.size,
    revokedLeaseCount: [...revokedLeases].filter((id) => issuedLeases.has(id)).length,
    maintenanceRevision: input.maintenance.revision,
  };
  if (invalidCount > 0) return {
    schemaVersion: 1, status: "STATE_INVALID_REQUIRES_REVIEW", restartAllowed: false,
    observedAt: input.observedAt,
    blockers: [{ code: "DRAIN_SOURCE_STATE_INVALID", count: invalidCount }], snapshot,
  };
  const blockers: DeploymentDrainBlocker[] = [];
  if (input.maintenance.mode !== "DISPATCH_FROZEN") {
    blockers.push({ code: "DISPATCH_NOT_FROZEN", count: 1 });
  }
  if (nonTerminalAttemptCount) blockers.push({ code: "NON_TERMINAL_WORK_ATTEMPTS", count: nonTerminalAttemptCount });
  if (pendingApprovalCount) blockers.push({ code: "PENDING_APPROVALS", count: pendingApprovalCount });
  if (pendingPublicationCount) blockers.push({ code: "PENDING_CONNECTOR_PUBLICATIONS", count: pendingPublicationCount });
  if (unrevokedLeaseCount) blockers.push({ code: "UNREVOKED_SECRET_LEASES", count: unrevokedLeaseCount });
  return {
    schemaVersion: 1, status: blockers.length ? "NOT_DRAINED" : "DRAINED",
    restartAllowed: blockers.length === 0, observedAt: input.observedAt, blockers, snapshot,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function portableId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,127}$/.test(value);
}
