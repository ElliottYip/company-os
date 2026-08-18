import assert from "node:assert/strict";
import test from "node:test";
import { DispatchAccountableWork } from "../application/dispatch-accountable-work.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import type { GenericWorkPort } from "../ports/generic-work-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { ResponsibilityContractPort } from "../ports/responsibility-contract-port.ts";
import { DEMO_COMPANY } from "../adapters/demo/demo-company.ts";

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
    id: "work-paperclip",
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

test("formal work reaches the generic substrate only after human responsibility checks", async () => {
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

test("identity mismatch and disallowed responsibility fail before an upstream call", async () => {
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
    now: () => "2026-08-18T09:00:00.000Z",
    nextId: () => "unused-event",
  });
  await assert.rejects(service.execute({ draft: draft(), genericGoalId: null }), /INITIATOR_IDENTITY_MISMATCH/);
  assert.equal(calls, 0);
});

test("upstream failure records only a stable code and stays retryable by idempotency key", async () => {
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
          code: "UPSTREAM_HTTP_503",
          category: "UPSTREAM_UNAVAILABLE",
          retryable: true,
        } };
      },
    } as unknown as GenericWorkPort,
    events,
    now: () => "2026-08-18T09:00:00.000Z",
    nextId: (() => { let value = 0; return () => `failed-event-${++value}`; })(),
  });
  await assert.rejects(
    service.execute({ draft: draft(), genericGoalId: null }),
    /GENERIC_WORK_DISPATCH_FAILED:UPSTREAM_HTTP_503/,
  );
  const stored = JSON.stringify(await events.read("demo-company"));
  assert.match(stored, /UPSTREAM_HTTP_503/);
  assert.doesNotMatch(stored, /sessionToken|credential-secret|English failure message|stack trace/i);
});
