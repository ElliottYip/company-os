import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { EventBackedGovernanceCatalogStore } from "../adapters/storage/event-backed-governance-catalog-store.ts";
import { ManageDataAuthorizationContract } from "../application/manage-data-authorization-contract.ts";

function harness() {
  const events = new InMemoryEventStore();
  let id = 0;
  const store = new EventBackedGovernanceCatalogStore(events, () => `governance-${++id}`);
  const identity = {
    async getCurrentIdentity() { return { actorId: "human-one", organizationId: "company-one",
      displayName: "Owner", assurance: "ENTERPRISE_ASSERTED" as const }; },
    async currentPrincipal() { return null; },
    async authorize() { return { id: `receipt-${++id}`, principalId: "human-one",
      authorizedAt: "2026-08-24T12:00:00.000Z" }; },
  };
  const structure = { async load(companyId: string) { return companyId === "company-one" ? {
    organization: { company: { id: "company-one", name: "Company" }, departments: [],
      humans: [{ id: "human-one", displayName: "Owner", externalIdentityIds: [] }],
      agents: [{ id: "agent-one", displayName: "Agent", provider: "enterprise",
        accountableHumanId: "human-one", autonomyLevel: 1, externalIdentityIds: [] }] },
    projects: [], workspaces: [], positions: [], reportingLines: [],
  } : null; } };
  return { store, service: new ManageDataAuthorizationContract({ identity, structure, store,
    now: () => "2026-08-24T12:00:00.000Z" }) };
}

const input = {
  companyId: "company-one", id: "finance-read", dataSourceId: "finance-warehouse",
  authorizedAgentIds: ["agent-one"], authorizedOperations: ["READ"] as const,
  allowedPurposes: ["monthly-close"], maximumClassification: "CONFIDENTIAL" as const,
  allowedExportDestinations: [], validUntil: "2026-09-24T12:00:00.000Z", expectedRevision: 0,
};

test("data authorization follows create-active, pause/resume, and terminal revoke lifecycle", async () => {
  const { service, store } = harness();
  const created = await service.create(input);
  assert.equal(created.dataAuthorizationContracts[0]?.status, "ACTIVE");
  assert.equal(created.dataAuthorizationContracts[0]?.validFrom, "2026-08-24T12:00:00.000Z");
  const paused = await service.setStatus({ companyId: "company-one", contractId: "finance-read",
    status: "SUSPENDED", expectedRevision: 1 });
  assert.equal(paused.dataAuthorizationContracts[0]?.status, "SUSPENDED");
  const resumed = await service.setStatus({ companyId: "company-one", contractId: "finance-read",
    status: "ACTIVE", expectedRevision: 2 });
  assert.equal(resumed.dataAuthorizationContracts[0]?.status, "ACTIVE");
  await service.setStatus({ companyId: "company-one", contractId: "finance-read",
    status: "REVOKED", expectedRevision: 3 });
  await assert.rejects(service.setStatus({ companyId: "company-one", contractId: "finance-read",
    status: "ACTIVE", expectedRevision: 4 }), /DATA_AUTHORIZATION_REVOKED_TERMINAL/);
  assert.equal((await store.load("company-one")).revision, 4);
});

test("data authorization rejects stale revisions, duplicates, and unknown Agents", async () => {
  const { service } = harness();
  await assert.rejects(service.create({ ...input, authorizedAgentIds: ["agent-missing"] }),
    /DATA_AUTHORIZATION_AGENT_NOT_FOUND/);
  await service.create(input);
  await assert.rejects(service.create({ ...input, expectedRevision: 1 }), /DATA_AUTHORIZATION_ALREADY_EXISTS/);
  await assert.rejects(service.setStatus({ companyId: "company-one", contractId: "finance-read",
    status: "SUSPENDED", expectedRevision: 0 }), /GOVERNANCE_CATALOG_REVISION_CONFLICT/);
});
