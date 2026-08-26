import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { EventBackedConnectorCatalogStore } from "../adapters/storage/event-backed-connector-catalog-store.ts";
import { ManageConnectorRuntimeRegistration } from "../application/manage-connector-runtime-registration.ts";
import type { AgentExecutionPort } from "../ports/agent-execution-port.ts";

function harness() {
  const events = new InMemoryEventStore();
  let id = 0;
  const store = new EventBackedConnectorCatalogStore(events, () => `connector-event-${++id}`);
  const execution: AgentExecutionPort = {
    async capabilities() { return { connectorId: "connector-one", displayName: "Enterprise Runtime",
      protocolVersion: "1.0", supportsPause: true, supportsResume: true,
      supportsCancellation: true, supportsEvidence: true, maximumTimeoutSeconds: 900 }; },
    async health() { return "HEALTHY"; }, async deploy() { throw new Error("unused"); },
    async submit() { throw new Error("unused"); }, async observe() { return []; },
    async pause() {}, async resume() {}, async cancel() {},
  };
  const identity = { async getCurrentIdentity() { return { actorId: "human-one", organizationId: "company-one",
    displayName: "Human", assurance: "ENTERPRISE_ASSERTED" as const }; }, async currentPrincipal() { return null; },
    async authorize() { return { id: `receipt-${++id}`, principalId: "human-one",
      authorizedAt: "2026-08-24T12:00:00.000Z" }; } };
  return { events, store, service: new ManageConnectorRuntimeRegistration({ identity, store,
    executionPorts: [execution], now: () => "2026-08-24T12:00:00.000Z" }) };
}

test("installed runtime registration derives capabilities server-side and starts enabled", async () => {
  const { service, store } = harness();
  const registered = await service.register({ companyId: "company-one", connectorId: "connector-one",
    executionResidency: "CUSTOMER_ENVIRONMENT", expectedRevision: 0 });
  assert.deepEqual(registered.connectors[0], {
    id: "connector-one", companyId: "company-one", displayName: "Enterprise Runtime",
    protocolVersion: "1.0", operations: ["SUBMIT", "PROGRESS", "RESULT", "PAUSE", "RESUME", "CANCEL", "EVIDENCE"],
    maximumTimeoutSeconds: 900, executionResidency: "CUSTOMER_ENVIRONMENT",
    secretReferenceId: null, status: "ENABLED",
  });
  const disabled = await service.setStatus({ companyId: "company-one", connectorId: "connector-one",
    status: "DISABLED", expectedRevision: 1 });
  assert.equal(disabled.connectors[0]?.status, "DISABLED");
  assert.deepEqual(await service.setStatus({ companyId: "company-one", connectorId: "connector-one",
    status: "DISABLED", expectedRevision: 2 }), disabled);
  assert.equal((await store.load("company-one")).revision, 2);
});

test("runtime registration fails closed for missing runtime, duplicate ID, and stale revision", async () => {
  const { service } = harness();
  await assert.rejects(service.register({ companyId: "company-one", connectorId: "missing",
    executionResidency: "CUSTOMER_ENVIRONMENT", expectedRevision: 0 }), /AGENT_EXECUTION_PORT_NOT_REGISTERED/);
  await service.register({ companyId: "company-one", connectorId: "connector-one",
    executionResidency: "CUSTOMER_ENVIRONMENT", expectedRevision: 0 });
  await assert.rejects(service.register({ companyId: "company-one", connectorId: "connector-one",
    executionResidency: "CUSTOMER_ENVIRONMENT", expectedRevision: 1 }), /CONNECTOR_ALREADY_REGISTERED/);
  await assert.rejects(service.setStatus({ companyId: "company-one", connectorId: "connector-one",
    status: "DISABLED", expectedRevision: 0 }), /CONNECTOR_CATALOG_REVISION_CONFLICT/);
});
