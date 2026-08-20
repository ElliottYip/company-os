import assert from "node:assert/strict";
import test from "node:test";

import { GetAdministrationProjection } from "../application/get-administration-projection.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";

test("formal administration projection sanitizes Connector, model, data and egress state", async () => {
  const events = new InMemoryEventStore();
  await events.append({
    id: "event-egress", companyId: "company-one", type: "data-egress.decision-recorded",
    occurredAt: "2026-08-20T18:00:00.000Z", actorId: "human-one", provenance: "PRODUCTION",
    payload: {
      id: "decision-one", companyId: "company-one", contractId: "data-contract-one",
      request: { companyId: "company-one", workId: "work-one", agentId: "agent-one", dataSourceId: "source-one", operation: "EXPORT", purpose: "report", classification: "CONFIDENTIAL", destinationId: "destination-one", contentDigest: `sha256:${"a".repeat(64)}`, requestedAt: "2026-08-20T18:00:00.000Z" },
      decision: { type: "GRANTED", contractId: "data-contract-one" }, authorizationReceiptId: "receipt-one", recordedAt: "2026-08-20T18:00:00.000Z",
    },
  }, 0);
  const projection = await new GetAdministrationProjection({
    identity: {
      async getCurrentIdentity() { return { actorId: "human-one", organizationId: "company-one", displayName: "Human", assurance: "ENTERPRISE_ASSERTED" as const }; },
      async currentPrincipal() { return { id: "human-one", kind: "HUMAN" as const, displayName: "Human" }; },
      async authorize() { return { id: "receipt-read", principalId: "human-one", authorizedAt: "2026-08-20T18:01:00.000Z" }; },
    },
    connectors: { async load() { return { revision: 2, connectors: [{
      id: "connector-one", companyId: "company-one", displayName: "Enterprise Agent",
      protocolVersion: "1.0" as const, operations: ["SUBMIT", "RESULT"] as const,
      maximumTimeoutSeconds: 600, executionResidency: "CUSTOMER_ENVIRONMENT" as const,
      secretReferenceId: "secret-connector-one", status: "ENABLED" as const,
    }] }; }, async replace() { throw new Error("unused"); } },
    governance: { async load() { return {
      revision: 3, companyId: "company-one",
      modelRoutingPolicies: [{ id: "model-policy-one", companyId: "company-one", routes: [{
        id: "route-one", providerAdapterId: "provider-one", modelReference: "model-one",
        credentialReference: "secret-model-one", allowedDataClassifications: ["PUBLIC"],
        residency: "LOCAL" as const, enabled: true,
      }] }],
      dataAuthorizationContracts: [{
        id: "data-contract-one", companyId: "company-one", dataSourceId: "source-one",
        authorizedAgentIds: ["agent-one"], authorizedOperations: ["EXPORT" as const],
        allowedPurposes: ["report"], maximumClassification: "CONFIDENTIAL" as const,
        allowedExportDestinations: ["destination-one"], validFrom: "2026-08-20T00:00:00.000Z",
        validUntil: "2026-08-21T00:00:00.000Z", status: "ACTIVE" as const,
      }],
    }; }, async replace() { throw new Error("unused"); } },
    events,
  }).execute("company-one");

  assert.equal(projection.connectorCatalog.connectors[0]?.secretConfigured, true);
  assert.equal(projection.governance.modelRoutingPolicies[0]?.routes[0]?.credentialConfigured, true);
  assert.equal(projection.egressDecisions[0]?.decision.type, "GRANTED");
  assert.doesNotMatch(JSON.stringify(projection), /secret-connector-one|secret-model-one/);
});
