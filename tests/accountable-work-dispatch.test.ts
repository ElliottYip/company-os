import assert from "node:assert/strict";
import test from "node:test";
import { DispatchAccountableWork } from "../application/dispatch-accountable-work.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import type { GenericWorkPort } from "../ports/generic-work-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { ResponsibilityContractPort } from "../ports/responsibility-contract-port.ts";
import { DEMO_COMPANY } from "../adapters/demo/demo-company.ts";
import type { CompanyStructure } from "../core/company-structure.ts";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import { EventBackedGenericWorkStore } from "../adapters/storage/event-backed-generic-work-store.ts";
import { Sha256ConnectorRuntimeSecurity } from "../adapters/connectors/sha256-connector-runtime-security.ts";
import { ScheduleWorkAttempt } from "../application/schedule-work-attempt.ts";
import { DeliverConnectorCommands } from "../application/deliver-connector-commands.ts";
import { WorkAttemptService } from "../application/work-attempt-service.ts";
import type { AgentExecutionPort } from "../ports/agent-execution-port.ts";
import { PrepareWorkExecution } from "../application/prepare-work-execution.ts";

const structure: CompanyStructure = {
  organization: DEMO_COMPANY, projects: [], workspaces: [],
  positions: [
    ...DEMO_COMPANY.humans.map((human) => ({
      id: `position-${human.id}`, title: human.title, departmentId: human.departmentId,
      principalId: human.id, accountableHumanId: human.id,
    })),
    ...DEMO_COMPANY.agents.map((agent) => ({
      id: `position-${agent.id}`, title: agent.role, departmentId: agent.departmentId,
      principalId: agent.id, accountableHumanId: agent.accountableHumanId,
    })),
  ],
  reportingLines: DEMO_COMPANY.agents.map((agent) => ({
    subordinatePositionId: `position-${agent.id}`,
    managerPositionId: `position-${agent.accountableHumanId}`,
  })),
};

const lifecycleDependencies = {
  maintenance: { async load() { return { schemaVersion: 1 as const, mode: "OPEN" as const,
    revision: 0, operationId: null, authorizationReference: null,
    changedBy: null, changedAt: null }; } },
  structure: { async load() { return structure; } },
  lifecycle: {
    async load() { return { revision: 1, agents: DEMO_COMPANY.agents.map((agent) => ({
      companyId: "demo-company", agentId: agent.id, status: "idle" as const,
      pauseReason: null, pausedAt: null, errorCode: null, updatedAt: "2026-08-18T09:00:00.000Z",
    })) }; },
    async transition() { throw new Error("not used"); },
  },
};

test("formal dispatch fails before product side effects while instance dispatch is frozen", async () => {
  const events = new InMemoryEventStore();
  let organizationCalls = 0;
  const service = new DispatchAccountableWork({
    identity: identity(),
    organization: { async getOrganization() { organizationCalls += 1; return DEMO_COMPANY; },
      async listPrincipals() { return []; } },
    contracts: responsibilities,
    genericWork: { async createWork() { throw new Error("must not run"); } } as unknown as GenericWorkPort,
    events,
    structure: lifecycleDependencies.structure,
    lifecycle: lifecycleDependencies.lifecycle,
    maintenance: { async load() { return { schemaVersion: 1, mode: "DISPATCH_FROZEN",
      revision: 3, operationId: "upgrade-staging-01", authorizationReference: "change:approved-01",
      changedBy: "instance-admin", changedAt: "2026-08-26T18:00:00.000Z" }; } },
    now: () => "2026-08-26T18:01:00.000Z", nextId: () => "unused-event",
  });
  await assert.rejects(service.execute({ draft: draft(), genericGoalId: null }), /INSTANCE_DISPATCH_FROZEN/);
  assert.equal(organizationCalls, 0);
  assert.equal((await events.read("demo-company")).length, 0);
});

const acceptanceMaintenance = {
  schemaVersion: 1 as const,
  mode: "ACCEPTANCE_ONLY" as const,
  revision: 2,
  operationId: "upgrade-staging-01",
  authorizationReference: "acceptance:approved-rc4-01",
  acceptance: {
    planId: "acceptance-plan-rc4",
    planDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
    work: [{ companyId: "demo-company", workId: "work-accountable" }],
  },
  changedBy: "instance-admin",
  changedAt: "2026-08-26T18:00:00.000Z",
};

test("acceptance-only mode rejects ordinary dispatch before product side effects", async () => {
  let organizationCalls = 0;
  const events = new InMemoryEventStore();
  const service = new DispatchAccountableWork({
    identity: identity(),
    organization: { async getOrganization() { organizationCalls += 1; return DEMO_COMPANY; },
      async listPrincipals() { return []; } },
    contracts: responsibilities,
    genericWork: { async createWork() { throw new Error("must not run"); } } as unknown as GenericWorkPort,
    events, structure: lifecycleDependencies.structure, lifecycle: lifecycleDependencies.lifecycle,
    maintenance: { async load() { return acceptanceMaintenance; } },
    instanceAccess: { async isInstanceAdmin() { return true; } },
    now: () => "2026-08-26T18:01:00.000Z", nextId: () => "unused-event",
  });
  await assert.rejects(service.execute({ draft: draft(), genericGoalId: null }),
    /INSTANCE_ACCEPTANCE_CONTEXT_REQUIRED/);
  assert.equal(organizationCalls, 0);
  assert.equal((await events.read("demo-company")).length, 0);
});

test("acceptance-only mode admits one allowlisted Work and records its exact scope", async () => {
  const events = new InMemoryEventStore();
  let genericCalls = 0;
  let id = 0;
  const service = new DispatchAccountableWork({
    identity: identity(),
    organization: { async getOrganization() { return DEMO_COMPANY; }, async listPrincipals() { return []; } },
    contracts: responsibilities,
    genericWork: {
      async createWork(input) { genericCalls += 1; return { ok: true, value: {
        id: input.id, companyId: input.companyId, title: input.title, goalId: input.goalId,
        assigneeId: input.assigneeId, status: "READY", createdAt: "2026-08-26T18:01:00.000Z",
        updatedAt: "2026-08-26T18:01:00.000Z",
      } }; },
    } as unknown as GenericWorkPort,
    events, structure: lifecycleDependencies.structure, lifecycle: lifecycleDependencies.lifecycle,
    maintenance: { async load() { return acceptanceMaintenance; } },
    instanceAccess: { async isInstanceAdmin(actorId) { return actorId === "demo-boss"; } },
    now: () => "2026-08-26T18:01:00.000Z", nextId: () => `acceptance-event-${++id}`,
  });
  const result = await service.execute({ draft: draft(), genericGoalId: null, acceptance: {
    operationId: "upgrade-staging-01", planId: "acceptance-plan-rc4",
    authorizationReference: "acceptance:approved-rc4-01",
  } });
  assert.equal(result.genericWork.status, "READY");
  assert.equal(genericCalls, 1);
  const recorded = await events.read("demo-company");
  assert.deepEqual(recorded.map(({ type }) => type), [
    "work.acceptance-scope-authorized", "work.dispatch-requested", "work.dispatched",
  ]);
  assert.deepEqual(recorded[0]?.payload, {
    workId: "work-accountable",
    operationId: "upgrade-staging-01",
    planId: "acceptance-plan-rc4",
    planDigest: acceptanceMaintenance.acceptance.planDigest,
    authorizationReference: "acceptance:approved-rc4-01",
    maintenanceRevision: 2,
  });
});

test("acceptance-only scope fails closed for mismatched authority, Work, and administrator", async () => {
  const build = (maintenance = acceptanceMaintenance, admin = true) => new DispatchAccountableWork({
    identity: identity(),
    organization: { async getOrganization() { throw new Error("must not run"); },
      async listPrincipals() { return []; } },
    contracts: responsibilities,
    genericWork: { async createWork() { throw new Error("must not run"); } } as unknown as GenericWorkPort,
    events: new InMemoryEventStore(), structure: lifecycleDependencies.structure,
    lifecycle: lifecycleDependencies.lifecycle, maintenance: { async load() { return maintenance; } },
    instanceAccess: { async isInstanceAdmin() { return admin; } },
    now: () => "2026-08-26T18:01:00.000Z", nextId: () => "unused-event",
  });
  await assert.rejects(build().execute({ draft: draft(), genericGoalId: null, acceptance: {
    operationId: "upgrade-staging-01", planId: "acceptance-plan-rc4",
    authorizationReference: "acceptance:wrong-authority",
  } }), /INSTANCE_ACCEPTANCE_BINDING_MISMATCH/);
  await assert.rejects(build({ ...acceptanceMaintenance, acceptance: {
    ...acceptanceMaintenance.acceptance,
    work: [{ companyId: "demo-company", workId: "different-work" }],
  } }).execute({ draft: draft(), genericGoalId: null, acceptance: {
    operationId: "upgrade-staging-01", planId: "acceptance-plan-rc4",
    authorizationReference: "acceptance:approved-rc4-01",
  } }), /INSTANCE_ACCEPTANCE_WORK_NOT_AUTHORIZED/);
  await assert.rejects(build(acceptanceMaintenance, false).execute({
    draft: draft(), genericGoalId: null, acceptance: {
      operationId: "upgrade-staging-01", planId: "acceptance-plan-rc4",
      authorizationReference: "acceptance:approved-rc4-01",
    },
  }), /INSTANCE_ADMIN_REQUIRED/);
});

function identity(actorId = "demo-boss", companyId = "demo-company"): IdentityPort {
  return {
    async getCurrentIdentity() {
      return { actorId, organizationId: companyId, displayName: "Boss", assurance: "ENTERPRISE_ASSERTED" };
    },
    async currentPrincipal() { return { id: actorId, kind: "HUMAN", displayName: "Boss" }; },
    async authorize() {
      return { id: "receipt-work", principalId: actorId, authorizedAt: "2026-08-18T09:00:00.000Z" };
    },
  };
}

const responsibilities: ResponsibilityContractPort = {
  async load() {
    return {
      revision: 1,
      contracts: [{
        id: "demo-contract-researcher",
        companyId: "demo-company",
        agentId: "demo-researcher",
        accountableHumanId: "demo-boss",
        backupHumanId: null,
        autonomyLevel: 2,
        allowedActions: ["read-knowledge", "publish-content"],
        approvalRequiredActions: ["publish-content"],
        escalationTimeoutSeconds: null,
        status: "ACTIVE",
      }, {
        id: "demo-contract-operator",
        companyId: "demo-company",
        agentId: "demo-operator",
        accountableHumanId: "demo-boss",
        backupHumanId: null,
        autonomyLevel: 1,
        allowedActions: ["read-knowledge"],
        approvalRequiredActions: [],
        escalationTimeoutSeconds: null,
        status: "ACTIVE",
      }],
    };
  },
  async replace() { throw new Error("not used"); },
};

function draft() {
  return {
    id: "work-accountable",
    companyId: "demo-company",
    title: "Prepare accountable brief",
    goal: "Produce evidence and pause before publishing the approved brief.",
    scope: "agent" as const,
    departmentId: "operations",
    projectId: null,
    agentId: "demo-researcher",
    requestedBy: "demo-boss",
    actionIds: ["read-knowledge", "publish-content"] as const,
    parentWorkId: null,
  };
}

test("formal work reaches the Company OS work system only after human responsibility checks", async () => {
  const calls: unknown[] = [];
  const genericWork: GenericWorkPort = {
    async createWork(input) {
      calls.push(input);
      return { ok: true, value: {
        id: input.id,
        companyId: input.companyId,
        title: input.title,
        goalId: input.goalId,
        assigneeId: input.assigneeId,
        status: "READY",
        createdAt: "2026-08-18T09:00:00.000Z",
        updatedAt: "2026-08-18T09:00:00.000Z",
      } };
    },
    async getWork() { throw new Error("not used"); },
    async listWork() { throw new Error("not used"); },
    async cancelRun() { throw new Error("not used"); },
    async listRunEvents() { throw new Error("not used"); },
  };
  const events = new InMemoryEventStore();
  let id = 0;
  const service = new DispatchAccountableWork({
    identity: identity(),
    organization: {
      async getOrganization() { return DEMO_COMPANY; },
      async listPrincipals() { return []; },
    },
    contracts: responsibilities,
    genericWork,
    events,
    ...lifecycleDependencies,
    now: () => "2026-08-18T09:00:00.000Z",
    nextId: () => `dispatch-event-${++id}`,
  });

  const result = await service.execute({ draft: draft(), genericGoalId: null });
  assert.equal(result.work.accountableHumanId, "demo-boss");
  assert.equal(result.genericWork.status, "READY");
  assert.equal(calls.length, 1);
  assert.deepEqual((await events.read("demo-company")).map(({ type }) => type), [
    "work.dispatch-requested",
    "work.dispatched",
  ]);
});

test("formal dispatch enforces the persisted budget hard stop before creating new Work", async () => {
  let genericCalls = 0;
  const events = new InMemoryEventStore();
  const service = new DispatchAccountableWork({
    identity: identity(),
    organization: { async getOrganization() { return DEMO_COMPANY; }, async listPrincipals() { return []; } },
    contracts: responsibilities,
    genericWork: { async createWork() { genericCalls += 1; throw new Error("must not run"); } } as unknown as GenericWorkPort,
    events,
    ...lifecycleDependencies,
    budgetAuthorization: { async execute() { throw new Error("BUDGET_HARD_STOP"); } },
    now: () => "2026-08-18T09:00:00.000Z",
    nextId: () => "unused-event",
  });
  await assert.rejects(service.execute({ draft: draft(), genericGoalId: null }), /BUDGET_HARD_STOP/);
  assert.equal(genericCalls, 0);
  assert.equal((await events.read("demo-company")).length, 0);
});

test("idempotent replay of an existing Work is not redefined by a later budget stop", async () => {
  let budgetCalls = 0;
  let record: Awaited<ReturnType<GenericWorkPort["getWork"]>> | null = null;
  const genericWork = {
    async createWork(input: { id: string; companyId: string; title: string; goalId: string | null; assigneeId: string | null }) {
      const value = { id: input.id, companyId: input.companyId, title: input.title, goalId: input.goalId,
        assigneeId: input.assigneeId, status: "READY" as const, createdAt: "2026-08-18T09:00:00.000Z",
        updatedAt: "2026-08-18T09:00:00.000Z" };
      record = { ok: true as const, value };
      return record;
    },
    async getWork() { return record ?? { ok: false as const, error: { code: "NOT_FOUND", category: "NOT_FOUND" as const, retryable: false } }; },
  } as unknown as GenericWorkPort;
  const events = new InMemoryEventStore();
  let id = 0;
  const service = new DispatchAccountableWork({
    identity: identity(),
    organization: { async getOrganization() { return DEMO_COMPANY; }, async listPrincipals() { return []; } },
    contracts: responsibilities, genericWork, events, ...lifecycleDependencies,
    budgetAuthorization: { async execute() { budgetCalls += 1; if (budgetCalls > 1) throw new Error("BUDGET_HARD_STOP"); } },
    now: () => "2026-08-18T09:00:00.000Z", nextId: () => `budget-replay-${++id}`,
  });
  await service.execute({ draft: draft(), genericGoalId: null });
  await service.execute({ draft: draft(), genericGoalId: null });
  assert.equal(budgetCalls, 1);
});

test("identity mismatch and disallowed responsibility fail before a work-system call", async () => {
  let calls = 0;
  const genericWork = {
    async createWork() { calls += 1; throw new Error("must not run"); },
  } as unknown as GenericWorkPort;
  const service = new DispatchAccountableWork({
    identity: identity("other-human"),
    organization: {
      async getOrganization() { return DEMO_COMPANY; },
      async listPrincipals() { return []; },
    },
    contracts: responsibilities,
    genericWork,
    events: new InMemoryEventStore(),
    ...lifecycleDependencies,
    now: () => "2026-08-18T09:00:00.000Z",
    nextId: () => "unused-event",
  });
  await assert.rejects(service.execute({ draft: draft(), genericGoalId: null }), /INITIATOR_IDENTITY_MISMATCH/);
  assert.equal(calls, 0);
});

test("infrastructure failure records only a stable code and stays retryable by idempotency key", async () => {
  const events = new InMemoryEventStore();
  const service = new DispatchAccountableWork({
    identity: identity(),
    organization: {
      async getOrganization() { return DEMO_COMPANY; },
      async listPrincipals() { return []; },
    },
    contracts: responsibilities,
    genericWork: {
      async createWork() {
        return { ok: false, error: {
          code: "WORK_STORE_UNAVAILABLE",
          category: "INFRASTRUCTURE_UNAVAILABLE",
          retryable: true,
        } };
      },
    } as unknown as GenericWorkPort,
    events,
    ...lifecycleDependencies,
    now: () => "2026-08-18T09:00:00.000Z",
    nextId: (() => { let value = 0; return () => `failed-event-${++value}`; })(),
  });
  await assert.rejects(
    service.execute({ draft: draft(), genericGoalId: null }),
    /GENERIC_WORK_DISPATCH_FAILED:WORK_STORE_UNAVAILABLE/,
  );
  const stored = JSON.stringify(await events.read("demo-company"));
  assert.match(stored, /WORK_STORE_UNAVAILABLE/);
  assert.doesNotMatch(stored, /sessionToken|credential-secret|English failure message|stack trace/i);
});

test("formal dispatch persists one Work and one Attempt before delivering one Connector command", async () => {
  const store = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-formal-dispatch-")));
  let id = 0;
  const nextId = () => `formal-dispatch-${++id}`;
  let submissions = 0;
  let modelResolutions = 0;
  let submittedInput: Readonly<Record<string, unknown>> | null = null;
  const executionPort: AgentExecutionPort = {
    async capabilities() {
      return {
        connectorId: "fixture-reference-one", displayName: "Injected test Connector",
        protocolVersion: "1.0", supportsPause: true, supportsResume: true,
        supportsCancellation: true, supportsEvidence: true, maximumTimeoutSeconds: 300,
      };
    },
    async health() { return "HEALTHY"; },
    async deploy(agent) {
      return { id: `deployment-${agent.id}`, agentId: agent.id, connectorId: "fixture-reference-one" };
    },
    async submit(_deployment, request) {
      submissions += 1;
      submittedInput = request.input;
      return { accepted: true, executionId: "execution-one" };
    },
    async observe() { return []; }, async pause() {}, async resume() {}, async cancel() {},
  };
  const runtimeSecurity = new Sha256ConnectorRuntimeSecurity();
  const genericWork = new EventBackedGenericWorkStore(
    store,
    () => "2026-08-18T09:00:00.000Z",
    nextId,
  );
  const service = new DispatchAccountableWork({
    identity: identity(),
    organization: { async getOrganization() { return DEMO_COMPANY; }, async listPrincipals() { return []; } },
    contracts: responsibilities,
    genericWork,
    events: store,
    ...lifecycleDependencies,
    now: () => "2026-08-18T09:00:00.000Z",
    nextId,
    attemptScheduler: new ScheduleWorkAttempt({
      store, executionPorts: [executionPort], runtimeSecurity, nextId,
    }),
    modelResolver: {
      async execute(intent) {
        modelResolutions += 1;
        assert.deepEqual(intent, { companyId: "demo-company", policyId: "default-models",
          classification: "INTERNAL", requiredResidency: "LOCAL" });
        return {
          policyId: "default-models", routeId: "local-primary", providerAdapterId: "provider-one",
          modelReference: "model-one", classification: "INTERNAL" as const, residency: "LOCAL" as const,
          credentialReferenceId: "model-secret-one", credentialVersion: 7,
          providerCapabilityDigest: `sha256:${"e".repeat(64)}`,
        };
      },
    },
    commandDelivery: new DeliverConnectorCommands({
      store, structure: lifecycleDependencies.structure, executionPorts: [executionPort],
      runtimeSecurity,
      modelProviders: [{ async capabilities() { return { providerAdapterId: "provider-one",
        displayName: "Provider One", protocolVersion: "1.0", modelReferences: ["model-one"],
        supportedResidencies: ["LOCAL"] }; }, async health() { return "HEALTHY"; } }],
      modelRuntimeSecurity: { async digestCapabilities() { return `sha256:${"e".repeat(64)}`; } },
      now: () => "2026-08-18T09:00:01.000Z", nextId,
    }),
    executionPreparation: new PrepareWorkExecution({
      events: store,
      dataAccess: { async execute(input) { return {
        requestId: input.requestId, contractId: input.contractId,
        decision: { type: "GRANTED", contractId: input.contractId },
        result: { type: "GRANTED", dataReference: "prepared-data-one",
          evidenceReference: "prepared-evidence-one", contentDigest: `sha256:${"d".repeat(64)}` },
        recordedAt: "2026-08-18T09:00:00.000Z",
      }; } },
      secretLeases: { async execute(intent) { return {
        id: "model-lease-one", secretReferenceId: intent.secretReferenceId,
        version: intent.expectedVersion, consumerId: intent.consumerId,
        workAttemptId: intent.workAttemptId, issuedAt: "2026-08-18T09:00:00.000Z",
        expiresAt: intent.expiresAt, attestationDigest: `sha256:${"f".repeat(64)}`,
      }; } },
      now: () => "2026-08-18T09:00:00.000Z", nextId,
    }),
  });

  const command = { draft: draft(), genericGoalId: null, executionPreparation: {
    dataAccess: [{ requestId: "prepared-request-one", contractId: "prepared-contract-one",
      dataSourceId: "prepared-source-one", operation: "READ" as const, purpose: "accountable-report",
      classification: "INTERNAL" as const, destinationId: null, contentDigest: null }],
    secretLeases: [],
    modelRouting: { companyId: "demo-company", policyId: "default-models",
      classification: "INTERNAL" as const, requiredResidency: "LOCAL" as const },
  } };
  const first = await service.execute(command);
  assert.equal(first.attempt?.status, "QUEUED");
  assert.equal((first.connectorDelivery?.[0] as { status?: string })?.status, "DELIVERED");
  assert.equal(submissions, 1);
  assert.deepEqual(submittedInput, {
    workAttemptId: "formal-dispatch-5",
    actionReferences: ["read-knowledge", "publish-content"],
    permissionReferences: ["receipt-work"],
    dataAuthorizationReferences: ["prepared-contract-one"],
    governedDataReferences: ["prepared-data-one"],
    dataEvidenceReferences: ["prepared-evidence-one"],
    executionGrantReferences: ["model-lease-one"],
    responsibilityContractId: "demo-contract-researcher",
    responsibilityContractRevision: 1,
    modelBinding: { policyId: "default-models", routeId: "local-primary",
      providerAdapterId: "provider-one", modelReference: "model-one",
      classification: "INTERNAL", residency: "LOCAL", executionGrantReference: "model-lease-one" },
  });
  assert.equal(modelResolutions, 1);
  assert.equal((await new WorkAttemptService(store).latestForWork("demo-company", "work-accountable"))?.status, "RUNNING");
  const replay = await service.execute(command);
  assert.equal(replay.attempt?.id, first.attempt?.id);
  assert.equal(submissions, 1);
  assert.equal(modelResolutions, 1);
  assert.equal((await store.read("demo-company", { types: ["work.dispatched"] })).length, 1);
  assert.deepEqual((await store.read("demo-company", { types: ["work-attempt.recorded"] }))
    .map(({ payload }) => (payload as { operation: string }).operation), ["CREATE", "ACQUIRE_LEASE", "START"]);
  assert.equal((await store.readPendingPublications("demo-company", { afterSequence: 0, limit: 10 })).length, 0);
});
