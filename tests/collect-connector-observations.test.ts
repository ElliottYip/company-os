import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import { CollectConnectorObservations } from "../application/collect-connector-observations.ts";
import { WorkAttemptService } from "../application/work-attempt-service.ts";
import { DecideHighRiskAction } from "../application/decide-high-risk-action.ts";
import { EventBackedApprovalStore } from "../adapters/storage/event-backed-approval-store.ts";
import { EventBackedUsageBudgetStore } from "../adapters/storage/event-backed-usage-budget-store.ts";
import { IngestConnectorUsage } from "../application/ingest-connector-usage.ts";
import type { AgentExecutionPort } from "../ports/agent-execution-port.ts";

test("ordered Connector evidence and result complete one fenced durable attempt", async () => {
  const store = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-observations-")));
  const attempts = new WorkAttemptService(store);
  let id = 0; const nextId = () => `observation-event-${++id}`;
  await attempts.create({
    draft: { id: "attempt-one", companyId: "company-one", workId: "work-one", agentId: "agent-one",
      attemptNumber: 1, idempotencyKey: "work-one:v1", createdAt: "2026-08-24T10:00:00.000Z",
      timeoutAt: "2026-08-24T11:00:00.000Z", authority: { responsibilityContractId: "contract-one",
        responsibilityContractRevision: 1, accountableHumanId: "human-one", actionIds: ["read-data"],
        permissionIds: [], dataAuthorizationIds: [], connectorId: "connector-one",
        connectorCapabilityDigest: `sha256:${"a".repeat(64)}`, model: {
          policyId: "policy-one", routeId: "route-one", providerAdapterId: "provider-one",
          modelReference: "model-one", classification: "INTERNAL", residency: "LOCAL",
          credentialReferenceId: "credential-one", credentialVersion: 1,
          providerCapabilityDigest: `sha256:${"d".repeat(64)}` } } },
    eventId: nextId(), publicationId: nextId(), actorId: "human-one", expectedEventSequence: 0,
  });
  await attempts.transition({ operation: "ACQUIRE_LEASE", companyId: "company-one", attemptId: "attempt-one",
    eventId: nextId(), actorId: "connector-one", occurredAt: "2026-08-24T10:00:01.000Z", expectedEventSequence: 1,
    lease: { ownerId: "connector-one", fencingToken: 1, acquiredAt: "2026-08-24T10:00:01.000Z", expiresAt: "2026-08-24T10:59:59.000Z" } });
  await attempts.transition({ operation: "START", companyId: "company-one", attemptId: "attempt-one",
    eventId: nextId(), actorId: "connector-one", occurredAt: "2026-08-24T10:00:02.000Z", expectedEventSequence: 2, fencingToken: 1 });
  const port: AgentExecutionPort = {
    async capabilities() { return { connectorId: "connector-one", displayName: "Fixture", protocolVersion: "1.0",
      supportsPause: true, supportsResume: true, supportsCancellation: true, supportsEvidence: true, maximumTimeoutSeconds: 3600 }; },
    async health() { return "HEALTHY"; }, async deploy() { throw new Error("unused"); },
    async submit() { throw new Error("unused"); },
    async observe() { return [{ workId: "work-one", sequence: 1, status: "WORKING", summary: "Prepared source-backed output",
      evidenceRefs: ["evidence-one"], evidenceOutputs: [{ evidenceReference: "evidence-one", contentDigest: `sha256:${"b".repeat(64)}` }],
      recordedAt: "2026-08-24T10:01:00.000Z" }, { workId: "work-one", sequence: 2, status: "COMPLETED",
      summary: "Completed", evidenceRefs: ["evidence-one", "usage-one"],
      evidenceOutputs: [{ evidenceReference: "usage-one", contentDigest: `sha256:${"c".repeat(64)}` }],
      usageOutputs: [{ usageReference: "usage-one", biller: "provider-one", billingType: "metered_api",
        costStatus: "reported", inputTokens: 10, cachedInputTokens: 0, outputTokens: 4, costCents: 3,
        occurredAt: "2026-08-24T10:01:50.000Z" }], resultReference: "result-one",
      recordedAt: "2026-08-24T10:02:00.000Z" }]; },
    async pause() {}, async resume() {}, async cancel() {},
  };
  const usageStore = new EventBackedUsageBudgetStore(store, nextId);
  const collector = new CollectConnectorObservations({ store, executionPorts: [port], nextId,
    usageIngestion: new IngestConnectorUsage({ store: usageStore, nextId }) });
  assert.equal((await collector.execute("company-one")).length, 2);
  const completed = await attempts.load("company-one", "attempt-one");
  assert.equal(completed?.status, "SUCCEEDED");
  assert.equal(completed?.resultId, "result-one");
  assert.deepEqual((await usageStore.load("company-one")).costEvents.map(({ provider, model, usageReference, costCents }) =>
    ({ provider, model, usageReference, costCents })), [
    { provider: "provider-one", model: "model-one", usageReference: "usage-one", costCents: 3 },
  ]);
  assert.equal((await store.read("company-one", { types: ["connector.observation.recorded"] })).length, 2);
  assert.deepEqual(await collector.execute("company-one"), []);
});

test("Connector observation history rejects a missing sequence instead of hiding lost evidence", async () => {
  const store = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-observation-gap-")));
  const attempts = new WorkAttemptService(store);
  let id = 0; const nextId = () => `gap-event-${++id}`;
  await attempts.create({ draft: { id: "attempt-gap", companyId: "company-one", workId: "work-gap",
    agentId: "agent-one", attemptNumber: 1, idempotencyKey: "work-gap:v1",
    createdAt: "2026-08-24T10:00:00.000Z", timeoutAt: "2026-08-24T11:00:00.000Z",
    authority: { responsibilityContractId: "contract-one", responsibilityContractRevision: 1,
      accountableHumanId: "human-one", actionIds: [], permissionIds: [], dataAuthorizationIds: [],
      connectorId: "connector-one", connectorCapabilityDigest: `sha256:${"a".repeat(64)}` } },
    eventId: nextId(), publicationId: nextId(), actorId: "human-one", expectedEventSequence: 0 });
  await attempts.transition({ operation: "ACQUIRE_LEASE", companyId: "company-one", attemptId: "attempt-gap",
    eventId: nextId(), actorId: "connector-one", occurredAt: "2026-08-24T10:00:01.000Z", expectedEventSequence: 1,
    lease: { ownerId: "connector-one", fencingToken: 1, acquiredAt: "2026-08-24T10:00:01.000Z",
      expiresAt: "2026-08-24T10:59:59.000Z" } });
  await attempts.transition({ operation: "START", companyId: "company-one", attemptId: "attempt-gap",
    eventId: nextId(), actorId: "connector-one", occurredAt: "2026-08-24T10:00:02.000Z",
    expectedEventSequence: 2, fencingToken: 1 });
  const port: AgentExecutionPort = {
    async capabilities() { return { connectorId: "connector-one", displayName: "Fixture", protocolVersion: "1.0",
      supportsPause: true, supportsResume: true, supportsCancellation: true, supportsEvidence: true,
      maximumTimeoutSeconds: 3600 }; }, async health() { return "HEALTHY"; },
    async deploy() { throw new Error("unused"); }, async submit() { throw new Error("unused"); },
    async observe() { return [{ workId: "work-gap", sequence: 2, status: "WORKING", summary: "Sequence one was lost",
      evidenceRefs: [], recordedAt: "2026-08-24T10:01:00.000Z" }]; },
    async pause() {}, async resume() {}, async cancel() {},
  };
  const collector = new CollectConnectorObservations({ store, executionPorts: [port], nextId });
  await assert.rejects(collector.execute("company-one"), /CONNECTOR_OBSERVATION_SEQUENCE_GAP/);
  assert.equal((await store.read("company-one", { types: ["connector.observation.recorded"] })).length, 0);
});

test("exact high-risk observation pauses once and an idempotent human decision resumes the attempt", async () => {
  const store = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-approval-observation-")));
  const attempts = new WorkAttemptService(store);
  let id = 0; const nextId = () => `approval-flow-${++id}`;
  await attempts.create({ draft: { id: "attempt-two", companyId: "company-one", workId: "work-two",
    agentId: "agent-one", attemptNumber: 1, idempotencyKey: "work-two:v1",
    createdAt: "2026-08-24T10:00:00.000Z", timeoutAt: "2026-08-24T11:00:00.000Z",
    authority: { responsibilityContractId: "contract-one", responsibilityContractRevision: 1,
      accountableHumanId: "human-one", actionIds: ["publish-report"], permissionIds: [],
      dataAuthorizationIds: [], connectorId: "connector-one",
      connectorCapabilityDigest: `sha256:${"a".repeat(64)}` } }, eventId: nextId(),
    publicationId: nextId(), actorId: "human-one", expectedEventSequence: 0 });
  await attempts.transition({ operation: "ACQUIRE_LEASE", companyId: "company-one", attemptId: "attempt-two",
    eventId: nextId(), actorId: "connector-one", occurredAt: "2026-08-24T10:00:01.000Z", expectedEventSequence: 1,
    lease: { ownerId: "connector-one", fencingToken: 1, acquiredAt: "2026-08-24T10:00:01.000Z", expiresAt: "2026-08-24T10:59:59.000Z" } });
  await attempts.transition({ operation: "START", companyId: "company-one", attemptId: "attempt-two",
    eventId: nextId(), actorId: "connector-one", occurredAt: "2026-08-24T10:00:02.000Z", expectedEventSequence: 2, fencingToken: 1 });
  const approvals = new EventBackedApprovalStore(store, "company-one", nextId, () => "2026-08-24T10:02:00.000Z");
  const observation = { workId: "work-two", sequence: 1, status: "AWAITING_APPROVAL" as const,
    summary: "Approval required before publication", evidenceRefs: ["evidence-two"],
    evidenceOutputs: [{ evidenceReference: "evidence-two", contentDigest: `sha256:${"b".repeat(64)}` }],
    approvalRequest: { requestId: "approval-two", action: { id: "publish-report", type: "publish",
      description: "Publish the approved report", inputDigest: `sha256:${"c".repeat(64)}`, risk: "HIGH" as const },
      expiresAt: "2026-08-24T10:30:00.000Z" }, recordedAt: "2026-08-24T10:02:00.000Z" };
  const port: AgentExecutionPort = { async capabilities() { return { connectorId: "connector-one",
    displayName: "Fixture", protocolVersion: "1.0", supportsPause: true, supportsResume: true,
    supportsCancellation: true, supportsEvidence: true, maximumTimeoutSeconds: 3600 }; },
    async health() { return "HEALTHY"; }, async deploy() { throw new Error("unused"); },
    async submit() { throw new Error("unused"); }, async observe() { return [observation]; },
    async pause() {}, async resume() {}, async cancel() {} };
  const collector = new CollectConnectorObservations({ store, executionPorts: [port], approvals, nextId });
  await collector.execute("company-one");
  assert.equal((await attempts.load("company-one", "attempt-two"))?.status, "AWAITING_APPROVAL");
  const request = (await approvals.pending("company-one"))[0]!;
  const decisionService = new DecideHighRiskAction({
    identity: { async getCurrentIdentity() { return { actorId: "human-one", organizationId: "company-one",
      displayName: "Human", assurance: "ENTERPRISE_ASSERTED" }; }, async currentPrincipal() { return null; },
      async authorize() { return { id: nextId(), principalId: "human-one", authorizedAt: "2026-08-24T10:03:00.000Z" }; } },
    approvals, events: store, attempts, now: () => "2026-08-24T10:03:00.000Z", nextId,
  });
  const command = { companyId: "company-one", requestId: request.id, expectedBinding: request.binding,
    decision: "APPROVED" as const };
  await decisionService.execute(command);
  assert.equal((await attempts.load("company-one", "attempt-two"))?.status, "RUNNING");
  const count = (await store.read("company-one", { types: ["work-attempt.recorded"] })).length;
  await decisionService.execute(command);
  assert.equal((await store.read("company-one", { types: ["work-attempt.recorded"] })).length, count);
  await collector.execute("company-one");
  assert.equal((await attempts.load("company-one", "attempt-two"))?.status, "RUNNING");
});
