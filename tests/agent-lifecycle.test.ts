import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateAgentWorkEligibility,
  transitionAgentLifecycle,
  type AgentLifecycleRecord,
} from "../core/agent-lifecycle.ts";
import { ManageAgentLifecycle } from "../application/manage-agent-lifecycle.ts";
import { EventBackedAgentLifecycleStore } from "../adapters/storage/event-backed-agent-lifecycle-store.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import type { CompanyStructure } from "../core/company-structure.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { AgentExecutionPort } from "../ports/agent-execution-port.ts";

const now = "2026-08-24T12:00:00.000Z";
const pending: AgentLifecycleRecord = {
  companyId: "company-one", agentId: "agent-one", status: "pending_approval",
  pauseReason: null, pausedAt: null, errorCode: null, updatedAt: now,
};

test("Paperclip-aligned lifecycle keeps paused Agents assignable but not invokable", () => {
  const paused = { id: "agent-one", companyId: "company-one", name: "Agent One", status: "paused", reportsToAgentId: null };
  assert.deepEqual(evaluateAgentWorkEligibility(paused, [paused]), {
    assignable: true,
    invokable: false,
    assignabilityReason: "eligible",
    invokabilityReason: "paused",
    orgChainHealth: {
      status: "healthy", reason: "healthy", firstInvalidAgentId: null, pausedAncestorIds: [],
    },
  });
  for (const status of ["pending_approval", "terminated"]) {
    const agent = { ...paused, status };
    const result = evaluateAgentWorkEligibility(agent, [agent]);
    assert.equal(result.assignable, false);
    assert.equal(result.invokable, false);
    assert.equal(result.assignabilityReason, status);
  }
});

test("terminated Agent managers invalidate descendants while paused managers only warn", () => {
  const child = { id: "agent-child", companyId: "company-one", name: "Child", status: "idle", reportsToAgentId: "agent-manager" };
  const terminated = { id: "agent-manager", companyId: "company-one", name: "Manager", status: "terminated", reportsToAgentId: null };
  const invalid = evaluateAgentWorkEligibility(child, [child, terminated]);
  assert.equal(invalid.invokable, false);
  assert.equal(invalid.orgChainHealth.reason, "terminated_ancestor");
  assert.equal(invalid.orgChainHealth.firstInvalidAgentId, "agent-manager");

  const paused = { ...terminated, status: "paused" };
  const warned = evaluateAgentWorkEligibility(child, [child, paused]);
  assert.equal(warned.invokable, true);
  assert.deepEqual(warned.orgChainHealth.pausedAncestorIds, ["agent-manager"]);
});

test("pending Agent admission is explicit and terminal state cannot be reversed", () => {
  const approved = transitionAgentLifecycle(pending, "APPROVE", "2026-08-24T12:01:00.000Z");
  assert.equal(approved.status, "idle");
  const paused = transitionAgentLifecycle(approved, "PAUSE", "2026-08-24T12:02:00.000Z", "manual");
  assert.equal(paused.status, "paused");
  assert.equal(transitionAgentLifecycle(paused, "RESUME", "2026-08-24T12:03:00.000Z").status, "idle");
  const terminated = transitionAgentLifecycle(approved, "TERMINATE", "2026-08-24T12:04:00.000Z");
  assert.throws(() => transitionAgentLifecycle(terminated, "RESUME", now), /AGENT_TERMINATED/);
  assert.throws(() => transitionAgentLifecycle(pending, "RESUME", now), /AGENT_PENDING_APPROVAL/);
});

const structure: CompanyStructure = {
  organization: {
    company: { id: "company-one", name: "Company One", purpose: "Operate", locale: "en-US" },
    departments: [{ id: "operations", name: "Operations", mandate: "Operate" }],
    humans: [{ id: "human-one", name: "Alex", title: "Owner", departmentId: "operations", avatarId: "human-default" }],
    agents: [{
      id: "agent-one", name: "Agent One", role: "Operator", departmentId: "operations",
      accountableHumanId: "human-one", runtimeConnectorId: "connector-one",
      avatarId: "fish-one", autonomyLevel: 2,
    }],
  },
  projects: [], workspaces: [],
  positions: [
    { id: "position-human", title: "Owner", departmentId: "operations", principalId: "human-one", accountableHumanId: "human-one" },
    { id: "position-agent", title: "Operator", departmentId: "operations", principalId: "agent-one", accountableHumanId: "human-one" },
  ],
  reportingLines: [{ subordinatePositionId: "position-agent", managerPositionId: "position-human" }],
};

function identity(): IdentityPort {
  return {
    async getCurrentIdentity() {
      return { actorId: "human-one", organizationId: "company-one", displayName: "Alex", assurance: "ENTERPRISE_ASSERTED" };
    },
    async currentPrincipal() { return { id: "human-one", kind: "HUMAN", displayName: "Alex" }; },
    async authorize(intent) {
      assert.equal(intent.action, "agent:approve");
      return { id: "receipt-one", principalId: "human-one", authorizedAt: now };
    },
  };
}

function executionPort(
  health: "HEALTHY" | "DEGRADED" | "UNAVAILABLE" = "HEALTHY",
): AgentExecutionPort {
  return {
    async capabilities() {
      return {
        connectorId: "connector-one", displayName: "Enterprise Agent", protocolVersion: "1.0",
        supportsPause: true, supportsResume: true, supportsCancellation: true,
        supportsEvidence: true, maximumTimeoutSeconds: 600,
      };
    },
    async health() { return health; },
    async deploy(agent) { return { id: "deployment-one", agentId: agent.id, connectorId: "connector-one" }; },
    async submit() { return { accepted: true, executionId: "execution-one" }; },
    async observe() { return []; },
    async pause() {}, async resume() {}, async cancel() {},
  };
}

test("formal Agent approval requires a registered enabled Connector and persists one revision", async () => {
  const events = new InMemoryEventStore();
  await events.append({
    id: "event-org", companyId: "company-one", type: "organization.registered",
    occurredAt: now, actorId: "human-one", payload: { structure }, provenance: "PRODUCTION",
  }, 0);
  let id = 0;
  const lifecycle = new EventBackedAgentLifecycleStore(events, () => `event-life-${++id}`);
  const service = new ManageAgentLifecycle({
    identity: identity(),
    structure: { async load() { return structure; } },
    lifecycle,
    connectors: {
      async load() { return { revision: 1, connectors: [{
        id: "connector-one", companyId: "company-one", displayName: "Enterprise Agent",
        protocolVersion: "1.0", operations: ["SUBMIT", "PROGRESS", "RESULT"],
        maximumTimeoutSeconds: 600, executionResidency: "CUSTOMER_ENVIRONMENT",
        secretReferenceId: null, status: "ENABLED",
      }] }; },
      async replace() { throw new Error("not used"); },
    },
    executionPorts: [executionPort()],
    now: () => "2026-08-24T12:01:00.000Z",
  });
  assert.equal((await lifecycle.load("company-one")).agents[0]?.status, "pending_approval");
  const result = await service.execute({
    companyId: "company-one", agentId: "agent-one", operation: "APPROVE", expectedRevision: 0,
  });
  assert.equal(result.revision, 1);
  assert.equal(result.agents[0]?.status, "idle");
  assert.equal((await lifecycle.load("company-one")).agents[0]?.status, "idle");
});

test("formal Agent approval fails closed when its Connector is absent", async () => {
  const service = new ManageAgentLifecycle({
    identity: identity(), structure: { async load() { return structure; } },
    lifecycle: {
      async load() { return { revision: 0, agents: [pending] }; },
      async transition() { throw new Error("must not persist"); },
    },
    connectors: {
      async load() { return { revision: 0, connectors: [] }; },
      async replace() { throw new Error("not used"); },
    },
    executionPorts: [],
    now: () => now,
  });
  await assert.rejects(service.execute({
    companyId: "company-one", agentId: "agent-one", operation: "APPROVE", expectedRevision: 0,
  }), /AGENT_CONNECTOR_NOT_REGISTERED/);
});

test("formal Agent approval requires a live execution port, not catalog metadata alone", async () => {
  const connectorCatalog = {
    async load() { return { revision: 1, connectors: [{
      id: "connector-one", companyId: "company-one", displayName: "Enterprise Agent",
      protocolVersion: "1.0" as const, operations: ["SUBMIT", "PROGRESS", "RESULT"] as const,
      maximumTimeoutSeconds: 600, executionResidency: "CUSTOMER_ENVIRONMENT" as const,
      secretReferenceId: null, status: "ENABLED" as const,
    }] }; },
    async replace() { throw new Error("not used"); },
  };
  const lifecycle = {
    async load() { return { revision: 0, agents: [pending] }; },
    async transition() { throw new Error("must not persist"); },
  };
  const common = {
    identity: identity(), structure: { async load() { return structure; } }, lifecycle,
    connectors: connectorCatalog, now: () => now,
  };
  await assert.rejects(new ManageAgentLifecycle({ ...common, executionPorts: [] }).execute({
    companyId: "company-one", agentId: "agent-one", operation: "APPROVE", expectedRevision: 0,
  }), /AGENT_EXECUTION_PORT_NOT_REGISTERED/);
  await assert.rejects(new ManageAgentLifecycle({ ...common, executionPorts: [executionPort("UNAVAILABLE")] }).execute({
    companyId: "company-one", agentId: "agent-one", operation: "APPROVE", expectedRevision: 0,
  }), /AGENT_EXECUTION_PORT_UNAVAILABLE/);
});
