import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { ManageAgentCommercialGovernance } from "../application/manage-agent-commercial-governance.ts";

function service() {
  let id = 0;
  const events = new InMemoryEventStore();
  return {
    events,
    commercial: new ManageAgentCommercialGovernance({
      events,
      nextId: () => `commercial-event-${++id}`,
    }),
  };
}

const subscription = {
  id: "subscription-one",
  companyId: "company-one",
  agentId: "agent-one",
  humanId: "human-one",
  providerReference: "provider-one",
  planReference: "team-plan",
  status: "ACTIVE",
  seatCount: 1,
  quotaUnits: 1_000_000,
  quotaUnit: "TOKENS",
  periodCostCents: 2_000,
  renewalAt: "2026-09-27T00:00:00.000Z",
  sourceRevision: 1,
  synchronizedAt: "2026-08-27T09:00:00.000Z",
  provenance: "DEMO_FIXTURE",
} as const;

test("subscription state records seats, quota, cost, and renewal without billing credentials", async () => {
  const { commercial } = service();
  assert.equal((await commercial.synchronizeSubscription(subscription)).status, "RECORDED");
  assert.equal((await commercial.synchronizeSubscription(subscription)).status, "REPLAYED");
  assert.deepEqual((await commercial.projection("company-one")).subscriptions, [subscription]);
});

test("credential status stores only an opaque reference and verification metadata", async () => {
  const { commercial } = service();
  const credential = {
    id: "credential-status-one",
    companyId: "company-one",
    agentId: "agent-one",
    credentialReferenceId: "opaque-reference-one",
    kind: "TOKEN",
    status: "EXPIRING",
    policyStatus: "COMPLIANT",
    expiresAt: "2026-09-02T00:00:00.000Z",
    verifiedAt: "2026-08-27T09:00:00.000Z",
    sourceRevision: 1,
    provenance: "DEMO_FIXTURE",
  } as const;
  assert.equal((await commercial.recordCredentialStatus(credential)).status, "RECORDED");
  assert.deepEqual((await commercial.projection("company-one")).credentials, [credential]);

  await assert.rejects(commercial.recordCredentialStatus({
    ...credential,
    id: "credential-status-private",
    secretValue: "must-not-persist",
  } as typeof credential), /CREDENTIAL_STATUS_FIELDS_INVALID/);
});

test("renewal requests are idempotent and explicitly state whether approval is required", async () => {
  const { commercial } = service();
  const request = {
    id: "renewal-one",
    companyId: "company-one",
    targetType: "CREDENTIAL",
    targetId: "credential-status-one",
    requestedBy: "human-one",
    accountableHumanId: "human-one",
    reason: "Credential expires before the exhibition.",
    approvalRequired: true,
    approvalRequestId: "approval-renewal-one",
    requestedAt: "2026-08-27T09:05:00.000Z",
    provenance: "DEMO_FIXTURE",
  } as const;
  const recorded = await commercial.requestRenewal(request);
  assert.equal(recorded.status, "RECORDED");
  assert.equal(recorded.record.status, "PENDING_APPROVAL");
  assert.equal((await commercial.requestRenewal(request)).status, "REPLAYED");
});

test("external usage is idempotent and allocated across human, Agent, department, and provider", async () => {
  const { commercial } = service();
  const usage = {
    id: "usage-one",
    companyId: "company-one",
    agentId: "agent-one",
    humanId: "human-one",
    departmentId: "department-one",
    providerReference: "provider-one",
    billingType: "subscription_included",
    inputUnits: 2_400,
    outputUnits: 600,
    costCents: 0,
    source: {
      connectorId: "usage-connector",
      externalId: "usage-external-one",
      evidenceReference: "usage-evidence-one",
    },
    occurredAt: "2026-08-27T08:55:00.000Z",
    recordedAt: "2026-08-27T09:00:00.000Z",
    provenance: "DEMO_FIXTURE",
  } as const;
  assert.equal((await commercial.importUsage(usage)).status, "RECORDED");
  assert.equal((await commercial.importUsage(usage)).status, "REPLAYED");

  await assert.rejects(commercial.importUsage({
    ...usage,
    costCents: 99,
  }), /PORTFOLIO_USAGE_REFERENCE_CONFLICT/);

  assert.deepEqual((await commercial.projection("company-one")).usage, [usage]);
});

