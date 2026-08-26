import assert from "node:assert/strict";
import test from "node:test";

import { PrepareWorkExecution } from "../application/prepare-work-execution.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import type { WorkItem } from "../core/work.ts";
import type { WorkAttempt } from "../core/work-attempt.ts";

const work: WorkItem = {
  id: "work-one", companyId: "company-one", title: "Prepare report",
  goal: "Prepare an evidence-backed customer report.", scope: "AGENT",
  departmentId: "operations", projectId: null, agentId: "agent-one",
  requestedBy: "human-one", actionIds: ["read-knowledge"], parentWorkId: null,
  accountableHumanId: "human-one", responsibilityContractId: "contract-one",
  runtimeConnectorId: "connector-one", status: "PENDING",
};

const attempt: WorkAttempt = {
  id: "attempt-one", companyId: "company-one", workId: "work-one", agentId: "agent-one",
  attemptNumber: 1, idempotencyKey: "company-one:work-one:attempt:1",
  timeoutAt: "2026-08-18T09:10:00.000Z",
  authority: {
    responsibilityContractId: "contract-one", responsibilityContractRevision: 1,
    accountableHumanId: "human-one", actionIds: ["read-knowledge"],
    permissionIds: ["authorization-one"], dataAuthorizationIds: ["data-contract-one"],
    connectorId: "connector-one", connectorCapabilityDigest: `sha256:${"a".repeat(64)}`,
    model: {
      policyId: "default-models", routeId: "local-primary", providerAdapterId: "provider-one",
      modelReference: "model-one", classification: "CONFIDENTIAL", residency: "LOCAL",
      credentialReferenceId: "model-secret-one", credentialVersion: 7,
      providerCapabilityDigest: `sha256:${"d".repeat(64)}`,
    },
  },
  status: "QUEUED", lease: null, lastFencingToken: 0,
  createdAt: "2026-08-18T09:00:00.000Z", startedAt: null, completedAt: null,
  resultId: null, pendingApprovalId: null, reconciliation: null,
};

test("execution preparation binds governed data and a secret-free lease before Connector delivery", async () => {
  const events = new InMemoryEventStore();
  const calls: unknown[] = [];
  let next = 0;
  const service = new PrepareWorkExecution({
    events,
    dataAccess: {
      async execute(input) {
        calls.push(["data", input]);
        return {
          requestId: input.requestId, contractId: input.contractId,
          decision: { type: "GRANTED", contractId: input.contractId },
          result: {
            type: "GRANTED", dataReference: "data-result-one",
            evidenceReference: "data-evidence-one", contentDigest: `sha256:${"b".repeat(64)}`,
          },
          recordedAt: "2026-08-18T09:00:00.000Z",
        };
      },
    },
    secretLeases: {
      async execute(intent) {
        calls.push(["lease", intent]);
        return {
          id: intent.reasonCode === "MODEL_INFERENCE" ? "model-lease-one" : "lease-one",
          secretReferenceId: intent.secretReferenceId,
          version: intent.expectedVersion, consumerId: intent.consumerId,
          workAttemptId: intent.workAttemptId, issuedAt: "2026-08-18T09:00:00.000Z",
          expiresAt: intent.expiresAt, attestationDigest: `sha256:${"c".repeat(64)}`,
        };
      },
    },
    now: () => "2026-08-18T09:00:00.000Z",
    nextId: () => `preparation-event-${++next}`,
  });
  const plan = {
    dataAccess: [{
      requestId: "data-request-one", contractId: "data-contract-one",
      dataSourceId: "crm-one", operation: "READ" as const, purpose: "customer-support",
      classification: "CONFIDENTIAL" as const, destinationId: null, contentDigest: null,
    }],
    secretLeases: [{
      secretReferenceId: "connector-credential-one", expectedVersion: 3,
      reasonCode: "WORK_EXECUTION", leaseDurationSeconds: 300,
    }],
    modelRouting: {
      companyId: "company-one", policyId: "default-models",
      classification: "CONFIDENTIAL" as const, requiredResidency: "LOCAL" as const,
    },
  };

  const prepared = await service.execute({ work, attempt, plan });
  assert.deepEqual(prepared, {
    workId: "work-one", workAttemptId: "attempt-one",
    dataAuthorizationReferences: ["data-contract-one"],
    governedDataReferences: ["data-result-one"],
    dataEvidenceReferences: ["data-evidence-one"],
    executionGrantReferences: ["lease-one", "model-lease-one"],
    modelBinding: {
      policyId: "default-models", routeId: "local-primary", providerAdapterId: "provider-one",
      modelReference: "model-one", classification: "CONFIDENTIAL", residency: "LOCAL",
      executionGrantReference: "model-lease-one",
    },
    recordedAt: "2026-08-18T09:00:00.000Z",
  });
  assert.equal((calls[0] as [string, { request: { companyId: string; workId: string; agentId: string } }])[1].request.companyId, "company-one");
  assert.equal((calls[0] as [string, { request: { companyId: string; workId: string; agentId: string } }])[1].request.workId, "work-one");
  assert.equal((calls[1] as [string, { consumerId: string; workAttemptId: string; expiresAt: string }])[1].consumerId, "connector-one");
  assert.equal((calls[1] as [string, { consumerId: string; workAttemptId: string; expiresAt: string }])[1].workAttemptId, "attempt-one");
  assert.equal((calls[1] as [string, { consumerId: string; workAttemptId: string; expiresAt: string }])[1].expiresAt, "2026-08-18T09:05:00.000Z");
  assert.equal((calls[2] as [string, { consumerId: string; reasonCode: string }])[1].consumerId, "provider-one");
  assert.equal((calls[2] as [string, { consumerId: string; reasonCode: string }])[1].reasonCode, "MODEL_INFERENCE");

  assert.deepEqual(await service.execute({ work, attempt, plan }), prepared);
  assert.equal(calls.length, 3, "replay must not call enterprise nodes twice");
  assert.equal((await events.read("company-one")).filter(({ type }) => type === "work-execution.prepared").length, 1);
});

test("execution preparation fails closed without publishing a prepared marker", async () => {
  const events = new InMemoryEventStore();
  const service = new PrepareWorkExecution({
    events,
    dataAccess: { async execute() { throw new Error("DATA_CONNECTOR_UNAVAILABLE"); } },
    secretLeases: { async execute() { throw new Error("must not run"); } },
    now: () => "2026-08-18T09:00:00.000Z", nextId: () => "unused",
  });
  await assert.rejects(service.execute({ work, attempt, plan: {
    dataAccess: [{ requestId: "request-one", contractId: "data-contract-one", dataSourceId: "crm-one",
      operation: "READ", purpose: "support", classification: "INTERNAL", destinationId: null, contentDigest: null }],
    secretLeases: [],
    modelRouting: { companyId: "company-one", policyId: "default-models",
      classification: "CONFIDENTIAL", requiredResidency: "LOCAL" },
  } }), /DATA_CONNECTOR_UNAVAILABLE/);
  assert.equal((await events.read("company-one")).some(({ type }) => type === "work-execution.prepared"), false);
});
