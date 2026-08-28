import assert from "node:assert/strict";
import test from "node:test";

import { GetAgentBossProjection } from "../application/get-agent-boss-projection.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { DEMO_COMPANY } from "../adapters/demo/demo-company.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { CompanyStructure } from "../core/company-structure.ts";

const structure: CompanyStructure = {
  organization: DEMO_COMPANY,
  projects: [], workspaces: [],
  positions: [
    { id: "position-boss", title: "Boss", departmentId: "operations", principalId: "demo-boss", accountableHumanId: "demo-boss" },
    { id: "position-product", title: "Product", departmentId: "operations", principalId: "demo-product-boss", accountableHumanId: "demo-product-boss" },
    { id: "position-finance", title: "Finance", departmentId: "operations", principalId: "demo-finance-boss", accountableHumanId: "demo-finance-boss" },
    { id: "position-researcher", title: "Researcher", departmentId: "operations", principalId: "demo-researcher", accountableHumanId: "demo-boss" },
    { id: "position-operator", title: "Operator", departmentId: "operations", principalId: "demo-operator", accountableHumanId: "demo-boss" },
  ],
  reportingLines: [
    { subordinatePositionId: "position-researcher", managerPositionId: "position-boss" },
    { subordinatePositionId: "position-operator", managerPositionId: "position-boss" },
  ],
};

function identity(
  companyId = "demo-company",
  assurance: "ENTERPRISE_ASSERTED" | "LOCAL_DEMO" = "ENTERPRISE_ASSERTED",
): IdentityPort {
  return {
    async getCurrentIdentity() {
      return { actorId: "demo-boss", organizationId: companyId, displayName: "Boss", assurance };
    },
    async currentPrincipal() { return { id: "demo-boss", kind: "HUMAN", displayName: "Boss" }; },
    async authorize() {
      return { id: "receipt-read", principalId: "demo-boss", authorizedAt: "2026-08-20T12:00:00.000Z" };
    },
  };
}

function dependencies(identityPort = identity()) {
  const events = new InMemoryEventStore();
  return {
    events,
    useCase: new GetAgentBossProjection({
      identity: identityPort,
      organization: {
        async getOrganization() { return DEMO_COMPANY; },
        async listPrincipals() { return []; },
      },
      responsibilities: {
        async load() {
          return {
            revision: 3,
            contracts: [{
              id: "demo-contract-researcher",
              companyId: "demo-company",
              agentId: "demo-researcher",
              accountableHumanId: "demo-boss",
              backupHumanId: null,
              autonomyLevel: 2,
              allowedActions: ["read-knowledge"],
              approvalRequiredActions: [],
              escalationTimeoutSeconds: null,
              status: "ACTIVE" as const,
            }],
          };
        },
        async replace() { throw new Error("not used"); },
      },
      approvals: {
        async pending() { return []; },
        async publishRequest() { throw new Error("not used"); },
        async publishDecision() { throw new Error("not used"); },
        async decision() { return null; },
      },
      lifecycle: {
        async load() { return { revision: 1, agents: DEMO_COMPANY.agents.map((agent) => ({
          companyId: "demo-company", agentId: agent.id, status: "idle" as const,
          pauseReason: null, pausedAt: null, errorCode: null, updatedAt: "2026-08-20T12:00:00.000Z",
        })) }; },
        async transition() { throw new Error("not used"); },
      },
      structure: { async load() { return structure; } },
      events,
    }),
  };
}

test("formal Agent Boss projection joins organization, contracts, work, and attempts", async () => {
  const { events, useCase } = dependencies();
  await events.append({
    id: "event-work",
    companyId: "demo-company",
    type: "work.dispatched",
    occurredAt: "2026-08-20T12:00:00.000Z",
    actorId: "demo-boss",
    provenance: "PRODUCTION",
    payload: { work: {
      id: "work-one",
      companyId: "demo-company",
      title: "Prepare brief",
      goal: "Prepare an evidence-backed brief.",
      scope: "AGENT",
      departmentId: "operations",
      projectId: null,
      agentId: "demo-researcher",
      requestedBy: "demo-boss",
      actionIds: ["read-knowledge"],
      parentWorkId: null,
      accountableHumanId: "demo-boss",
      responsibilityContractId: "demo-contract-researcher",
      runtimeConnectorId: "connector-state-machine",
      status: "PENDING",
    } },
  }, 0);
  await events.append({
    id: "event-attempt",
    companyId: "demo-company",
    type: "work-attempt.recorded",
    occurredAt: "2026-08-20T12:01:00.000Z",
    actorId: "execution-service",
    provenance: "PRODUCTION",
    payload: { attempt: { id: "attempt-one", workId: "work-one", status: "RUNNING", attemptNumber: 1 } },
  }, 1);
  await events.append({
    id: "event-observation", companyId: "demo-company", type: "connector.observation.recorded",
    occurredAt: "2026-08-20T12:02:00.000Z", actorId: "connector-state-machine",
    provenance: "PRODUCTION", payload: { attemptId: "attempt-one", observation: {
      workId: "work-one", sequence: 1, status: "COMPLETED", summary: "Complete",
      evidenceRefs: ["evidence-one"], evidenceOutputs: [{ evidenceReference: "evidence-one",
        contentDigest: `sha256:${"a".repeat(64)}` }], resultReference: "result-one",
      recordedAt: "2026-08-20T12:02:00.000Z",
    } },
  }, 2);
  await events.append({
    id: "event-attempt-complete", companyId: "demo-company", type: "work-attempt.recorded",
    occurredAt: "2026-08-20T12:02:00.000Z", actorId: "connector-state-machine",
    provenance: "PRODUCTION", payload: { attempt: { id: "attempt-one", workId: "work-one",
      status: "SUCCEEDED", attemptNumber: 1, resultId: "result-one" } },
  }, 3);

  const projection = await useCase.execute("demo-company");
  assert.equal(projection.schemaVersion, 1);
  assert.deepEqual(projection.viewer, { actorId: "demo-boss", displayName: "Boss" });
  assert.equal(projection.organization.company.name, "Coral Labs");
  assert.equal(projection.responsibilities.revision, 3);
  assert.equal(projection.agentLifecycle.agents[0]?.eligibility.invokable, true);
  assert.equal(projection.work[0]?.accountableHumanId, "demo-boss");
  assert.deepEqual(projection.attempts, [{
    id: "attempt-one",
    workId: "work-one",
    status: "SUCCEEDED",
    attemptNumber: 1,
    evidenceReferences: ["evidence-one"],
    resultId: "result-one",
    reconciliation: null,
    preparationStatus: "NOT_REQUIRED",
  }]);
  assert.equal(projection.mode, "PRODUCTION");
});

test("formal Agent Boss projection rejects Demo identity and cross-tenant reads", async () => {
  await assert.rejects(
    dependencies(identity("demo-company", "LOCAL_DEMO")).useCase.execute("demo-company"),
    /FORMAL_IDENTITY_REQUIRED/,
  );
  await assert.rejects(
    dependencies(identity("other-company")).useCase.execute("demo-company"),
    /TENANT_MISMATCH/,
  );
});

test("formal projection exposes crash-interrupted execution preparation as recoverable", async () => {
  const { events, useCase } = dependencies();
  await events.append({ id: "event-requested", companyId: "demo-company",
    type: "work-execution.preparation-requested", occurredAt: "2026-08-20T12:00:00.000Z",
    actorId: "demo-boss", provenance: "PRODUCTION", payload: { workId: "work-one", plan: {
      dataAccess: [], secretLeases: [{ secretReferenceId: "connector-secret", expectedVersion: 1,
        reasonCode: "WORK_EXECUTION", leaseDurationSeconds: 300 }],
    } } }, 0);
  await events.append({ id: "event-attempt", companyId: "demo-company", type: "work-attempt.recorded",
    occurredAt: "2026-08-20T12:00:01.000Z", actorId: "demo-boss", provenance: "PRODUCTION",
    payload: { attempt: { id: "attempt-one", workId: "work-one", status: "QUEUED", attemptNumber: 1 } } }, 1);
  assert.equal((await useCase.execute("demo-company")).attempts[0]?.preparationStatus, "PENDING");
  await events.append({ id: "event-prepared", companyId: "demo-company", type: "work-execution.prepared",
    occurredAt: "2026-08-20T12:00:02.000Z", actorId: "demo-boss", provenance: "PRODUCTION",
    payload: { preparation: { workId: "work-one", workAttemptId: "attempt-one",
      dataAuthorizationReferences: [], governedDataReferences: [], dataEvidenceReferences: [],
      executionGrantReferences: ["grant-one"], recordedAt: "2026-08-20T12:00:02.000Z" } } }, 2);
  assert.equal((await useCase.execute("demo-company")).attempts[0]?.preparationStatus, "PREPARED");
});
