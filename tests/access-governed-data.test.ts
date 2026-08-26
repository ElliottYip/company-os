import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { AccessGovernedData } from "../application/access-governed-data.ts";

const now = "2026-08-25T12:00:00.000Z";
const request = {
  companyId: "company-one", workId: "work-one", agentId: "agent-one", dataSourceId: "warehouse-one",
  operation: "EXPORT" as const, purpose: "board-report", classification: "CONFIDENTIAL" as const,
  destinationId: "board-portal", contentDigest: `sha256:${"a".repeat(64)}`, requestedAt: now,
};

async function fixture() {
  const events = new InMemoryEventStore();
  await events.append({
    id: "work-event", companyId: "company-one", type: "work.dispatched", occurredAt: now,
    actorId: "human-one", provenance: "PRODUCTION", payload: { work: {
      id: "work-one", companyId: "company-one", title: "Prepare board report", goal: "Board report",
      scope: "AGENT", departmentId: "operations", projectId: null, agentId: "agent-one",
      requestedBy: "human-one", actionIds: ["export"], parentWorkId: null,
      accountableHumanId: "human-one", responsibilityContractId: "contract-one",
      runtimeConnectorId: "agent-connector", status: "PENDING",
    } },
  });
  let calls = 0;
  const connector = {
    async capabilities() { return { connectorId: "data-node", displayName: "Warehouse node",
      protocolVersion: "1.0" as const, dataSourceIds: ["warehouse-one"], supportedOperations: ["READ", "EXPORT"] as const }; },
    async health() { return "HEALTHY" as const; },
    async access(input: { requestId: string }) { calls += 1; assert.equal(input.requestId, "request-one"); return {
      type: "GRANTED" as const, dataReference: "export-one", evidenceReference: "evidence-one",
      contentDigest: request.contentDigest,
    }; },
  };
  let id = 0;
  const service = new AccessGovernedData({
    identity: {
      async getCurrentIdentity() { return { actorId: "human-one", organizationId: "company-one",
        displayName: "Human One", assurance: "ENTERPRISE_ASSERTED" as const }; },
      async currentPrincipal() { return null; },
      async authorize() { return { id: "receipt-one", principalId: "human-one", authorizedAt: now }; },
    },
    governance: { async load() { return { companyId: "company-one", revision: 1,
      modelRoutingPolicies: [], dataAuthorizationContracts: [{
        id: "data-contract-one", companyId: "company-one", dataSourceId: "warehouse-one",
        authorizedAgentIds: ["agent-one"], authorizedOperations: ["EXPORT" as const],
        allowedPurposes: ["board-report"], maximumClassification: "CONFIDENTIAL" as const,
        allowedExportDestinations: ["board-portal"], validFrom: "2026-08-25T00:00:00.000Z",
        validUntil: "2026-08-26T00:00:00.000Z", status: "ACTIVE" as const,
      }] }; }, async replace() { throw new Error("unused"); } },
    events, connectors: [connector], now: () => now, nextId: () => `data-event-${++id}`,
  });
  return { events, service, calls: () => calls };
}

test("governed export calls one healthy Data Connector after policy and records references only", async () => {
  const { service, events, calls } = await fixture();
  const first = await service.execute({ requestId: "request-one", contractId: "data-contract-one", request });
  assert.equal(first.decision.type, "GRANTED");
  assert.equal(first.result?.type, "GRANTED");
  assert.equal(calls(), 1);
  const replay = await service.execute({ requestId: "request-one", contractId: "data-contract-one", request });
  assert.deepEqual(replay, first);
  assert.equal(calls(), 1);
  const stored = JSON.stringify(await events.read("company-one"));
  assert.doesNotMatch(stored, /recordContent|credential|privateReasoning|externalSession/);
});

test("default-deny policy never invokes the Data Connector", async () => {
  const { service, calls } = await fixture();
  const outcome = await service.execute({ requestId: "request-two", contractId: "data-contract-one",
    request: { ...request, destinationId: "unapproved-destination" } });
  assert.deepEqual(outcome.decision, { type: "DENIED", policyCode: "EXPORT_DESTINATION_NOT_AUTHORIZED" });
  assert.equal(outcome.result, null);
  assert.equal(calls(), 0);
});

test("data access binds the Agent to the durable Work before authorization", async () => {
  const { service, calls } = await fixture();
  await assert.rejects(() => service.execute({ requestId: "request-three", contractId: "data-contract-one",
    request: { ...request, agentId: "agent-two" } }), /DATA_ACCESS_AGENT_WORK_MISMATCH/);
  assert.equal(calls(), 0);
});
