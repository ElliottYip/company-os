import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { EventBackedToolAccessCatalogStore } from "../adapters/storage/event-backed-tool-access-catalog-store.ts";
import { ManageToolAccess } from "../application/manage-tool-access.ts";

function harness() {
  const events = new InMemoryEventStore(); let id = 0;
  const store = new EventBackedToolAccessCatalogStore(events, () => `event-${++id}`);
  const identity = { async getCurrentIdentity() { return { actorId: "human-one", organizationId: "company-one",
    displayName: "Human", assurance: "ENTERPRISE_ASSERTED" as const }; }, async currentPrincipal() { return null; },
    async authorize() { return { id: `receipt-${++id}`, principalId: "human-one", authorizedAt: "2026-08-24T12:00:00.000Z" }; } };
  const structure = { async load() { return { organization: { company: { id: "company-one", name: "Company",
    purpose: "Operate", locale: "en" }, departments: [{ id: "engineering", name: "Engineering", mandate: "Build" }],
    humans: [{ id: "human-one", name: "Human", title: "Owner", departmentId: "engineering", avatarId: "avatar" }],
    agents: [{ id: "agent-one", name: "Agent", role: "Engineer", departmentId: "engineering",
      accountableHumanId: "human-one", runtimeConnectorId: "connector", avatarId: "fish", autonomyLevel: 2 }] },
    projects: [{ id: "project-one", name: "Project", departmentIds: ["engineering"], ownerHumanId: "human-one" }],
    workspaces: [], positions: [], reportingLines: [] }; } };
  return { store, service: new ManageToolAccess({ identity, structure, store,
    now: () => "2026-08-24T12:00:00.000Z" }) };
}

test("narrow tool commands create active profile, binding, and policy with revision fencing", async () => {
  const { service, store } = harness();
  await service.createProfile({ companyId: "company-one", profileId: "profile-engineering",
    profileKey: "engineering", name: "Engineering", description: null, defaultAction: "deny",
    entries: [{ id: "entry-read", selectorType: "tool_name", selectorValue: "read-repository", effect: "include" }],
    expectedRevision: 0 });
  await service.bindProfile({ companyId: "company-one", bindingId: "binding-agent", profileId: "profile-engineering",
    targetType: "agent", targetId: "agent-one", priority: 100, expectedRevision: 1 });
  await service.createPolicy({ companyId: "company-one", policy: { id: "policy-approval", name: "Deploy approval",
    description: null, policyType: "require_approval", priority: 10, selectors: { toolName: "deploy-production" } },
    expectedRevision: 2 });
  const saved = await store.load("company-one");
  assert.equal(saved.revision, 3); assert.equal(saved.profiles[0]?.status, "active");
  assert.equal(saved.policies[0]?.enabled, true);
});

test("profile archive is terminal and bindings validate real company targets", async () => {
  const { service } = harness();
  await service.createProfile({ companyId: "company-one", profileId: "profile-engineering",
    profileKey: "engineering", name: "Engineering", description: null, defaultAction: "deny", entries: [],
    expectedRevision: 0 });
  await assert.rejects(service.bindProfile({ companyId: "company-one", bindingId: "binding-agent",
    profileId: "profile-engineering", targetType: "agent", targetId: "missing", priority: 100,
    expectedRevision: 1 }), /TOOL_PROFILE_BINDING_TARGET_NOT_FOUND/);
  await service.setProfileStatus({ companyId: "company-one", profileId: "profile-engineering",
    status: "archived", expectedRevision: 1 });
  await assert.rejects(service.setProfileStatus({ companyId: "company-one", profileId: "profile-engineering",
    status: "active", expectedRevision: 2 }), /TOOL_PROFILE_ARCHIVED_TERMINAL/);
});
