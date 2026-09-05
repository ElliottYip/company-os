import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import { DeliverConnectorCommands } from "../application/deliver-connector-commands.ts";
import { GetOperationalRiskProjection } from "../application/get-operational-risk-projection.ts";
import { ManageAiCase } from "../application/manage-ai-case.ts";
import type { AgentExecutionPort } from "../ports/agent-execution-port.ts";

test("AI Case recovery is authorized, durably delivered, confirmed, and only then closable", async () => {
  const events = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-case-")));
  let id = 0; const nextId = () => `case-event-${++id}`;
  const append = async (type: string, payload: unknown) => events.append({ id: nextId(), companyId: "company-one",
    type, payload, actorId: "connector-one", occurredAt: "2026-09-05T09:00:00.000Z", provenance: "PRODUCTION" });
  await append("work-attempt.recorded", { attempt: { id: "attempt-one", companyId: "company-one",
    workId: "work-one", agentId: "agent-one",
    idempotencyKey: "work-one:v1", authority: { connectorId: "connector-one",
      connectorCapabilityDigest: `sha256:${"a".repeat(64)}` } } });
  const alert = { id: "alert-one", companyId: "company-one", violationId: "violation-one",
    severity: "CRITICAL" as const, status: "CONTAINED" as const, containment: "PAUSE_SUCCEEDED" as const,
    openedAt: "2026-09-05T08:00:00.000Z", resolvedAt: null };
  const originalCase = { id: "case-one", companyId: "company-one", alertIds: ["alert-one"], workId: "work-one",
    agentId: "agent-one", accountableHumanId: "human-one", ownerHumanId: "human-one", status: "CONTAINED" as const,
    revision: 0, containment: "PAUSE_SUCCEEDED" as const, summary: "Critical export", rootCause: null,
    remediation: null, prevention: null, openedAt: "2026-09-05T08:00:00.000Z",
    updatedAt: "2026-09-05T08:00:00.000Z", closedAt: null };
  await append("operational-risk.assessed", { trace: { id: "trace-one", companyId: "company-one",
    workId: "work-one", attemptId: "attempt-one", agentId: "agent-one", spans: [{ id: "span-one",
      parentSpanId: null, kind: "DATA", name: "Export", startedAt: "2026-09-05T08:00:00.000Z",
      endedAt: "2026-09-05T08:00:01.000Z", status: "OK", resource: null }],
    recordedAt: "2026-09-05T08:00:01.000Z" }, accessEdges: [], violations: [], alerts: [alert], cases: [originalCase] });
  let resumes = 0;
  const port: AgentExecutionPort = { async capabilities() { return { connectorId: "connector-one",
    displayName: "Runtime", protocolVersion: "1.0", supportsPause: true, supportsResume: true,
    supportsCancellation: true, supportsEvidence: true, maximumTimeoutSeconds: 3600 }; },
    async health() { return "HEALTHY"; }, async deploy() { throw new Error("unused"); },
    async submit() { throw new Error("unused"); }, async observe() { return []; }, async pause() {},
    async resume(workId, reference) { assert.equal(workId, "work-one"); assert.equal(reference, "case-one"); resumes += 1; },
    async cancel() {} };
  const identity = { async getCurrentIdentity() { return { actorId: "human-one", organizationId: "company-one",
    displayName: "Human One", assurance: "ENTERPRISE_ASSERTED" as const }; }, async currentPrincipal() { return null; },
    async authorize() { return { id: nextId(), principalId: "human-one", authorizedAt: "2026-09-05T09:00:00.000Z" }; } };
  const service = new ManageAiCase({ identity, events, executionPorts: [port],
    now: () => "2026-09-05T09:00:00.000Z", nextId });
  await service.execute({ companyId: "company-one", caseId: "case-one", operation: "START_INVESTIGATION",
    expectedRevision: 0, reason: "Inspect the access path" });
  await service.execute({ companyId: "company-one", caseId: "case-one", operation: "START_REMEDIATION",
    expectedRevision: 1, reason: "Narrow the grant", rootCause: "Grant too broad" });
  await service.execute({ companyId: "company-one", caseId: "case-one", operation: "REQUEST_REVIEW",
    expectedRevision: 2, reason: "Ready for review", remediation: "Restricted grant",
    prevention: "Require two-person export review" });
  const requested = await service.execute({ companyId: "company-one", caseId: "case-one", operation: "RECOVER",
    expectedRevision: 3, reason: "Review passed" });
  assert.equal(requested.status, "RECOVERY_REQUESTED");
  assert.equal(resumes, 0);
  const delivery = new DeliverConnectorCommands({ store: events, structure: { async load() { return null; } },
    executionPorts: [port], runtimeSecurity: { async digestCapabilities() { return `sha256:${"a".repeat(64)}`; },
      async issueRuntimeProof() { throw new Error("unused"); } },
    now: () => "2026-09-05T09:01:00.000Z", nextId });
  assert.equal((await delivery.execute("company-one"))[0]?.status, "DELIVERED");
  assert.equal(resumes, 1);
  let projection = await new GetOperationalRiskProjection({ identity, events }).execute("company-one");
  assert.equal(projection.cases[0]?.status, "RECOVERED");
  assert.equal(projection.alerts[0]?.status, "RESOLVED");
  await service.execute({ companyId: "company-one", caseId: "case-one", operation: "CLOSE",
    expectedRevision: 5, reason: "Monitoring stable" });
  projection = await new GetOperationalRiskProjection({ identity, events }).execute("company-one");
  assert.equal(projection.cases[0]?.status, "CLOSED");
});
