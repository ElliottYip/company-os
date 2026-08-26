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
    retentionPolicyId: "standard-retention",
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
    toolAccess: { async load() { return { companyId: "company-one", revision: 1,
      profiles: [], entries: [], bindings: [], policies: [] }; }, async replace() { throw new Error("unused"); } },
    usageBudget: { async load() { return { companyId: "company-one", revision: 1,
      costEvents: [{ id: "cost-one", companyId: "company-one", agentId: "agent-one", workId: "work-one",
        projectId: null, goalId: null, usageReference: "usage-one", sourceDigest: `sha256:${"b".repeat(64)}`,
        provider: "provider-one", biller: "provider-one", billingType: "metered_api" as const,
        costStatus: "reported" as const, model: "model-one", inputTokens: 10, cachedInputTokens: 0,
        outputTokens: 5, costCents: 25, occurredAt: "2026-08-20T18:00:00.000Z", recordedAt: "2026-08-20T18:00:00.000Z" }],
      policies: [{ id: "budget-one", companyId: "company-one", scopeType: "company" as const,
        scopeId: "company-one", metric: "billed_cents" as const, windowKind: "calendar_month_utc" as const,
        amount: 100, warnPercent: 80, hardStopEnabled: true, notifyEnabled: true, isActive: true,
        updatedAt: "2026-08-20T18:00:00.000Z" }] }; }, async replace() { throw new Error("unused"); } },
    events,
    secretBroker: {
      async capabilities() { return { brokerId: "enterprise-vault", displayName: "Enterprise Vault",
        protocolVersion: "1.0", supportedPurposes: ["MODEL_PROVIDER" as const], maximumLeaseSeconds: 600 }; },
      async health() { return "DEGRADED" as const; },
      async describe() { return null; },
      async issueLease() { return { ok: false as const, error: { code: "UNAVAILABLE", retryable: true } }; },
      async revokeLease() {},
    },
    modelProviders: [{
      async capabilities() { return { providerAdapterId: "provider-one", displayName: "Provider One",
        protocolVersion: "1.0", modelReferences: ["model-one"], supportedResidencies: ["LOCAL" as const] }; },
      async health() { return "HEALTHY" as const; },
    }],
    executionPorts: [{
      async capabilities() { return {
        connectorId: "connector-one", displayName: "Enterprise Agent", protocolVersion: "1.0",
        supportsPause: true, supportsResume: true, supportsCancellation: true,
        supportsEvidence: true, maximumTimeoutSeconds: 600,
      }; },
      async health() { return "DEGRADED" as const; },
      async deploy(agent) { return { id: "deployment-one", agentId: agent.id, connectorId: "connector-one" }; },
      async submit() { return { accepted: true as const, executionId: "execution-one" }; },
      async observe() { return []; }, async pause() {}, async resume() {}, async cancel() {},
    }, {
      async capabilities() { return {
        connectorId: "connector-two", displayName: "Installed Runtime", protocolVersion: "1.0",
        supportsPause: false, supportsResume: false, supportsCancellation: true,
        supportsEvidence: true, maximumTimeoutSeconds: 300,
      }; },
      async health(): Promise<"HEALTHY"> { throw new Error("probe failed"); },
      async deploy(agent) { return { id: "deployment-two", agentId: agent.id, connectorId: "connector-two" }; },
      async submit() { return { accepted: true as const, executionId: "execution-two" }; },
      async observe() { return []; }, async pause() {}, async resume() {}, async cancel() {},
    }],
  }).execute("company-one");

  assert.equal(projection.connectorCatalog.connectors[0]?.secretConfigured, true);
  assert.equal(projection.retentionPolicyId, "standard-retention");
  assert.equal(projection.connectorCatalog.connectors[0]?.runtimeHealth, "DEGRADED");
  assert.deepEqual(projection.runtimeConnectors, [{
    connectorId: "connector-one", displayName: "Enterprise Agent", protocolVersion: "1.0",
    supportsPause: true, supportsResume: true, supportsCancellation: true,
    supportsEvidence: true, maximumTimeoutSeconds: 600, health: "DEGRADED", registered: true,
  }, {
    connectorId: "connector-two", displayName: "Installed Runtime", protocolVersion: "1.0",
    supportsPause: false, supportsResume: false, supportsCancellation: true,
    supportsEvidence: true, maximumTimeoutSeconds: 300, health: "UNAVAILABLE", registered: false,
  }]);
  assert.equal(projection.governance.modelRoutingPolicies[0]?.routes[0]?.credentialConfigured, true);
  assert.deepEqual(projection.secretBrokerRuntime, {
    brokerId: "enterprise-vault", displayName: "Enterprise Vault", protocolVersion: "1.0",
    supportedPurposes: ["MODEL_PROVIDER"], maximumLeaseSeconds: 600, health: "DEGRADED",
    managementSupported: false,
  });
  assert.deepEqual(projection.runtimeModelProviders, [{
    providerAdapterId: "provider-one", displayName: "Provider One", protocolVersion: "1.0",
    modelReferences: ["model-one"], supportedResidencies: ["LOCAL"], health: "HEALTHY",
  }]);
  assert.equal(projection.egressDecisions[0]?.decision.type, "GRANTED");
  assert.equal(projection.toolAccess.revision, 1);
  assert.equal(projection.usageBudget.totalReportedCostCents, 25);
  assert.equal(projection.usageBudget.policySummaries[0]?.status, "ok");
  assert.doesNotMatch(JSON.stringify(projection), /secret-connector-one|secret-model-one/);
});
