import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_COMPANY } from "../adapters/demo/demo-company.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { EventBackedPlanningStore } from "../adapters/storage/event-backed-planning-store.ts";
import { PlanningRegistry } from "../application/planning-registry.ts";

test("Paperclip-aligned planning states retain Company OS accountable-human ownership", async () => {
  let id = 0; const events = new InMemoryEventStore();
  const registry = new PlanningRegistry({
    identity: { async getCurrentIdentity() { return { actorId: "demo-boss", organizationId: "demo-company", displayName: "Boss", assurance: "ENTERPRISE_ASSERTED" }; }, async currentPrincipal() { return { id: "demo-boss", kind: "HUMAN", displayName: "Boss" }; }, async authorize() { return { id: "receipt", principalId: "demo-boss", authorizedAt: "2026-08-24T00:00:00.000Z" }; } },
    structure: { async load() { return { organization: DEMO_COMPANY, projects: [], workspaces: [], positions: [], reportingLines: [] }; } },
    store: new EventBackedPlanningStore(events, () => `event-${++id}`),
    now: () => "2026-08-24T00:00:00.000Z",
    nextId: () => `record-${++id}`,
  });
  const catalog = await registry.replace("demo-company", { revision: 0, goals: [{ id: "goal-one", companyId: "demo-company", title: "Launch", description: null, level: "company", status: "active", parentId: null, ownerAgentId: "demo-researcher", accountableHumanId: "demo-boss", createdAt: "2026-08-24T00:00:00.000Z", updatedAt: "2026-08-24T00:00:00.000Z" }], projects: [{ id: "project-one", companyId: "demo-company", goalIds: ["goal-one"], name: "Launch program", description: null, status: "in_progress", leadAgentId: "demo-researcher", accountableHumanId: "demo-boss", departmentIds: ["operations"], targetDate: "2026-12-01", archivedAt: null, createdAt: "2026-08-24T00:00:00.000Z", updatedAt: "2026-08-24T00:00:00.000Z" }] }, 0);
  assert.equal(catalog.revision, 1);
  assert.equal((await registry.load("demo-company")).projects[0]?.status, "in_progress");
});

test("planning rejects an Agent owner whose accountable human does not match", async () => {
  const registry = new PlanningRegistry({ identity: { async getCurrentIdentity() { return { actorId: "demo-boss", organizationId: "demo-company", displayName: "Boss", assurance: "ENTERPRISE_ASSERTED" }; }, async currentPrincipal() { return null; }, async authorize() { return { id: "r", principalId: "demo-boss", authorizedAt: "now" }; } }, structure: { async load() { return { organization: DEMO_COMPANY, projects: [], workspaces: [], positions: [], reportingLines: [] }; } }, store: new EventBackedPlanningStore(new InMemoryEventStore(), () => "event"), now: () => "now", nextId: () => "record" });
  await assert.rejects(registry.replace("demo-company", { revision: 0, goals: [{ id: "goal-one", companyId: "demo-company", title: "Launch", description: null, level: "company", status: "active", parentId: null, ownerAgentId: "demo-researcher", accountableHumanId: "demo-product-boss", createdAt: "now", updatedAt: "now" }], projects: [] }, 0), /GOAL_OWNER_AGENT_INVALID/);
});

test("goal and project commands enforce server IDs, revisions, transitions, and terminal archive", async () => {
  let eventId = 0;
  let recordId = 0;
  let clock = 0;
  const registry = new PlanningRegistry({
    identity: {
      async getCurrentIdentity() { return { actorId: "demo-boss", organizationId: "demo-company", displayName: "Boss", assurance: "ENTERPRISE_ASSERTED" }; },
      async currentPrincipal() { return { id: "demo-boss", kind: "HUMAN", displayName: "Boss" }; },
      async authorize() { return { id: "receipt", principalId: "demo-boss", authorizedAt: "2026-08-25T00:00:00.000Z" }; },
    },
    structure: { async load() { return { organization: DEMO_COMPANY, projects: [], workspaces: [], positions: [], reportingLines: [] }; } },
    store: new EventBackedPlanningStore(new InMemoryEventStore(), () => `event-${++eventId}`),
    now: () => `2026-08-25T00:00:${String(++clock).padStart(2, "0")}.000Z`,
    nextId: () => `record-${++recordId}`,
  });

  let catalog = await registry.createGoal("demo-company", {
    title: "Launch accountable operations", description: "Prove the operating loop",
    level: "company", parentId: null, ownerAgentId: "demo-researcher",
    accountableHumanId: "demo-boss", expectedRevision: 0,
  });
  const goal = catalog.goals[0]!;
  assert.equal(goal.id, "record-1");
  assert.equal(goal.status, "planned");
  await assert.rejects(registry.createGoal("demo-company", {
    title: "Stale", description: null, level: "team", parentId: null,
    ownerAgentId: null, accountableHumanId: "demo-boss", expectedRevision: 0,
  }), /PLANNING_REVISION_CONFLICT/);

  catalog = await registry.updateGoal("demo-company", goal.id, {
    title: goal.title, description: goal.description, level: goal.level,
    parentId: null, ownerAgentId: goal.ownerAgentId,
    accountableHumanId: goal.accountableHumanId, status: "active", expectedRevision: 1,
  });
  catalog = await registry.updateGoal("demo-company", goal.id, {
    title: goal.title, description: goal.description, level: goal.level,
    parentId: null, ownerAgentId: goal.ownerAgentId,
    accountableHumanId: goal.accountableHumanId, status: "achieved", expectedRevision: 2,
  });
  await assert.rejects(registry.updateGoal("demo-company", goal.id, {
    title: goal.title, description: goal.description, level: goal.level,
    parentId: null, ownerAgentId: goal.ownerAgentId,
    accountableHumanId: goal.accountableHumanId, status: "active", expectedRevision: 3,
  }), /GOAL_STATUS_TRANSITION_INVALID/);

  catalog = await registry.createProject("demo-company", {
    name: "Launch program", description: null, goalIds: [goal.id], leadAgentId: "demo-researcher",
    accountableHumanId: "demo-boss", departmentIds: ["operations"], targetDate: "2026-12-01",
    expectedRevision: 3,
  });
  const project = catalog.projects[0]!;
  assert.equal(project.id, "record-2");
  assert.equal(project.status, "backlog");
  await assert.rejects(
    registry.archiveProject("demo-company", project.id, 4),
    /PROJECT_TERMINAL_STATUS_REQUIRED/,
  );
  for (const status of ["planned", "in_progress", "completed"] as const) {
    catalog = await registry.updateProject("demo-company", project.id, {
      goalIds: project.goalIds, name: project.name, description: project.description,
      status, leadAgentId: project.leadAgentId,
      accountableHumanId: project.accountableHumanId,
      departmentIds: project.departmentIds, targetDate: project.targetDate,
      expectedRevision: catalog.revision,
    });
  }
  catalog = await registry.archiveProject("demo-company", project.id, catalog.revision);
  assert.ok(catalog.projects[0]?.archivedAt);
  await assert.rejects(registry.updateProject("demo-company", project.id, {
    goalIds: project.goalIds, name: project.name, description: project.description,
    status: "completed", leadAgentId: project.leadAgentId,
    accountableHumanId: project.accountableHumanId,
    departmentIds: project.departmentIds, targetDate: project.targetDate,
    expectedRevision: catalog.revision,
  }), /PROJECT_ARCHIVED_TERMINAL/);
});
