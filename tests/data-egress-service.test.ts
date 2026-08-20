import assert from "node:assert/strict";
import test from "node:test";

import { EvaluateDataEgress } from "../application/evaluate-data-egress.ts";
import { EventBackedGovernanceCatalogStore } from "../adapters/storage/event-backed-governance-catalog-store.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

const identity: IdentityPort = {
  async getCurrentIdentity() { return { actorId: "human-one", organizationId: "company-one", displayName: "Human", assurance: "ENTERPRISE_ASSERTED" }; },
  async currentPrincipal() { return { id: "human-one", kind: "HUMAN", displayName: "Human" }; },
  async authorize() { return { id: "receipt-one", principalId: "human-one", authorizedAt: "2026-08-20T18:00:00.000Z" }; },
};

test("every default-deny egress decision is persisted without content or credentials", async () => {
  const events = new InMemoryEventStore();
  let id = 0;
  const governance = new EventBackedGovernanceCatalogStore(events, () => `governance-event-${++id}`);
  await governance.replace({
    companyId: "company-one", actorId: "human-one", expectedRevision: 0,
    recordedAt: "2026-08-20T17:59:00.000Z", modelRoutingPolicies: [],
    dataAuthorizationContracts: [{
      id: "contract-one", companyId: "company-one", dataSourceId: "source-one",
      authorizedAgentIds: ["agent-one"], authorizedOperations: ["EXPORT"],
      allowedPurposes: ["customer-report"], maximumClassification: "CONFIDENTIAL",
      allowedExportDestinations: ["destination-one"], validFrom: "2026-08-20T00:00:00.000Z",
      validUntil: "2026-08-21T00:00:00.000Z", status: "ACTIVE",
    }],
  });
  const service = new EvaluateDataEgress({
    identity, governance, events, now: () => "2026-08-20T18:00:00.000Z",
    nextId: () => `egress-${++id}`,
  });
  const base = {
    companyId: "company-one", workId: "work-one", agentId: "agent-one",
    dataSourceId: "source-one", operation: "EXPORT" as const, purpose: "customer-report",
    classification: "CONFIDENTIAL" as const, destinationId: "destination-one",
    contentDigest: `sha256:${"a".repeat(64)}`, requestedAt: "2026-08-20T18:00:00.000Z",
  };
  assert.equal((await service.execute({ contractId: "contract-one", request: base })).decision.type, "GRANTED");
  const denied = await service.execute({ contractId: "contract-one", request: { ...base, destinationId: "destination-other" } });
  assert.deepEqual(denied.decision, { type: "DENIED", policyCode: "EXPORT_DESTINATION_NOT_AUTHORIZED" });

  const decisions = (await events.read("company-one", { types: ["data-egress.decision-recorded"] }));
  assert.equal(decisions.length, 2);
  assert.doesNotMatch(JSON.stringify(decisions), /credential|secret|rawContent|session/i);
  assert.equal((decisions[1]?.payload as { decision: { policyCode: string } }).decision.policyCode, "EXPORT_DESTINATION_NOT_AUTHORIZED");
});

test("egress evaluation rejects Demo and cross-tenant identities before persistence", async () => {
  const events = new InMemoryEventStore();
  const governance = new EventBackedGovernanceCatalogStore(events, () => "unused");
  const service = new EvaluateDataEgress({
    identity: { ...identity, async getCurrentIdentity() { return { actorId: "demo", organizationId: "company-one", displayName: "Demo", assurance: "LOCAL_DEMO" }; } },
    governance, events, now: () => "2026-08-20T18:00:00.000Z", nextId: () => "unused",
  });
  await assert.rejects(service.execute({
    contractId: "contract-one",
    request: { companyId: "company-one", workId: "work-one", agentId: "agent-one", dataSourceId: "source-one", operation: "EXPORT", purpose: "report", classification: "PUBLIC", destinationId: "destination-one", contentDigest: `sha256:${"a".repeat(64)}`, requestedAt: "2026-08-20T18:00:00.000Z" },
  }), /FORMAL_IDENTITY_REQUIRED/);
  assert.equal((await events.read("company-one")).length, 0);
});
