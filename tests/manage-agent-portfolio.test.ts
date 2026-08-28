import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { ManageAgentPortfolio } from "../application/manage-agent-portfolio.ts";
import type { AgentPortfolioRecord } from "../core/agent-portfolio.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

const personal: AgentPortfolioRecord = {
  id: "agent-personal-one",
  companyId: "company-one",
  displayName: "Mia's local agent",
  accountableHumanId: "human-mia",
  providerReference: "provider-reference",
  runtimeReference: "runtime-reference",
  source: { connectorId: "connector-inventory", externalId: "external-agent-one", externalUrl: null },
  permissionIds: ["permission-basic"],
  dataAuthorizationIds: [],
  lifecycleStatus: "ACTIVE",
  connectorHealth: "HEALTHY",
  synchronizedAt: "2026-08-27T09:00:00.000Z",
  agentClass: "PERSONAL",
  managementDepth: "INVENTORY",
  executionOwner: "HUMAN_ENDPOINT",
  workVisibility: "NONE",
  privacyBoundary: "PRIVATE_ACTIVITY_EXCLUDED",
};

function identity(assurance: "ENTERPRISE_ASSERTED" | "LOCAL_DEMO" = "ENTERPRISE_ASSERTED") {
  const authorizations: string[] = [];
  const value: IdentityPort = {
    async getCurrentIdentity() {
      return { actorId: "human-admin", organizationId: "company-one", displayName: "Admin", assurance };
    },
    async currentPrincipal() {
      return { id: "human-admin", kind: "HUMAN", displayName: "Admin" };
    },
    async authorize(intent) {
      authorizations.push(intent.action);
      return { id: "receipt-one", principalId: "human-admin", authorizedAt: "2026-08-27T09:00:00.000Z" };
    },
  };
  return { value, authorizations };
}

test("formal Agent Portfolio synchronization is authorized, durable, and idempotent", async () => {
  const events = new InMemoryEventStore();
  const auth = identity();
  let sequence = 0;
  const portfolio = new ManageAgentPortfolio({
    identity: auth.value,
    events,
    nextId: () => `portfolio-event-${++sequence}`,
  });

  assert.equal((await portfolio.synchronize(personal)).status, "RECORDED");
  assert.equal((await portfolio.synchronize(personal)).status, "REPLAYED");
  assert.deepEqual(auth.authorizations, ["agent-portfolio:synchronize"]);
  assert.deepEqual(await portfolio.list("company-one"), [personal]);

  const reconstructed = new ManageAgentPortfolio({
    identity: auth.value,
    events,
    nextId: () => `portfolio-event-${++sequence}`,
  });
  assert.deepEqual(await reconstructed.list("company-one"), [personal]);
});

test("Agent Portfolio rejects stale source state and Demo writers", async () => {
  const events = new InMemoryEventStore();
  let sequence = 0;
  const formal = new ManageAgentPortfolio({
    identity: identity().value,
    events,
    nextId: () => `portfolio-event-${++sequence}`,
  });
  await formal.synchronize(personal);
  await assert.rejects(formal.synchronize({
    ...personal,
    displayName: "Stale replacement",
    synchronizedAt: "2026-08-27T08:59:59.000Z",
  }), /AGENT_PORTFOLIO_SOURCE_STATE_STALE/);

  const demo = new ManageAgentPortfolio({
    identity: identity("LOCAL_DEMO").value,
    events,
    nextId: () => `portfolio-event-${++sequence}`,
  });
  await assert.rejects(demo.synchronize(personal), /FORMAL_IDENTITY_REQUIRED/);
});

