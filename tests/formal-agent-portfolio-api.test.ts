import assert from "node:assert/strict";
import test from "node:test";

import { FormalAgentPortfolioApi } from "../application/formal-agent-portfolio-api.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

function identity(): { port: IdentityPort; actions: string[] } {
  const actions: string[] = [];
  return {
    actions,
    port: {
      async getCurrentIdentity() {
        return { actorId: "human-admin", organizationId: "company-one", displayName: "Admin", assurance: "ENTERPRISE_ASSERTED" };
      },
      async currentPrincipal() { return { id: "human-admin", kind: "HUMAN", displayName: "Admin" }; },
      async authorize(intent) {
        actions.push(intent.action);
        return { id: "receipt-one", principalId: "human-admin", authorizedAt: "2026-08-27T09:00:00.000Z" };
      },
    },
  };
}

test("formal portfolio facade tenant-binds neutral inbound synchronization", async () => {
  const auth = identity();
  const calls: unknown[] = [];
  const api = new FormalAgentPortfolioApi({
    identity: auth.port,
    agents: {
      async list(companyId) { return [{ companyId }]; },
      async synchronize(input) { calls.push(input); return input; },
    },
    work: {
      async list(companyId) { return [{ companyId }]; },
      async registerObserved(input) { calls.push(input); return input; },
      async synchronizeFederated(input) { calls.push(input); return input; },
    },
    commercial: {
      async projection(companyId) { return { companyId }; },
      async synchronizeSubscription(input) { calls.push(input); return input; },
      async recordCredentialStatus(input) { calls.push(input); return input; },
      async importUsage(input) { calls.push(input); return input; },
      async requestRenewal(input) { calls.push(input); return input; },
    },
  });

  await api.registerObservedWork("company-one", { companyId: "spoofed", id: "work-one" });
  await api.importUsage("company-one", { companyId: "spoofed", id: "usage-one" });
  assert.deepEqual(calls, [
    { companyId: "company-one", id: "work-one" },
    { companyId: "company-one", id: "usage-one" },
  ]);
  assert.deepEqual(auth.actions, ["portfolio-work:observe", "agent-commercial:record-usage"]);
});

test("formal portfolio facade rejects cross-tenant calls before a dependency", async () => {
  const auth = identity();
  let called = false;
  const api = new FormalAgentPortfolioApi({
    identity: auth.port,
    agents: { async list() { called = true; return []; }, async synchronize(input) { return input; } },
    work: { async list() { return []; }, async registerObserved(input) { return input; }, async synchronizeFederated(input) { return input; } },
    commercial: {
      async projection() { return {}; }, async synchronizeSubscription(input) { return input; },
      async recordCredentialStatus(input) { return input; }, async importUsage(input) { return input; },
      async requestRenewal(input) { return input; },
    },
  });
  await assert.rejects(api.listAgents("company-two"), /TENANT_MISMATCH/);
  assert.equal(called, false);
});
