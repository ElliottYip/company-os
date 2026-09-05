import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateOperationalRisk,
  transitionAiCase,
  validateRuntimeTrace,
} from "../core/operational-risk.ts";

const trace = {
  id: "trace-one", companyId: "company-one", workId: "work-one", attemptId: "attempt-one",
  agentId: "agent-one", recordedAt: "2026-09-05T08:00:02.000Z",
  spans: [{ id: "span-root", parentSpanId: null, kind: "WORKFLOW" as const, name: "Run workflow",
    startedAt: "2026-09-05T08:00:00.000Z", endedAt: "2026-09-05T08:00:02.000Z", status: "OK" as const,
    resource: null }, { id: "span-data", parentSpanId: "span-root", kind: "DATA" as const,
    name: "Read finance export", startedAt: "2026-09-05T08:00:00.500Z",
    endedAt: "2026-09-05T08:00:01.000Z", status: "OK" as const,
    resource: { type: "DATA" as const, id: "finance-export", operation: "EXPORT",
      authorityId: "grant-finance-export" } }],
};

test("runtime traces admit bounded metadata and derive explainable access paths", () => {
  const admitted = validateRuntimeTrace(trace);
  const result = evaluateOperationalRisk(admitted, [{ id: "rule-no-finance-export", resourceType: "DATA",
    resourceId: "finance-export", operation: "EXPORT", severity: "CRITICAL",
    summary: "Finance exports require incident review." }], () => "risk-one");
  assert.deepEqual(result.accessEdges, [{ id: "risk-one", companyId: "company-one", traceId: "trace-one",
    spanId: "span-data", subjectAgentId: "agent-one", resourceType: "DATA",
    resourceId: "finance-export", operation: "EXPORT", authorityId: "grant-finance-export" }]);
  assert.equal(result.violations[0]?.ruleId, "rule-no-finance-export");
  assert.deepEqual(result.violations[0]?.accessEdgeIds, ["risk-one"]);
});

test("runtime traces reject private payload-shaped fields and broken span trees", () => {
  assert.throws(() => validateRuntimeTrace({ ...trace, spans: [{ ...trace.spans[0],
    resource: { type: "TOOL", id: "shell", operation: "EXECUTE", authorityId: "tool-policy",
      rawInput: "secret" } }] } as never), /RUNTIME_TRACE_RESOURCE_INVALID/);
  assert.throws(() => validateRuntimeTrace({ ...trace, spans: [{ ...trace.spans[0],
    parentSpanId: "missing" }] }), /RUNTIME_TRACE_PARENT_INVALID/);
});

test("AI Case lifecycle requires ordered review and can reopen without erasing history", () => {
  const base = { id: "case-one", companyId: "company-one", alertIds: ["alert-one"],
    workId: "work-one", agentId: "agent-one", accountableHumanId: "human-one",
    ownerHumanId: "human-one", status: "OPEN" as const, revision: 0,
    containment: "PAUSE_SUCCEEDED" as const, summary: "Critical data export",
    rootCause: null, remediation: null, prevention: null,
    openedAt: "2026-09-05T08:00:02.000Z", updatedAt: "2026-09-05T08:00:02.000Z",
    closedAt: null };
  const contained = transitionAiCase(base, { operation: "CONFIRM_CONTAINMENT", expectedRevision: 0,
    actorId: "human-one", reason: "Pause confirmed", occurredAt: "2026-09-05T08:01:00.000Z" });
  const investigating = transitionAiCase(contained, { operation: "START_INVESTIGATION", expectedRevision: 1,
    actorId: "human-one", reason: "Inspect grant", occurredAt: "2026-09-05T08:02:00.000Z" });
  const remediating = transitionAiCase(investigating, { operation: "START_REMEDIATION", expectedRevision: 2,
    actorId: "human-one", reason: "Narrow grant", rootCause: "Grant scope was too broad",
    occurredAt: "2026-09-05T08:03:00.000Z" });
  const review = transitionAiCase(remediating, { operation: "REQUEST_REVIEW", expectedRevision: 3,
    actorId: "human-one", reason: "Policy corrected", remediation: "Restricted the export grant",
    prevention: "Require two-person export review", occurredAt: "2026-09-05T08:04:00.000Z" });
  const recoveryRequested = transitionAiCase(review, { operation: "RECOVER", expectedRevision: 4,
    actorId: "human-one", reason: "Review passed", occurredAt: "2026-09-05T08:05:00.000Z" });
  assert.equal(recoveryRequested.status, "RECOVERY_REQUESTED");
  const recovered = { ...recoveryRequested, status: "RECOVERED" as const, revision: 6,
    updatedAt: "2026-09-05T08:05:30.000Z" };
  const closed = transitionAiCase(recovered, { operation: "CLOSE", expectedRevision: 6,
    actorId: "human-one", reason: "Monitoring stable", occurredAt: "2026-09-05T08:06:00.000Z" });
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.closedAt, "2026-09-05T08:06:00.000Z");
  assert.equal(transitionAiCase(closed, { operation: "REOPEN", expectedRevision: 7,
    actorId: "human-one", reason: "Regression detected", occurredAt: "2026-09-05T08:07:00.000Z" }).status, "OPEN");
});
