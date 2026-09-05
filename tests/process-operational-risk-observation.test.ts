import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import { ProcessOperationalRiskObservation } from "../application/process-operational-risk-observation.ts";
import { DeliverConnectorCommands } from "../application/deliver-connector-commands.ts";
import { GetOperationalRiskProjection } from "../application/get-operational-risk-projection.ts";
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
  const initialPublication = (await events.readPendingPublications("company-one", { afterSequence: 0, limit: 10 }))[0]!;
  await events.markPublicationDelivered("company-one", initialPublication.id, "2026-09-05T08:00:00.500Z");
  const deliveryStats = { pauses: 0, pauseReasons: [] as string[] };
  const port: AgentExecutionPort = {
    async capabilities() { return { connectorId: "connector-one", displayName: "Runtime",
      protocolVersion: "1.0", supportsPause, supportsResume: true, supportsCancellation: true,
      supportsEvidence: true, maximumTimeoutSeconds: 3600 }; },
    async health() { return "HEALTHY"; }, async deploy() { throw new Error("unused"); },
    async submit() { throw new Error("unused"); }, async observe() { return []; },
    async pause(_workId, reason) { deliveryStats.pauses += 1; deliveryStats.pauseReasons.push(reason); }, async resume() {}, async cancel() {},
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
  return { events, result, deliveryStats, port, nextId };
}

test("a critical access violation atomically records its Access Map and queues one durable pause", async () => {
  const { events, result, deliveryStats, port, nextId } = await scenario(true);
  assert.equal(deliveryStats.pauses, 0);
  assert.equal(result.alerts[0]?.containment, "PAUSE_REQUESTED");
  assert.equal(result.cases[0]?.status, "OPEN");
  assert.equal(result.cases[0]?.ownerHumanId, "human-one");
  assert.equal((await events.read("company-one", { types: ["operational-risk.assessed"] })).length, 1);
  const pending = (await events.readPendingPublications("company-one", { afterSequence: 0, limit: 10 }))
    .filter(({ payload }) => (payload as { operation?: string }).operation === "PAUSE");
  assert.equal(pending.length, 1);
  assert.deepEqual(pending[0]?.payload, { schemaVersion: 1, operation: "PAUSE",
    attemptId: "attempt-one", workId: "work-one", agentId: "agent-one", connectorId: "connector-one",
    idempotencyKey: "work-one:v1", approvalRequestId: result.cases[0]?.id, controlReason: "RISK" });
  const delivery = new DeliverConnectorCommands({ store: events,
    structure: { async load() { return null; } }, executionPorts: [port],
    runtimeSecurity: { async digestCapabilities() { return `sha256:${"a".repeat(64)}`; },
      async issueRuntimeProof() { throw new Error("unused"); } },
    now: () => "2026-09-05T08:01:02.000Z", nextId });
  assert.equal((await delivery.execute("company-one"))[0]?.status, "DELIVERED");
  assert.equal(deliveryStats.pauses, 1);
  assert.deepEqual(deliveryStats.pauseReasons, [`risk:${result.cases[0]?.id}`]);
  assert.equal((await events.read("company-one", { types: ["risk-containment.delivered"] })).length, 1);
  const projection = await new GetOperationalRiskProjection({ events, identity: {
    async getCurrentIdentity() { return { actorId: "human-one", organizationId: "company-one",
      displayName: "Human One", assurance: "ENTERPRISE_ASSERTED" }; }, async currentPrincipal() { return null; },
    async authorize() { return { id: "receipt-one", principalId: "human-one",
      authorizedAt: "2026-09-05T08:01:03.000Z" }; },
  } }).execute("company-one");
  assert.equal(projection.cases[0]?.status, "CONTAINED");
  assert.equal(projection.alerts[0]?.containment, "PAUSE_SUCCEEDED");
  assert.equal(projection.accessEdges[0]?.authorityId, "grant-finance-export");
  assert.equal((await delivery.execute("company-one")).length, 0);
  assert.equal(deliveryStats.pauses, 1);
  const replay = await new ProcessOperationalRiskObservation({ events, executionPorts: [], nextId: () => "unused" })
    .execute({ companyId: "company-one", attemptId: "attempt-one", trace: result.trace, rules: [] });
  assert.equal(replay.status, "REPLAYED");
});

test("unsupported containment is visible and never calls a simulated pause", async () => {
  const { result, deliveryStats } = await scenario(false);
  assert.equal(deliveryStats.pauses, 0);
  assert.equal(result.alerts[0]?.containment, "UNSUPPORTED");
  assert.equal(result.cases[0]?.status, "OPEN");
});
