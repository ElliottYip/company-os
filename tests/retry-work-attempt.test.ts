import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Sha256ConnectorRuntimeSecurity } from "../adapters/connectors/sha256-connector-runtime-security.ts";
import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import { RetryWorkAttempt } from "../application/retry-work-attempt.ts";
import { WorkAttemptService } from "../application/work-attempt-service.ts";

test("safe retry creates one fresh-authority Attempt and is idempotent", async () => {
  const store = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-retry-")));
  const work = { id: "work-one", companyId: "company-one", title: "Reconcile", goal: "Reconcile customer records",
    scope: "AGENT" as const, departmentId: "operations", projectId: null, agentId: "agent-one",
    requestedBy: "human-one", actionIds: ["read"], parentWorkId: null, accountableHumanId: "human-one",
    responsibilityContractId: "contract-one", runtimeConnectorId: "connector-one", status: "PENDING" as const };
  await store.append({ id: "event-work", companyId: "company-one", type: "work.dispatched",
    occurredAt: "2026-08-25T10:00:00.000Z", actorId: "human-one", provenance: "PRODUCTION", payload: { work } }, 0);
  const attempts = new WorkAttemptService(store);
  await attempts.create({ draft: { id: "attempt-one", companyId: "company-one", workId: "work-one", agentId: "agent-one",
    attemptNumber: 1, idempotencyKey: "company-one:work-one:attempt:1", createdAt: "2026-08-25T10:00:01.000Z",
    timeoutAt: "2026-08-25T10:30:00.000Z", authority: { responsibilityContractId: "contract-one",
      responsibilityContractRevision: 1, accountableHumanId: "human-one", actionIds: ["read"],
      permissionIds: ["old-authorization"], dataAuthorizationIds: ["data-one"], connectorId: "connector-one",
      connectorCapabilityDigest: `sha256:${"a".repeat(64)}`, model: {
        policyId: "default-models", routeId: "old-route", providerAdapterId: "provider-one",
        modelReference: "model-old", classification: "INTERNAL", residency: "LOCAL",
        credentialReferenceId: "model-secret-one", credentialVersion: 3,
        providerCapabilityDigest: `sha256:${"b".repeat(64)}`,
      } } }, eventId: "event-create", publicationId: "publication-one",
    actorId: "human-one", expectedEventSequence: 1 });
  await attempts.transition({ companyId: "company-one", attemptId: "attempt-one", operation: "ACQUIRE_LEASE",
    lease: { ownerId: "connector-one", fencingToken: 1, acquiredAt: "2026-08-25T10:01:00.000Z", expiresAt: "2026-08-25T10:20:00.000Z" },
    eventId: "event-lease", actorId: "connector-one", occurredAt: "2026-08-25T10:01:00.000Z", expectedEventSequence: 2 });
  await attempts.transition({ companyId: "company-one", attemptId: "attempt-one", operation: "START", fencingToken: 1,
    eventId: "event-start", actorId: "connector-one", occurredAt: "2026-08-25T10:01:01.000Z", expectedEventSequence: 3 });
  await attempts.transition({ companyId: "company-one", attemptId: "attempt-one", operation: "TIME_OUT",
    eventId: "event-timeout", actorId: "system", occurredAt: "2026-08-25T10:31:00.000Z", expectedEventSequence: 4 });
  await attempts.transition({ companyId: "company-one", attemptId: "attempt-one", operation: "RECONCILE",
    reconciliation: { resolution: "SAFE_TO_RETRY", resolvedBy: "human-one", evidenceId: "evidence-one",
      resolvedAt: "2026-08-25T10:32:00.000Z" }, eventId: "event-reconcile", actorId: "human-one",
    occurredAt: "2026-08-25T10:32:00.000Z", expectedEventSequence: 5 });
  await store.append({ id: "event-preparation-plan", companyId: "company-one",
    type: "work-execution.preparation-requested", occurredAt: "2026-08-25T10:32:01.000Z",
    actorId: "human-one", correlationId: "work-one", provenance: "PRODUCTION",
    payload: { workId: "work-one", plan: { dataAccess: [], secretLeases: [],
      modelRouting: { companyId: "company-one", policyId: "default-models",
        classification: "INTERNAL", requiredResidency: "LOCAL" } } } }, 6);
  const structure = { organization: { company: { id: "company-one", name: "One", purpose: "Operate", locale: "en-US" },
    departments: [{ id: "operations", name: "Operations", mandate: "Operate" }],
    humans: [{ id: "human-one", name: "Human", title: "Boss", departmentId: "operations", avatarId: "human" }],
    agents: [{ id: "agent-one", name: "Agent", role: "Research", departmentId: "operations",
      accountableHumanId: "human-one", runtimeConnectorId: "connector-one", avatarId: "fish", autonomyLevel: 2 }] },
    projects: [], workspaces: [], positions: [{ id: "position-agent", title: "Research", departmentId: "operations",
      principalId: "agent-one", accountableHumanId: "human-one" }], reportingLines: [] };
  const capabilities = { connectorId: "connector-one", displayName: "Connector", protocolVersion: "1.0",
    supportsPause: true, supportsResume: true, supportsCancellation: true, supportsEvidence: true, maximumTimeoutSeconds: 600 };
  const port = { async capabilities() { return capabilities; }, async health() { return "HEALTHY" as const; },
    async deploy() { throw new Error("unused"); }, async submit() { throw new Error("unused"); },
    async observe() { return []; }, async pause() {}, async resume() {}, async cancel() {} };
  let generated = 0; let deliveries = 0; let responsibilityChanged = true; let modelResolutions = 0;
  let preparations = 0;
  const useCase = new RetryWorkAttempt({ identity: { async getCurrentIdentity() { return { actorId: "human-one",
    organizationId: "company-one", displayName: "Human", assurance: "ENTERPRISE_ASSERTED" as const }; },
    async currentPrincipal() { return null; }, async authorize() { return { id: "fresh-authorization", principalId: "human-one",
      authorizedAt: "2026-08-25T10:33:00.000Z" }; } }, store, structure: { async load() { return structure; } },
    lifecycle: { async load() { return { revision: 1, agents: [{ companyId: "company-one", agentId: "agent-one", status: "idle" as const,
      pauseReason: null, pausedAt: null, errorCode: null, updatedAt: "2026-08-25T10:32:00.000Z" }] }; },
      async transition() { throw new Error("unused"); } }, responsibilities: { async load() { return { revision: 2, contracts: [{
        id: "contract-one", companyId: "company-one", agentId: "agent-one", accountableHumanId: responsibilityChanged ? "human-two" : "human-one",
        backupHumanId: null, autonomyLevel: 2, allowedActions: ["read"], approvalRequiredActions: [],
        escalationTimeoutSeconds: null, status: "ACTIVE" as const }] }; }, async replace() { throw new Error("unused"); } },
    governance: { async load() { return { companyId: "company-one", revision: 2, modelRoutingPolicies: [],
      dataAuthorizationContracts: [{ id: "data-one", companyId: "company-one", dataSourceId: "source-one",
        authorizedAgentIds: ["agent-one"], authorizedOperations: ["READ" as const], allowedPurposes: ["reconcile"],
        maximumClassification: "INTERNAL" as const, allowedExportDestinations: [], validFrom: "2026-08-01T00:00:00.000Z",
        validUntil: "2026-09-01T00:00:00.000Z", status: "ACTIVE" as const }] }; }, async replace() { throw new Error("unused"); } },
    executionPorts: [port], runtimeSecurity: new Sha256ConnectorRuntimeSecurity(),
    modelResolver: { async execute(intent) {
      modelResolutions += 1;
      assert.deepEqual(intent, { companyId: "company-one", policyId: "default-models",
        classification: "INTERNAL", requiredResidency: "LOCAL" });
      return { policyId: "default-models", routeId: "fresh-route", providerAdapterId: "provider-two",
        modelReference: "model-new", classification: "INTERNAL" as const, residency: "LOCAL" as const,
        credentialReferenceId: "model-secret-two", credentialVersion: 5,
        providerCapabilityDigest: `sha256:${"c".repeat(64)}` };
    } },
    preparation: { async execute(input) {
      preparations += 1;
      assert.equal(input.attempt.authority.model?.routeId, "fresh-route");
      return { workId: input.work.id, workAttemptId: input.attempt.id,
        dataAuthorizationReferences: [], governedDataReferences: [], dataEvidenceReferences: [],
        executionGrantReferences: ["fresh-model-lease"], recordedAt: "2026-08-25T10:33:00.000Z" };
    } },
    deliver: { async execute() { deliveries += 1; return []; } }, now: () => "2026-08-25T10:33:00.000Z",
    nextId: () => `retry-${++generated}` });
  await assert.rejects(useCase.execute({ companyId: "company-one", workId: "work-one", attemptId: "attempt-one" }),
    /WORK_RETRY_RESPONSIBILITY_CHANGED/);
  responsibilityChanged = false;
  const retried = await useCase.execute({ companyId: "company-one", workId: "work-one", attemptId: "attempt-one" });
  assert.equal(retried.attemptNumber, 2); assert.deepEqual(retried.authority.permissionIds, ["fresh-authorization"]);
  assert.equal(retried.authority.responsibilityContractRevision, 2); assert.equal(retried.authority.dataAuthorizationIds[0], "data-one");
  assert.equal(retried.authority.model?.routeId, "fresh-route"); assert.equal(modelResolutions, 1);
  assert.equal(preparations, 1);
  assert.equal(deliveries, 1);
  assert.equal((await useCase.execute({ companyId: "company-one", workId: "work-one", attemptId: "attempt-one" })).id, retried.id);
  assert.equal(deliveries, 1);
});
