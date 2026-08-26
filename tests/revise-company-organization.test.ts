import assert from "node:assert/strict";
import test from "node:test";
import { ArchiveDepartment, ReviseCompanyOrganization, TransferAgentResponsibility, UpdateCompanyProfile } from "../application/revise-company-organization.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { EventBackedOrganizationPrincipalStore } from "../adapters/storage/event-backed-organization-principal-store.ts";
import { EventBackedResponsibilityContractStore } from "../adapters/storage/event-backed-responsibility-contract-store.ts";
import { EventBackedPlanningStore } from "../adapters/storage/event-backed-planning-store.ts";
import type { CompanyStructure } from "../core/company-structure.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

const companyId = "company-one";
const initial: CompanyStructure = {
  organization: {
    company: { id: companyId, name: "Acme", purpose: "Serve customers", locale: "en" },
    departments: [{ id: "department-one", name: "Operations", mandate: "Operate" }],
    humans: [{ id: "human-one", name: "Alex", title: "Owner", departmentId: "department-one", avatarId: "human-default" }],
    agents: [],
  },
  projects: [],
  workspaces: [{ id: "workspace-one", name: "Operations workspace", projectId: null, departmentId: "department-one" }],
  positions: [{ id: "position-one", title: "Owner", departmentId: "department-one", principalId: "human-one", accountableHumanId: "human-one" }],
  reportingLines: [],
};

const identity: IdentityPort = {
  async getCurrentIdentity() {
    return { actorId: "human-one", organizationId: companyId, displayName: "Alex", assurance: "ENTERPRISE_ASSERTED" };
  },
  async currentPrincipal() { return { id: "human-one", kind: "HUMAN", displayName: "Alex" }; },
  async authorize() {
    return { id: "receipt-one", principalId: "human-one", authorizedAt: "2026-08-24T01:00:00.000Z" };
  },
};

test("organization revision atomically creates a non-executable responsibility draft for a new Agent", async () => {
  const events = new InMemoryEventStore();
  await events.append({ id: "event-one", companyId, type: "organization.registered", occurredAt: "2026-08-24T00:00:00.000Z", actorId: "human-one", payload: { structure: initial }, provenance: "PRODUCTION" });
  let id = 0;
  const service = new ReviseCompanyOrganization({
    identity,
    events, now: () => "2026-08-24T01:00:00.000Z", nextId: () => `generated-${++id}`,
  });
  const organization = await service.execute({ companyId, organization: {
    ...initial.organization,
    agents: [{ id: "agent-one", name: "Researcher", role: "Research", departmentId: "department-one", accountableHumanId: "human-one", runtimeConnectorId: "connector-unbound", avatarId: "fish-bumble", autonomyLevel: 2 }],
  } });
  assert.equal(organization.agents.length, 1);
  const revision = (await events.read(companyId)).at(-1)!;
  assert.equal(revision.type, "organization.revised");
  const snapshot = (revision.payload as { responsibilitySnapshot: { contracts: { status: string }[] } }).responsibilitySnapshot;
  assert.equal(snapshot.contracts[0]?.status, "DRAFT");
  const structure = (revision.payload as { structure: CompanyStructure }).structure;
  assert.deepEqual(structure.reportingLines, [{
    subordinatePositionId: structure.positions.find(({ principalId }) => principalId === "agent-one")?.id,
    managerPositionId: "position-one",
  }]);
  assert.equal((await new EventBackedOrganizationPrincipalStore(events).getOrganization(companyId))?.agents.length, 1);
  assert.equal((await new EventBackedResponsibilityContractStore(events, () => "unused").load(companyId)).contracts[0]?.status, "DRAFT");
});

test("pending Agent configuration is frozen until the reviewed Agent is approved", async () => {
  const events = new InMemoryEventStore();
  await events.append({ id: "event-one", companyId, type: "organization.registered", occurredAt: "2026-08-24T00:00:00.000Z", actorId: "human-one", payload: { structure: initial }, provenance: "PRODUCTION" });
  let id = 0;
  const service = new ReviseCompanyOrganization({
    identity,
    events, now: () => "2026-08-24T01:00:00.000Z", nextId: () => `generated-${++id}`,
  });
  const pending = await service.execute({ companyId, organization: {
    ...initial.organization,
    agents: [{ id: "agent-one", name: "Researcher", role: "Research", departmentId: "department-one", accountableHumanId: "human-one", runtimeConnectorId: "connector-one", avatarId: "fish-bumble", autonomyLevel: 2 }],
  } });

  await assert.rejects(
    service.execute({ companyId, organization: {
      ...pending,
      agents: [{ ...pending.agents[0]!, runtimeConnectorId: "connector-tampered", autonomyLevel: 5 }],
    } }),
    /PENDING_APPROVAL_AGENT_CONFIG_FROZEN:agent-one:runtimeConnectorId,autonomyLevel/,
  );

  const currentEvents = await events.read(companyId);
  await events.append({
    id: "lifecycle-one", companyId, type: "agent.lifecycle.changed",
    occurredAt: "2026-08-24T01:30:00.000Z", actorId: "human-one", provenance: "PRODUCTION",
    payload: { revision: 1, agents: [{
      companyId, agentId: "agent-one", status: "idle", pauseReason: null,
      pausedAt: null, errorCode: null, updatedAt: "2026-08-24T01:30:00.000Z",
    }] },
  }, currentEvents.length);

  const revised = await service.execute({ companyId, organization: {
    ...pending,
    agents: [{ ...pending.agents[0]!, role: "Senior Research" }],
  } });
  assert.equal(revised.agents[0]?.role, "Senior Research");
  assert.equal(revised.agents[0]?.autonomyLevel, 2);
  await assert.rejects(service.execute({ companyId, organization: {
    ...revised,
    agents: [{ ...revised.agents[0]!, autonomyLevel: 3 }],
  } }), /RESPONSIBILITY_AUTONOMY_COMMAND_REQUIRED:agent-one/);
});

test("approved Agent and human profile changes reconcile positions without changing responsibility", async () => {
  const events = new InMemoryEventStore();
  const withSecondHuman: CompanyStructure = {
    ...initial,
    organization: {
      ...initial.organization,
      humans: [
        ...initial.organization.humans,
        { id: "human-two", name: "Jordan", title: "Research Lead", departmentId: "department-one", avatarId: "human-default" },
      ],
      agents: [{
        id: "agent-one", name: "Researcher", role: "Research", departmentId: "department-one",
        accountableHumanId: "human-one", runtimeConnectorId: "connector-one",
        avatarId: "fish-bumble", autonomyLevel: 2,
      }],
    },
    positions: [
      ...initial.positions,
      { id: "position-two", title: "Research Lead", departmentId: "department-one", principalId: "human-two", accountableHumanId: "human-two" },
      { id: "position-agent", title: "Research", departmentId: "department-one", principalId: "agent-one", accountableHumanId: "human-one" },
    ],
    reportingLines: [{ subordinatePositionId: "position-agent", managerPositionId: "position-one" }],
  };
  await events.append({
    id: "event-one", companyId, type: "organization.registered",
    occurredAt: "2026-08-24T00:00:00.000Z", actorId: "human-one",
    payload: { structure: withSecondHuman }, provenance: "PRODUCTION",
  });
  await events.append({
    id: "responsibility-one", companyId, type: "responsibility.contracts.replaced",
    occurredAt: "2026-08-24T00:15:00.000Z", actorId: "human-one", provenance: "PRODUCTION",
    payload: { revision: 1, contracts: [{
      id: "contract-one", companyId, agentId: "agent-one", accountableHumanId: "human-one",
      backupHumanId: null, autonomyLevel: 2, allowedActions: ["read-knowledge"],
      approvalRequiredActions: [], escalationTimeoutSeconds: null, status: "ACTIVE",
    }] },
  }, 1);
  await events.append({
    id: "lifecycle-one", companyId, type: "agent.lifecycle.changed",
    occurredAt: "2026-08-24T00:30:00.000Z", actorId: "human-one", provenance: "PRODUCTION",
    payload: { revision: 1, agents: [{
      companyId, agentId: "agent-one", status: "idle", pauseReason: null,
      pausedAt: null, errorCode: null, updatedAt: "2026-08-24T00:30:00.000Z",
    }] },
  }, 2);
  let id = 0;
  const service = new ReviseCompanyOrganization({
    identity, events, now: () => "2026-08-24T01:00:00.000Z", nextId: () => `generated-${++id}`,
  });

  await service.execute({ companyId, organization: {
    ...withSecondHuman.organization,
    humans: withSecondHuman.organization.humans.map((human) => human.id === "human-two"
      ? { ...human, title: "AI Operations Director" }
      : human),
    agents: withSecondHuman.organization.agents.map((agent) => ({
      ...agent,
      role: "Senior Researcher",
    })),
  } });

  const revision = (await events.read(companyId)).at(-1)!;
  const structure = (revision.payload as { structure: CompanyStructure }).structure;
  assert.deepEqual(
    structure.positions.find(({ id: value }) => value === "position-two"),
    { id: "position-two", title: "AI Operations Director", departmentId: "department-one", principalId: "human-two", accountableHumanId: "human-two" },
  );
  assert.deepEqual(
    structure.positions.find(({ id: value }) => value === "position-agent"),
    { id: "position-agent", title: "Senior Researcher", departmentId: "department-one", principalId: "agent-one", accountableHumanId: "human-one" },
  );
  assert.deepEqual(structure.reportingLines, [{
    subordinatePositionId: "position-agent",
    managerPositionId: "position-one",
  }]);

  await assert.rejects(service.execute({ companyId, organization: {
    ...structure.organization,
    agents: structure.organization.agents.map((agent) => ({
      ...agent,
      accountableHumanId: "human-two",
    })),
  } }), /RESPONSIBILITY_TRANSFER_COMMAND_REQUIRED:agent-one/);
});

test("explicit responsibility transfer atomically changes contract, Agent owner and reporting line", async () => {
  const events = new InMemoryEventStore();
  const structure: CompanyStructure = {
    ...initial,
    organization: { ...initial.organization,
      humans: [...initial.organization.humans, { id: "human-two", name: "Jordan", title: "Lead",
        departmentId: "department-one", avatarId: "human-default" }],
      agents: [{ id: "agent-one", name: "Researcher", role: "Research", departmentId: "department-one",
        accountableHumanId: "human-one", runtimeConnectorId: "connector-one", avatarId: "fish-bumble", autonomyLevel: 2 }] },
    positions: [...initial.positions,
      { id: "position-two", title: "Lead", departmentId: "department-one", principalId: "human-two", accountableHumanId: "human-two" },
      { id: "position-agent", title: "Research", departmentId: "department-one", principalId: "agent-one", accountableHumanId: "human-one" }],
    reportingLines: [{ subordinatePositionId: "position-agent", managerPositionId: "position-one" }],
  };
  await events.append({ id: "organization-one", companyId, type: "organization.registered", occurredAt: "2026-08-24T00:00:00.000Z",
    actorId: "human-one", payload: { structure }, provenance: "PRODUCTION" });
  await events.append({ id: "responsibility-one", companyId, type: "responsibility.contracts.replaced",
    occurredAt: "2026-08-24T00:15:00.000Z", actorId: "human-one", provenance: "PRODUCTION", payload: {
      revision: 1, contracts: [{ id: "contract-one", companyId, agentId: "agent-one",
        accountableHumanId: "human-one", backupHumanId: null, autonomyLevel: 2,
        allowedActions: ["read-knowledge"], approvalRequiredActions: [], escalationTimeoutSeconds: null, status: "ACTIVE" }],
    } }, 1);
  let id = 0;
  const result = await new TransferAgentResponsibility({ identity, events,
    now: () => "2026-08-24T01:00:00.000Z", nextId: () => `transfer-${++id}` }).execute({
    companyId, agentId: "agent-one", newAccountableHumanId: "human-two", newBackupHumanId: "human-one",
    expectedResponsibilityRevision: 1, reason: "Research now reports to the research lead",
  });
  assert.equal(result.organization.agents[0]?.accountableHumanId, "human-two");
  assert.equal(result.responsibilitySnapshot.contracts[0]?.accountableHumanId, "human-two");
  assert.equal(result.responsibilitySnapshot.contracts[0]?.backupHumanId, "human-one");
  const projected = await new EventBackedOrganizationPrincipalStore(events).load(companyId);
  assert.deepEqual(projected?.reportingLines, [{ subordinatePositionId: "position-agent", managerPositionId: "position-two" }]);
  assert.equal((await new EventBackedResponsibilityContractStore(events, () => "unused").load(companyId)).revision, 2);
  assert.match(JSON.stringify((await events.read(companyId)).at(-1)?.payload), /Research now reports/);
});

test("responsibility transfer is revision-fenced and blocked by an unresolved exact approval", async () => {
  const events = new InMemoryEventStore();
  const organization = { ...initial.organization,
    humans: [...initial.organization.humans, { id: "human-two", name: "Jordan", title: "Lead",
      departmentId: "department-one", avatarId: "human-default" }],
    agents: [{ id: "agent-one", name: "Researcher", role: "Research", departmentId: "department-one",
      accountableHumanId: "human-one", runtimeConnectorId: "connector-one", avatarId: "fish-bumble", autonomyLevel: 2 }] };
  const structure: CompanyStructure = { ...initial, organization,
    positions: [...initial.positions, { id: "position-two", title: "Lead", departmentId: "department-one",
      principalId: "human-two", accountableHumanId: "human-two" }, { id: "position-agent", title: "Research",
      departmentId: "department-one", principalId: "agent-one", accountableHumanId: "human-one" }],
    reportingLines: [{ subordinatePositionId: "position-agent", managerPositionId: "position-one" }] };
  await events.append({ id: "organization-one", companyId, type: "organization.registered", occurredAt: "2026-08-24T00:00:00.000Z",
    actorId: "human-one", payload: { structure }, provenance: "PRODUCTION" });
  await events.append({ id: "responsibility-one", companyId, type: "responsibility.contracts.replaced",
    occurredAt: "2026-08-24T00:15:00.000Z", actorId: "human-one", provenance: "PRODUCTION", payload: {
      revision: 1, contracts: [{ id: "contract-one", companyId, agentId: "agent-one", accountableHumanId: "human-one",
        backupHumanId: null, autonomyLevel: 2, allowedActions: ["read-knowledge"], approvalRequiredActions: [],
        escalationTimeoutSeconds: null, status: "ACTIVE" }],
    } }, 1);
  await events.append({ id: "approval-one", companyId, type: "approval.publication.requested",
    occurredAt: "2026-08-24T00:30:00.000Z", actorId: "system", provenance: "PRODUCTION", payload: { request: {
      id: "approval-one", companyId, binding: { executingAgentId: "agent-one" },
    } } }, 2);
  const service = new TransferAgentResponsibility({ identity, events,
    now: () => "2026-08-24T01:00:00.000Z", nextId: () => "transfer-one" });
  const input = { companyId, agentId: "agent-one", newAccountableHumanId: "human-two",
    newBackupHumanId: null, expectedResponsibilityRevision: 1, reason: "New reporting owner" };
  await assert.rejects(service.execute(input), /RESPONSIBILITY_TRANSFER_PENDING_APPROVAL/);
  await assert.rejects(service.execute({ ...input, expectedResponsibilityRevision: 0 }),
    /RESPONSIBILITY_CONTRACT_REVISION_CONFLICT/);
});

test("company profile update is compare-and-swap and preserves responsibility state", async () => {
  const events = new InMemoryEventStore();
  await events.append({ id: "event-one", companyId, type: "organization.registered",
    occurredAt: "2026-08-24T00:00:00.000Z", actorId: "human-one",
    payload: { structure: initial }, provenance: "PRODUCTION" });
  let id = 0;
  const service = new UpdateCompanyProfile({ identity, events,
    profileStore: { async updateCompanyProfileAtomically(input) {
      await events.append(input.event, input.expectedEventSequence);
    } },
    now: () => "2026-08-24T02:00:00.000Z", nextId: () => `profile-${++id}` });
  const result = await service.execute({ companyId,
    expected: { name: "Acme", purpose: "Serve customers", locale: "en" },
    next: { name: "Acme Operations", purpose: "Serve customers safely", locale: "en-US" },
  });
  assert.deepEqual(result.company, { id: companyId, name: "Acme Operations",
    purpose: "Serve customers safely", locale: "en-US" });
  const last = (await events.read(companyId)).at(-1)!;
  assert.deepEqual((last.payload as { responsibilitySnapshot: unknown }).responsibilitySnapshot,
    { revision: 0, contracts: [] });
  await assert.rejects(service.execute({ companyId,
    expected: { name: "Acme", purpose: "Serve customers", locale: "en" },
    next: { name: "Stale", purpose: "Stale", locale: "en" },
  }), /COMPANY_PROFILE_REVISION_CONFLICT/);
});

test("department archive atomically rehomes principals, positions, workspaces, and project scope", async () => {
  const events = new InMemoryEventStore();
  const structure: CompanyStructure = { ...initial,
    organization: { ...initial.organization,
      departments: [...initial.organization.departments,
        { id: "department-two", name: "Delivery", mandate: "Deliver" }] },
    projects: [{ id: "project-one", name: "Launch", departmentIds: ["department-one", "department-two"],
      ownerHumanId: "human-one" }],
    workspaces: [{ id: "workspace-one", name: "Operations workspace", projectId: null,
      departmentId: "department-one" }],
  };
  await events.append({ id: "event-one", companyId, type: "organization.registered",
    occurredAt: "2026-08-24T00:00:00.000Z", actorId: "human-one", payload: { structure },
    provenance: "PRODUCTION" });
  await events.append({ id: "planning-one", companyId, type: "planning.catalog.replaced",
    occurredAt: "2026-08-24T00:30:00.000Z", actorId: "human-one", provenance: "PRODUCTION",
    payload: { catalog: { companyId, revision: 1, goals: [], projects: [{ id: "planned-project",
      companyId, goalIds: [], name: "Department migration", description: null, status: "completed",
      leadAgentId: null, accountableHumanId: "human-one", departmentIds: ["department-one"],
      targetDate: null, archivedAt: null, createdAt: "2026-08-24T00:00:00.000Z",
      updatedAt: "2026-08-24T00:00:00.000Z" }] } } }, 1);
  let id = 0;
  const service = new ArchiveDepartment({ identity, events,
    now: () => "2026-08-24T03:00:00.000Z", nextId: () => `archive-${++id}` });
  const organization = await service.execute({ companyId, departmentId: "department-one",
    destinationDepartmentId: "department-two", expectedResponsibilityRevision: 0,
    reason: "Consolidate operations into delivery" });
  assert.deepEqual(organization.departments.map(({ id: value }) => value), ["department-two"]);
  assert.equal(organization.humans[0]?.departmentId, "department-two");
  const next = (await events.read(companyId)).at(-1)!;
  const projected = (next.payload as { structure: CompanyStructure }).structure;
  assert.deepEqual(projected.projects[0]?.departmentIds, ["department-two"]);
  assert.equal(projected.workspaces[0]?.departmentId, "department-two");
  assert.equal(projected.positions[0]?.departmentId, "department-two");
  const planning = await new EventBackedPlanningStore(events, () => "unused").load(companyId);
  assert.equal(planning.revision, 2);
  assert.deepEqual(planning.projects[0]?.departmentIds, ["department-two"]);
});

test("department archive refuses active Work instead of changing its organizational scope", async () => {
  const events = new InMemoryEventStore();
  const organization = { ...initial.organization,
    departments: [...initial.organization.departments,
      { id: "department-two", name: "Delivery", mandate: "Deliver" }],
    agents: [{ id: "agent-one", name: "Runner", role: "Run", departmentId: "department-one",
      accountableHumanId: "human-one", runtimeConnectorId: "connector-one", avatarId: "fish-bumble", autonomyLevel: 1 }] };
  const structure: CompanyStructure = { ...initial, organization,
    positions: [...initial.positions, { id: "position-agent", title: "Run", departmentId: "department-one",
      principalId: "agent-one", accountableHumanId: "human-one" }],
    reportingLines: [{ subordinatePositionId: "position-agent", managerPositionId: "position-one" }] };
  await events.append({ id: "event-one", companyId, type: "organization.registered",
    occurredAt: "2026-08-24T00:00:00.000Z", actorId: "human-one", payload: { structure }, provenance: "PRODUCTION" });
  await events.append({ id: "work-one", companyId, type: "work.dispatched", occurredAt: "2026-08-24T01:00:00.000Z",
    actorId: "human-one", provenance: "PRODUCTION", payload: { work: { id: "work-one", agentId: "agent-one" } } }, 1);
  await events.append({ id: "attempt-event", companyId, type: "work-attempt.recorded",
    occurredAt: "2026-08-24T01:01:00.000Z", actorId: "connector-one", provenance: "PRODUCTION",
    payload: { attempt: { id: "attempt-one", workId: "work-one", status: "RUNNING" } } }, 2);
  await assert.rejects(new ArchiveDepartment({ identity, events, now: () => "2026-08-24T03:00:00.000Z",
    nextId: () => "archive-one" }).execute({ companyId, departmentId: "department-one",
    destinationDepartmentId: "department-two", expectedResponsibilityRevision: 0, reason: "Consolidate" }),
  /DEPARTMENT_ARCHIVE_ACTIVE_WORK/);
});
