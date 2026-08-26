import assert from "node:assert/strict";
import test from "node:test";

import { CompanyRegistry } from "../application/company-registry.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

const structure = {
  organization: {
    company: { id: "company-one", name: "Company One", purpose: "Operate safely", locale: "en" },
    departments: [{ id: "operations", name: "Operations", mandate: "Run work" }],
    humans: [{
      id: "human-one", name: "Human One", title: "Agent Boss", departmentId: "operations",
      avatarId: "human-asset-one",
    }],
    agents: [{
      id: "agent-one", name: "Agent One", role: "Research", departmentId: "operations",
      accountableHumanId: "human-one", runtimeConnectorId: "connector-one",
      avatarId: "fish-bumble", autonomyLevel: 2,
    }],
  },
  projects: [{ id: "project-one", name: "Launch", departmentIds: ["operations"], ownerHumanId: "human-one" }],
  workspaces: [{ id: "workspace-one", name: "Launch room", projectId: "project-one", departmentId: null }],
  positions: [
    { id: "position-boss", title: "Agent Boss", departmentId: "operations", principalId: "human-one", accountableHumanId: "human-one" },
    { id: "position-agent", title: "Researcher", departmentId: "operations", principalId: "agent-one", accountableHumanId: "human-one" },
  ],
  reportingLines: [{ subordinatePositionId: "position-agent", managerPositionId: "position-boss" }],
} as const;

function identity(organizationId = "company-one"): IdentityPort {
  return {
    async getCurrentIdentity() {
      return { actorId: "human-one", organizationId, displayName: "Human One", assurance: "ENTERPRISE_ASSERTED" };
    },
    async currentPrincipal() { return { id: "human-one", kind: "HUMAN", displayName: "Human One" }; },
    async authorize() {
      return { id: "receipt-register", principalId: "human-one", authorizedAt: "2026-08-18T08:00:00.000Z" };
    },
  };
}

test("company structure survives application service restart through the event store", async () => {
  const events = new InMemoryEventStore();
  const first = new CompanyRegistry({
    identity: identity(), events, now: () => "2026-08-18T08:00:00.000Z", nextId: () => "event-structure-one",
  });
  await first.register(structure);

  const restarted = new CompanyRegistry({
    identity: identity(), events, now: () => "2026-08-18T08:01:00.000Z", nextId: () => "unused",
  });
  assert.deepEqual(await restarted.get("company-one"), structure);
});

test("company registry rejects cross-tenant access and invalid reporting cycles", async () => {
  const events = new InMemoryEventStore();
  const crossTenant = new CompanyRegistry({
    identity: identity("company-two"), events, now: () => "2026-08-18T08:00:00.000Z", nextId: () => "event-one",
  });
  await assert.rejects(crossTenant.register(structure), /TENANT_MISMATCH/);

  const cyclic = structuredClone(structure);
  cyclic.reportingLines.push({ subordinatePositionId: "position-boss", managerPositionId: "position-agent" });
  const registry = new CompanyRegistry({
    identity: identity(), events, now: () => "2026-08-18T08:00:00.000Z", nextId: () => "event-one",
  });
  await assert.rejects(registry.register(cyclic), /reporting cycle/i);
});
