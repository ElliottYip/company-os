import assert from "node:assert/strict";
import test from "node:test";

import { EventBackedAgentLifecycleStore } from "../adapters/storage/event-backed-agent-lifecycle-store.ts";
import { EventBackedAgentRuntimeBindingStore } from "../adapters/storage/event-backed-agent-runtime-binding-store.ts";
import { EventBackedConnectorCatalogStore } from "../adapters/storage/event-backed-connector-catalog-store.ts";
import { EventBackedOrganizationPrincipalStore } from "../adapters/storage/event-backed-organization-principal-store.ts";
import { EventBackedResponsibilityContractStore } from "../adapters/storage/event-backed-responsibility-contract-store.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { ManageAgentRuntimeBinding } from "../application/manage-agent-runtime-binding.ts";
import { Sha256ConnectorRuntimeSecurity } from "../adapters/connectors/sha256-connector-runtime-security.ts";
import type { CompanyStructure } from "../core/company-structure.ts";
import type { AgentExecutionPort } from "../ports/agent-execution-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

const companyId = "company-one";
const structure: CompanyStructure = {
  organization: {
    company: { id: companyId, name: "Acme", purpose: "Operate safely", locale: "en" },
    departments: [{ id: "department-one", name: "Operations", mandate: "Operate" }],
    humans: [{ id: "human-one", name: "Alex", title: "Owner", departmentId: "department-one", avatarId: "human-default" }],
    agents: [{ id: "agent-one", name: "Researcher", role: "Research", departmentId: "department-one",
      accountableHumanId: "human-one", runtimeConnectorId: "connector-unbound", avatarId: "fish-bumble", autonomyLevel: 2 }],
  },
  projects: [],
  workspaces: [{ id: "workspace-one", name: "Operations", projectId: null, departmentId: "department-one" }],
  positions: [
    { id: "position-human", title: "Owner", departmentId: "department-one", principalId: "human-one", accountableHumanId: "human-one" },
    { id: "position-agent", title: "Research", departmentId: "department-one", principalId: "agent-one", accountableHumanId: "human-one" },
  ],
  reportingLines: [{ subordinatePositionId: "position-agent", managerPositionId: "position-human" }],
};

function harness(health: "HEALTHY" | "DEGRADED" | "UNAVAILABLE" = "HEALTHY") {
  const events = new InMemoryEventStore();
  let id = 0;
  const nextId = () => `generated-${++id}`;
  const identity: IdentityPort = {
    async getCurrentIdentity() { return { actorId: "human-one", organizationId: companyId,
      displayName: "Alex", assurance: "ENTERPRISE_ASSERTED" }; },
    async currentPrincipal() { return { id: "human-one", kind: "HUMAN", displayName: "Alex" }; },
    async authorize() { return { id: `receipt-${++id}`, principalId: "human-one",
      authorizedAt: "2026-09-05T08:00:00.000Z" }; },
  };
  const execution: AgentExecutionPort = {
    async capabilities() { return { connectorId: "connector-one", displayName: "Customer Runtime",
      protocolVersion: "1.0", supportsPause: true, supportsResume: true,
      supportsCancellation: true, supportsEvidence: true, maximumTimeoutSeconds: 900 }; },
    async health() { return health; }, async deploy() { throw new Error("unused"); },
    async submit() { throw new Error("unused"); }, async observe() { return []; },
    async pause() {}, async resume() {}, async cancel() {},
  };
  const organization = new EventBackedOrganizationPrincipalStore(events);
  const lifecycle = new EventBackedAgentLifecycleStore(events, nextId);
  const connectors = new EventBackedConnectorCatalogStore(events, nextId);
  const responsibilities = new EventBackedResponsibilityContractStore(events, nextId);
  const bindings = new EventBackedAgentRuntimeBindingStore(events, nextId);
  const service = new ManageAgentRuntimeBinding({
    identity, events, structure: organization, lifecycle, connectors, responsibilities,
    bindings, executionPorts: [execution], runtimeSecurity: new Sha256ConnectorRuntimeSecurity(),
    now: () => "2026-09-05T08:00:00.000Z",
  });
  return { events, connectors, bindings, organization, service };
}

async function seed(h: ReturnType<typeof harness>, status: "ENABLED" | "DISABLED" = "ENABLED") {
  await h.events.append({ id: "organization-one", companyId, type: "organization.registered",
    occurredAt: "2026-09-05T07:00:00.000Z", actorId: "human-one",
    payload: { structure, responsibilitySnapshot: { revision: 0, contracts: [] } }, provenance: "PRODUCTION" });
  await h.connectors.replace({ companyId, actorId: "human-one", expectedRevision: 0,
    recordedAt: "2026-09-05T07:30:00.000Z", connectors: [{
      id: "connector-one", companyId, displayName: "Customer Runtime", protocolVersion: "1.0",
      operations: ["SUBMIT", "PROGRESS", "RESULT", "PAUSE", "RESUME", "CANCEL", "EVIDENCE"],
      maximumTimeoutSeconds: 900, executionResidency: "CUSTOMER_ENVIRONMENT",
      secretReferenceId: null, status,
    }] });
}

test("a reviewed late-binding command updates both the binding history and current Agent projection", async () => {
  const h = harness();
  await seed(h);
  const result = await h.service.execute({ companyId, agentId: "agent-one", operation: "BIND",
    connectorId: "connector-one", expectedRevision: 0, reason: "Connect approved customer runtime" });
  assert.equal(result.binding.status, "BOUND_UNVERIFIED");
  assert.equal(result.binding.revision, 1);
  assert.match(result.binding.capabilityDigest ?? "", /^sha256:[a-f0-9]{64}$/);
  assert.equal((await h.organization.getOrganization(companyId))?.agents[0]?.runtimeConnectorId, "connector-one");
  assert.equal((await h.bindings.load(companyId)).bindings[0]?.connectorId, "connector-one");
  const event = (await h.events.read(companyId)).at(-1)!;
  assert.equal(event.type, "organization.revised");
  assert.equal((event.payload as { agentRuntimeBindingChange: { reason: string } }).agentRuntimeBindingChange.reason,
    "Connect approved customer runtime");
});

test("late binding fails closed for disabled or unavailable runtimes", async () => {
  const disabled = harness();
  await seed(disabled, "DISABLED");
  await assert.rejects(disabled.service.execute({ companyId, agentId: "agent-one", operation: "BIND",
    connectorId: "connector-one", expectedRevision: 0, reason: "Connect runtime" }),
  /AGENT_CONNECTOR_DISABLED/);

  const unavailable = harness("UNAVAILABLE");
  await seed(unavailable);
  await assert.rejects(unavailable.service.execute({ companyId, agentId: "agent-one", operation: "BIND",
    connectorId: "connector-one", expectedRevision: 0, reason: "Connect runtime" }),
  /AGENT_EXECUTION_PORT_UNAVAILABLE/);
});

test("rebind is denied while the Agent has non-terminal Work", async () => {
  const h = harness();
  await seed(h);
  await h.service.execute({ companyId, agentId: "agent-one", operation: "BIND",
    connectorId: "connector-one", expectedRevision: 0, reason: "Initial runtime" });
  const sequence = (await h.events.read(companyId)).length;
  await h.events.append({ id: "work-one", companyId, type: "work.dispatched",
    occurredAt: "2026-09-05T08:01:00.000Z", actorId: "human-one", provenance: "PRODUCTION",
    payload: { work: { id: "work-one", agentId: "agent-one" } } }, sequence);
  await h.events.append({ id: "attempt-one", companyId, type: "work-attempt.recorded",
    occurredAt: "2026-09-05T08:02:00.000Z", actorId: "connector-one", provenance: "PRODUCTION",
    payload: { attempt: { id: "attempt-one", workId: "work-one", status: "RUNNING" } } }, sequence + 1);
  await assert.rejects(h.service.execute({ companyId, agentId: "agent-one", operation: "UNBIND",
    connectorId: null, expectedRevision: 1, reason: "Disconnect runtime" }), /AGENT_RUNTIME_BINDING_ACTIVE_WORK/);
});
