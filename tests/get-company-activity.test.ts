import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { GetCompanyActivity } from "../application/get-company-activity.ts";

const identity = {
  async getCurrentIdentity() {
    return { actorId: "human-one", organizationId: "company-one", displayName: "Human One",
      assurance: "ENTERPRISE_ASSERTED" as const };
  },
  async currentPrincipal() { return null; },
  async authorize() {
    return { id: "authorization-one", principalId: "human-one", authorizedAt: "2026-08-25T12:00:00.000Z" };
  },
};

test("company activity is paginated, tenant-authorized, and excludes raw event payloads", async () => {
  const events = new InMemoryEventStore();
  await events.append({
    id: "event-one", companyId: "company-one", type: "work.dispatched",
    occurredAt: "2026-08-25T12:00:00.000Z", actorId: "human-one", provenance: "PRODUCTION",
    correlationId: "work-one", payload: { credential: "must-not-leak", work: {
      id: "work-one", companyId: "company-one", title: "Prepare launch brief", goal: "Launch safely",
      scope: "AGENT", departmentId: "operations", projectId: null, agentId: "agent-one",
      requestedBy: "human-one", actionIds: ["draft"], parentWorkId: null,
      accountableHumanId: "human-one", responsibilityContractId: "contract-one",
      runtimeConnectorId: "connector-one", status: "PENDING",
    } },
  });
  await events.append({
    id: "event-two", companyId: "company-one", type: "connector.observation.recorded",
    occurredAt: "2026-08-25T12:01:00.000Z", actorId: "connector-one", provenance: "PRODUCTION",
    correlationId: "work-one", payload: { privateReasoning: "hidden", externalSession: "private",
      observation: { workId: "work-one", sequence: 1, status: "WORKING",
        summary: "Collected approved sources", evidenceRefs: [], recordedAt: "2026-08-25T12:01:00.000Z" } },
  });

  const activity = new GetCompanyActivity({ identity, events });
  const first = await activity.execute({ companyId: "company-one", afterSequence: 0, limit: 1 });
  assert.equal(first.items[0]?.summary, "Prepare launch brief");
  assert.equal(first.nextSequence, 1);
  const second = await activity.execute({ companyId: "company-one", afterSequence: 1, limit: 1 });
  assert.equal(second.items[0]?.summary, "Collected approved sources");
  assert.equal(second.nextSequence, null);
  assert.equal(JSON.stringify([first, second]).includes("must-not-leak"), false);
  assert.equal(JSON.stringify([first, second]).includes("privateReasoning"), false);
  assert.equal(JSON.stringify([first, second]).includes("externalSession"), false);
});

test("company activity rejects cross-tenant and invalid page requests", async () => {
  const events = new InMemoryEventStore();
  const activity = new GetCompanyActivity({ identity, events });
  await assert.rejects(() => activity.execute({ companyId: "company-two", afterSequence: 0, limit: 10 }),
    /TENANT_MISMATCH/);
  await assert.rejects(() => activity.execute({ companyId: "company-one", afterSequence: -1, limit: 10 }),
    /COMPANY_ACTIVITY_PAGE_INVALID/);
});
