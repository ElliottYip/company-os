import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Sha256ConnectorRuntimeSecurity } from "../adapters/connectors/sha256-connector-runtime-security.ts";
import { Sha256ModelRuntimeSecurity } from "../adapters/models/sha256-model-runtime-security.ts";
import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import { DeliverConnectorCommands } from "../application/deliver-connector-commands.ts";
import { WorkAttemptService } from "../application/work-attempt-service.ts";
import type { AgentExecutionPort } from "../ports/agent-execution-port.ts";

const capabilities = {
  connectorId: "connector-one",
  displayName: "Test Connector",
  protocolVersion: "1.0",
  supportsPause: true,
  supportsResume: true,
  supportsCancellation: true,
  supportsEvidence: true,
  maximumTimeoutSeconds: 300,
} as const;
const modelCapabilities = { providerAdapterId: "provider-one", displayName: "Provider One",
  protocolVersion: "1.0" as const, modelReferences: ["model-one"], supportedResidencies: ["LOCAL" as const] };
const modelProvider = { async capabilities() { return modelCapabilities; },
  async health() { return "HEALTHY" as const; } };

const structure = {
  organization: {
    company: { id: "company-one", name: "Company One", purpose: "Test durable delivery", locale: "en-US" },
    departments: [{ id: "department-one", name: "Operations", mandate: "Operate safely" }],
    humans: [{ id: "human-one", name: "Human One", title: "Manager", departmentId: "department-one", avatarId: "avatar-one" }],
    agents: [{
      id: "agent-one", name: "Agent One", role: "Operator", departmentId: "department-one",
      accountableHumanId: "human-one", runtimeConnectorId: "connector-one",
      avatarId: "avatar-agent", autonomyLevel: 2,
    }],
  },
  projects: [],
  workspaces: [{ id: "workspace-one", name: "Operations", projectId: null, departmentId: "department-one" }],
  positions: [{
    id: "position-agent", title: "Operations Agent", departmentId: "department-one",
    principalId: "agent-one", accountableHumanId: "human-one",
  }],
  reportingLines: [],
} as const;

function executionPort(submissions: unknown[]): AgentExecutionPort {
  return {
    async capabilities() { return capabilities; },
    async health() { return "HEALTHY"; },
    async deploy(agent) {
      return { id: `deployment-${agent.id}`, agentId: agent.id, connectorId: "connector-one" };
    },
    async submit(deployment, request, proof) {
      submissions.push({ deployment, request, proof });
      return { accepted: true, executionId: `execution-${request.id}` };
    },
    async observe() { return []; },
    async pause() {},
    async resume() {},
    async cancel() {},
  };
}

async function seed(capabilityDigest: string, withModel = false, modelCapabilityDigest = `sha256:${"b".repeat(64)}`) {
  const directory = await mkdtemp(join(tmpdir(), "company-os-connector-delivery-"));
  const store = new LocalDurableControlPlaneStore(directory);
  await store.append({
    id: "event-work", companyId: "company-one", type: "work.dispatched",
    occurredAt: "2026-08-24T10:00:00.000Z", actorId: "human-one", provenance: "PRODUCTION",
    payload: { work: {
      id: "work-one", companyId: "company-one", title: "Reconcile invoices",
      goal: "Reconcile the approved invoice batch", scope: "AGENT",
      departmentId: "department-one", projectId: null, agentId: "agent-one",
      requestedBy: "human-one", actionIds: ["read-invoices"], parentWorkId: null,
      accountableHumanId: "human-one", responsibilityContractId: "contract-one",
      runtimeConnectorId: "connector-one", status: "PENDING",
    } },
  }, 0);
  await new WorkAttemptService(store).create({
    draft: {
      id: "attempt-one", companyId: "company-one", workId: "work-one", agentId: "agent-one",
      attemptNumber: 1, idempotencyKey: "company-one:work-one:v1",
      createdAt: "2026-08-24T10:00:01.000Z", timeoutAt: "2026-08-24T10:04:00.000Z",
      authority: {
        responsibilityContractId: "contract-one", responsibilityContractRevision: 1,
        accountableHumanId: "human-one", actionIds: ["read-invoices"],
        permissionIds: ["permission-invoices"], dataAuthorizationIds: ["data-invoices"],
        connectorId: "connector-one", connectorCapabilityDigest: capabilityDigest,
        ...(withModel ? { model: {
          policyId: "default-models", routeId: "local-primary", providerAdapterId: "provider-one",
          modelReference: "model-one", classification: "INTERNAL" as const, residency: "LOCAL" as const,
          credentialReferenceId: "model-secret-one", credentialVersion: 7,
          providerCapabilityDigest: modelCapabilityDigest,
        } } : {}),
      },
    },
    eventId: "event-attempt", publicationId: "publication-submit",
    actorId: "human-one", expectedEventSequence: 1,
  });
  return store;
}

test("durable Connector delivery submits once and acknowledges only after acceptance", async () => {
  const runtimeSecurity = new Sha256ConnectorRuntimeSecurity();
  const store = await seed(await runtimeSecurity.digestCapabilities(capabilities));
  const submissions: unknown[] = [];
  const service = new DeliverConnectorCommands({
    store,
    structure: { async load(companyId) { return companyId === "company-one" ? structure : null; } },
    executionPorts: [executionPort(submissions)], runtimeSecurity,
    now: () => "2026-08-24T10:01:00.000Z",
    nextId: (() => { let id = 0; return () => `delivery-event-${++id}`; })(),
  });

  assert.deepEqual(await service.execute("company-one"), [{
    publicationId: "publication-submit", partitionKey: "attempt-one",
    status: "DELIVERED", code: "CONNECTOR_COMMAND_DELIVERED",
  }]);
  assert.equal(submissions.length, 1);
  assert.doesNotMatch(JSON.stringify(submissions[0]), /credential|privateReasoning|accessToken|sessionId/i);
  assert.deepEqual(await service.execute("company-one"), []);
  assert.equal(submissions.length, 1);
});

test("capability drift leaves the command pending without invoking the Connector", async () => {
  const runtimeSecurity = new Sha256ConnectorRuntimeSecurity();
  const store = await seed(`sha256:${"a".repeat(64)}`);
  const submissions: unknown[] = [];
  const service = new DeliverConnectorCommands({
    store,
    structure: { async load() { return structure; } },
    executionPorts: [executionPort(submissions)], runtimeSecurity,
    now: () => "2026-08-24T10:01:00.000Z",
    nextId: (() => { let id = 0; return () => `delivery-event-${++id}`; })(),
  });
  assert.equal((await service.execute("company-one"))[0]?.code, "CONNECTOR_CAPABILITY_DIGEST_CHANGED");
  assert.equal(submissions.length, 0);
  assert.equal((await store.readPendingPublications("company-one", { afterSequence: 0, limit: 10 })).length, 1);
});

test("a preparation request blocks Connector submission until data and lease references are durable", async () => {
  const runtimeSecurity = new Sha256ConnectorRuntimeSecurity();
  const store = await seed(await runtimeSecurity.digestCapabilities(capabilities));
  const current = await store.read("company-one");
  await store.append({
    id: "event-preparation-requested", companyId: "company-one",
    type: "work-execution.preparation-requested", occurredAt: "2026-08-24T10:00:02.000Z",
    actorId: "human-one", correlationId: "work-one", provenance: "PRODUCTION",
    payload: { workId: "work-one", dataRequestIds: ["request-one"],
      dataAuthorizationIds: ["data-invoices"], secretReferenceIds: ["connector-secret-one"] },
  }, current.length);
  const submissions: unknown[] = [];
  const service = new DeliverConnectorCommands({
    store, structure: { async load() { return structure; } },
    executionPorts: [executionPort(submissions)], runtimeSecurity,
    now: () => "2026-08-24T10:01:00.000Z", nextId: () => "unused-id",
  });
  assert.equal((await service.execute("company-one"))[0]?.code, "WORK_EXECUTION_NOT_PREPARED");
  assert.equal(submissions.length, 0);
  assert.equal((await store.readPendingPublications("company-one", { afterSequence: 0, limit: 10 })).length, 1);
});

test("Connector receives the frozen model binding and opaque grant without credential metadata", async () => {
  const runtimeSecurity = new Sha256ConnectorRuntimeSecurity();
  const modelRuntimeSecurity = new Sha256ModelRuntimeSecurity();
  const store = await seed(await runtimeSecurity.digestCapabilities(capabilities), true,
    await modelRuntimeSecurity.digestCapabilities(modelCapabilities));
  let current = await store.read("company-one");
  await store.append({
    id: "event-model-preparation-requested", companyId: "company-one",
    type: "work-execution.preparation-requested", occurredAt: "2026-08-24T10:00:02.000Z",
    actorId: "human-one", correlationId: "work-one", provenance: "PRODUCTION",
    payload: { workId: "work-one", dataRequestIds: [], dataAuthorizationIds: [],
      secretReferenceIds: ["model-secret-one"] },
  }, current.length);
  current = await store.read("company-one");
  await store.append({
    id: "event-model-prepared", companyId: "company-one", type: "work-execution.prepared",
    occurredAt: "2026-08-24T10:00:03.000Z", actorId: "human-one", correlationId: "work-one",
    provenance: "PRODUCTION", payload: { preparation: {
      workId: "work-one", workAttemptId: "attempt-one", dataAuthorizationReferences: ["data-invoices"],
      governedDataReferences: [], dataEvidenceReferences: [], executionGrantReferences: ["model-lease-one"],
      modelBinding: { policyId: "default-models", routeId: "local-primary",
        providerAdapterId: "provider-one", modelReference: "model-one",
        classification: "INTERNAL", residency: "LOCAL", executionGrantReference: "model-lease-one" },
      recordedAt: "2026-08-24T10:00:03.000Z",
    } },
  }, current.length);
  const submissions: unknown[] = [];
  let modelDeliveryId = 0;
  const service = new DeliverConnectorCommands({ store, structure: { async load() { return structure; } },
    executionPorts: [executionPort(submissions)], runtimeSecurity,
    modelProviders: [modelProvider], modelRuntimeSecurity,
    now: () => "2026-08-24T10:01:00.000Z", nextId: () => `delivery-model-event-${++modelDeliveryId}` });

  assert.equal((await service.execute("company-one"))[0]?.status, "DELIVERED");
  const serialized = JSON.stringify(submissions[0]);
  assert.match(serialized, /"modelBinding":\{"policyId":"default-models","routeId":"local-primary"/);
  assert.match(serialized, /model-lease-one/);
  assert.doesNotMatch(serialized, /model-secret-one|credentialReference|credentialVersion/);
});

test("model-provider capability drift leaves submission pending", async () => {
  const runtimeSecurity = new Sha256ConnectorRuntimeSecurity();
  const store = await seed(await runtimeSecurity.digestCapabilities(capabilities), true,
    `sha256:${"0".repeat(64)}`);
  const submissions: unknown[] = [];
  const service = new DeliverConnectorCommands({ store, structure: { async load() { return structure; } },
    executionPorts: [executionPort(submissions)], runtimeSecurity, modelProviders: [modelProvider],
    modelRuntimeSecurity: new Sha256ModelRuntimeSecurity(),
    now: () => "2026-08-24T10:01:00.000Z", nextId: () => "unused-id" });
  assert.equal((await service.execute("company-one"))[0]?.code,
    "MODEL_PROVIDER_CAPABILITY_DIGEST_CHANGED");
  assert.equal(submissions.length, 0);
});

test("a locally cancelled queued Attempt can never be submitted by a stale outbox command", async () => {
  const runtimeSecurity = new Sha256ConnectorRuntimeSecurity();
  const store = await seed(await runtimeSecurity.digestCapabilities(capabilities));
  await new WorkAttemptService(store).transition({
    companyId: "company-one", attemptId: "attempt-one", operation: "CANCEL", fencingToken: null,
    eventId: "event-cancel-before-submit", actorId: "human-one",
    occurredAt: "2026-08-24T10:00:02.000Z", expectedEventSequence: 2,
  });
  const submissions: unknown[] = [];
  const service = new DeliverConnectorCommands({
    store, structure: { async load() { return structure; } },
    executionPorts: [executionPort(submissions)], runtimeSecurity,
    now: () => "2026-08-24T10:01:00.000Z", nextId: () => "unused-id",
  });
  assert.equal((await service.execute("company-one"))[0]?.status, "DELIVERED");
  assert.equal(submissions.length, 0);
  assert.equal((await new WorkAttemptService(store).load("company-one", "attempt-one"))?.status, "CANCELLED");
});
