import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import { ProcessOperationalRiskObservation } from "../application/process-operational-risk-observation.ts";
import { WorkAttemptService } from "../application/work-attempt-service.ts";
import type { AgentExecutionPort } from "../ports/agent-execution-port.ts";

async function scenario(supportsPause: boolean) {
  const events = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-risk-")));
  let sequence = 0; const nextId = () => `risk-event-${++sequence}`;
  const attempts = new WorkAttemptService(events);
  await attempts.create({ draft: { id: "attempt-one", companyId: "company-one", workId: "work-one",
    agentId: "agent-one", attemptNumber: 1, idempotencyKey: "work-one:v1",
    createdAt: "2026-09-05T08:00:00.000Z", timeoutAt: "2026-09-05T09:00:00.000Z",
    authority: { responsibilityContractId: "contract-one", responsibilityContractRevision: 1,
      accountableHumanId: "human-one", actionIds: ["export-finance"], permissionIds: [],
      dataAuthorizationIds: ["grant-finance-export"], connectorId: "connector-one",
      connectorCapabilityDigest: `sha256:${"a".repeat(64)}` } }, eventId: nextId(),
    publicationId: nextId(), actorId: "human-one", expectedEventSequence: 0 });
  let pauses = 0;
  const port: AgentExecutionPort = {
    async capabilities() { return { connectorId: "connector-one", displayName: "Runtime",
      protocolVersion: "1.0", supportsPause, supportsResume: true, supportsCancellation: true,
      supportsEvidence: true, maximumTimeoutSeconds: 3600 }; },
    async health() { return "HEALTHY"; }, async deploy() { throw new Error("unused"); },
    async submit() { throw new Error("unused"); }, async observe() { return []; },
    async pause() { pauses += 1; }, async resume() {}, async cancel() {},
  };
  const result = await new ProcessOperationalRiskObservation({ events, executionPorts: [port], nextId })
    .execute({ companyId: "company-one", attemptId: "attempt-one", trace: {
      id: "trace-one", companyId: "company-one", workId: "work-one", attemptId: "attempt-one",
      agentId: "agent-one", recordedAt: "2026-09-05T08:01:01.000Z", spans: [{ id: "span-one",
        parentSpanId: null, kind: "DATA", name: "Export finance", startedAt: "2026-09-05T08:01:00.000Z",
        endedAt: "2026-09-05T08:01:01.000Z", status: "OK", resource: { type: "DATA",
          id: "finance-export", operation: "EXPORT", authorityId: "grant-finance-export" } }],
    }, rules: [{ id: "rule-critical-export", resourceType: "DATA", resourceId: "finance-export",
      operation: "EXPORT", severity: "CRITICAL", summary: "Finance export requires containment." }] });
  return { events, result, pauses };
}

test("a critical access violation records its Access Map, pauses once and opens a contained AI Case", async () => {
  const { events, result, pauses } = await scenario(true);
  assert.equal(pauses, 1);
  assert.equal(result.alerts[0]?.containment, "PAUSE_SUCCEEDED");
  assert.equal(result.cases[0]?.status, "CONTAINED");
  assert.equal(result.cases[0]?.ownerHumanId, "human-one");
  assert.deepEqual((await events.read("company-one")).slice(-5).map(({ type }) => type), [
    "runtime-trace.recorded", "access-map.recorded", "policy-violation.recorded",
    "risk-alert.recorded", "ai-case.recorded",
  ]);
  const replay = await new ProcessOperationalRiskObservation({ events, executionPorts: [], nextId: () => "unused" })
    .execute({ companyId: "company-one", attemptId: "attempt-one", trace: result.trace, rules: [] });
  assert.equal(replay.status, "REPLAYED");
});

test("unsupported containment is visible and never calls a simulated pause", async () => {
  const { result, pauses } = await scenario(false);
  assert.equal(pauses, 0);
  assert.equal(result.alerts[0]?.containment, "UNSUPPORTED");
  assert.equal(result.cases[0]?.status, "OPEN");
});
