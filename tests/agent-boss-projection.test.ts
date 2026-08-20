import assert from "node:assert/strict";
import test from "node:test";

import { GetAgentBossProjection } from "../application/get-agent-boss-projection.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { DEMO_COMPANY } from "../adapters/demo/demo-company.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

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

  const projection = await useCase.execute("demo-company");
  assert.equal(projection.schemaVersion, 1);
  assert.deepEqual(projection.viewer, { actorId: "demo-boss", displayName: "Boss" });
  assert.equal(projection.organization.company.name, "珊瑚实验室");
  assert.equal(projection.responsibilities.revision, 3);
  assert.equal(projection.work[0]?.accountableHumanId, "demo-boss");
  assert.deepEqual(projection.attempts, [{
    id: "attempt-one",
    workId: "work-one",
    status: "RUNNING",
    attemptNumber: 1,
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
