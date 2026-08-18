import assert from "node:assert/strict";
import test from "node:test";
import { ResponsibilityRegistry } from "../application/responsibility-registry.ts";
import { DEMO_COMPANY } from "../adapters/demo/demo-company.ts";
import { EventBackedResponsibilityContractStore } from "../adapters/storage/event-backed-responsibility-contract-store.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

function identity(assurance: "ENTERPRISE_ASSERTED" | "LOCAL_DEMO" = "ENTERPRISE_ASSERTED"): IdentityPort {
  return {
    async getCurrentIdentity() {
      return { actorId: "demo-boss", organizationId: "demo-company", displayName: "Boss", assurance };
    },
    async currentPrincipal() { return { id: "demo-boss", kind: "HUMAN", displayName: "Boss" }; },
    async authorize() {
      return { id: "receipt-contract", principalId: "demo-boss", authorizedAt: "2026-08-18T09:00:00.000Z" };
    },
  };
}

const contract = {
  id: "demo-contract-researcher",
  companyId: "demo-company",
  agentId: "demo-researcher",
  accountableHumanId: "demo-boss",
  backupHumanId: null,
  autonomyLevel: 2,
  allowedActions: ["read-knowledge", "publish-content"] as const,
  approvalRequiredActions: ["publish-content"] as const,
  escalationTimeoutSeconds: null,
  status: "ACTIVE" as const,
};

const operatorContract = {
  id: "demo-contract-operator",
  companyId: "demo-company",
  agentId: "demo-operator",
  accountableHumanId: "demo-boss",
  backupHumanId: null,
  autonomyLevel: 1,
  allowedActions: ["read-knowledge"] as const,
  approvalRequiredActions: [] as const,
  escalationTimeoutSeconds: null,
  status: "ACTIVE" as const,
};

test("enterprise human can persist validated responsibility contracts with revision control", async () => {
  const events = new InMemoryEventStore();
  let id = 0;
  const store = new EventBackedResponsibilityContractStore(events, () => `contract-event-${++id}`);
  const registry = new ResponsibilityRegistry({
    identity: identity(),
    organization: {
      async getOrganization() { return DEMO_COMPANY; },
      async listPrincipals() { return []; },
    },
    contracts: store,
    now: () => "2026-08-18T09:00:00.000Z",
  });
  const saved = await registry.replace("demo-company", [contract, operatorContract], 0);
  assert.equal(saved.revision, 1);
  assert.deepEqual(await store.load("demo-company"), saved);
  await assert.rejects(registry.replace("demo-company", [contract, operatorContract], 0), /revision conflict/i);
});

test("Demo identity cannot write formal responsibility contracts", async () => {
  const registry = new ResponsibilityRegistry({
    identity: identity("LOCAL_DEMO"),
    organization: {
      async getOrganization() { return DEMO_COMPANY; },
      async listPrincipals() { return []; },
    },
    contracts: new EventBackedResponsibilityContractStore(new InMemoryEventStore(), () => "event-one"),
    now: () => "2026-08-18T09:00:00.000Z",
  });
  await assert.rejects(registry.replace("demo-company", [contract, operatorContract], 0), /FORMAL_IDENTITY_REQUIRED/);
});
