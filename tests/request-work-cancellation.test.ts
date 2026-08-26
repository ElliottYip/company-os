import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import { RequestWorkCancellation } from "../application/request-work-cancellation.ts";
import { WorkAttemptService } from "../application/work-attempt-service.ts";
import type { AgentExecutionPort } from "../ports/agent-execution-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

const identity: IdentityPort = {
  async getCurrentIdentity() { return { actorId: "human-one", organizationId: "company-one", displayName: "Human", assurance: "ENTERPRISE_ASSERTED" }; },
  async currentPrincipal() { return { id: "human-one", kind: "HUMAN", displayName: "Human" }; },
  async authorize() { return { id: "authorization-one", principalId: "human-one", authorizedAt: "2026-08-20T10:02:00.000Z" }; },
};

const connector: AgentExecutionPort = {
  async capabilities() { return { connectorId: "connector-one", protocolVersion: "1.0", supportsPause: true, supportsResume: true, supportsCancellation: true, supportsEvidence: true, supportsProgress: true, maximumTimeoutSeconds: 3600 }; },
  async health() { return "HEALTHY"; },
  async deploy(agent) { return { agentId: agent.id, connectorId: "connector-one", runtimeHandle: "opaque" }; },
  async submit() { return { accepted: true, externalReference: null }; },
  async observe() { return []; }, async pause() {}, async resume() {}, async cancel() {},
};

function draft(id: string) {
  return { id, companyId: "company-one", workId: `work-${id}`, agentId: "agent-one",
    attemptNumber: 1, idempotencyKey: id, timeoutAt: "2026-08-20T10:30:00.000Z",
    createdAt: "2026-08-20T10:00:00.000Z", authority: {
      responsibilityContractId: "contract-one", responsibilityContractRevision: 1,
      accountableHumanId: "human-one", actionIds: ["read"], permissionIds: [],
      dataAuthorizationIds: [], connectorId: "connector-one",
      connectorCapabilityDigest: `sha256:${"a".repeat(64)}`,
    } } as const;
}

test("queued cancellation is terminal locally while a running cancellation waits for Connector confirmation", async () => {
  const store = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-cancel-")));
  const attempts = new WorkAttemptService(store);
  let sequence = 0;
  const nextId = () => `generated-${++sequence}`;
  const deliveries: string[] = [];
  const useCase = new RequestWorkCancellation({ identity, store, executionPorts: [connector],
    deliver: { async execute(companyId) { deliveries.push(companyId); return []; } },
    now: () => "2026-08-20T10:02:00.000Z", nextId });

  await attempts.create({ draft: draft("attempt-queued"), eventId: "event-q", publicationId: "publication-q", actorId: "human-one", expectedEventSequence: 0 });
  const queued = await useCase.execute({ companyId: "company-one", workId: "work-attempt-queued", attemptId: "attempt-queued" });
  assert.equal(queued.status, "CANCELLED");
  assert.deepEqual(deliveries, []);

  await attempts.create({ draft: draft("attempt-running"), eventId: "event-r", publicationId: "publication-r", actorId: "human-one", expectedEventSequence: 2 });
  await attempts.transition({ companyId: "company-one", attemptId: "attempt-running", operation: "ACQUIRE_LEASE",
    lease: { ownerId: "connector-one", fencingToken: 1, acquiredAt: "2026-08-20T10:01:00.000Z", expiresAt: "2026-08-20T10:20:00.000Z" },
    eventId: "event-lease", actorId: "connector-one", occurredAt: "2026-08-20T10:01:00.000Z", expectedEventSequence: 3 });
  await attempts.transition({ companyId: "company-one", attemptId: "attempt-running", operation: "START", fencingToken: 1,
    eventId: "event-start", actorId: "connector-one", occurredAt: "2026-08-20T10:01:01.000Z", expectedEventSequence: 4 });
  const requested = await useCase.execute({ companyId: "company-one", workId: "work-attempt-running", attemptId: "attempt-running" });
  assert.equal(requested.status, "CANCELLATION_REQUESTED");
  assert.deepEqual(deliveries, ["company-one"]);
  assert.equal((await useCase.execute({ companyId: "company-one", workId: "work-attempt-running", attemptId: "attempt-running" })).status, "CANCELLATION_REQUESTED");
  assert.deepEqual(deliveries, ["company-one"]);
});
