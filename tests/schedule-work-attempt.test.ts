import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Sha256ConnectorRuntimeSecurity } from "../adapters/connectors/sha256-connector-runtime-security.ts";
import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import { ScheduleWorkAttempt } from "../application/schedule-work-attempt.ts";
import type { AgentExecutionPort } from "../ports/agent-execution-port.ts";

const work = {
  id: "work-one", companyId: "company-one", title: "Prepare report",
  goal: "Prepare the approved operational report", scope: "AGENT" as const,
  departmentId: "department-one", projectId: null, agentId: "agent-one",
  requestedBy: "human-one", actionIds: ["read-knowledge"] as const, parentWorkId: null,
  accountableHumanId: "human-one", responsibilityContractId: "contract-one",
  runtimeConnectorId: "connector-one", status: "PENDING" as const,
};

const port: AgentExecutionPort = {
  async capabilities() {
    return {
      connectorId: "connector-one", displayName: "Connector One", protocolVersion: "1.0",
      supportsPause: true, supportsResume: true, supportsCancellation: true,
      supportsEvidence: true, maximumTimeoutSeconds: 600,
    };
  },
  async health() { return "HEALTHY"; },
  async deploy(agent) { return { id: "deployment-one", agentId: agent.id, connectorId: "connector-one" }; },
  async submit() { return { accepted: true, executionId: "execution-one" }; },
  async observe() { return []; },
  async pause() {}, async resume() {}, async cancel() {},
};

test("Paperclip-aligned scheduling creates one idempotent durable attempt and one command", async () => {
  const store = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-schedule-")));
  let id = 0;
  const service = new ScheduleWorkAttempt({
    store, executionPorts: [port], runtimeSecurity: new Sha256ConnectorRuntimeSecurity(),
    nextId: () => `scheduled-id-${++id}`,
  });
  const command = {
    work, responsibilityContractRevision: 3, authorizationReceiptId: "receipt-one",
    modelAuthority: {
      policyId: "default-models", routeId: "local-primary", providerAdapterId: "provider-one",
      modelReference: "model-one", classification: "INTERNAL" as const, residency: "LOCAL" as const,
      credentialReferenceId: "model-secret-one", credentialVersion: 7,
      providerCapabilityDigest: `sha256:${"b".repeat(64)}`,
    },
    scheduledAt: "2026-08-24T11:00:00.000Z",
  } as const;
  const first = await service.execute(command);
  const replay = await service.execute(command);
  assert.equal(replay.id, first.id);
  assert.equal(first.timeoutAt, "2026-08-24T11:10:00.000Z");
  assert.deepEqual(first.authority.permissionIds, ["receipt-one"]);
  assert.equal(first.authority.model?.routeId, "local-primary");
  assert.equal((await store.read("company-one", { types: ["work-attempt.recorded"] })).length, 1);
  assert.equal((await store.readPendingPublications("company-one", { afterSequence: 0, limit: 10 })).length, 1);
});

test("scheduling fails closed before persistence when no live Connector is installed", async () => {
  const store = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-schedule-")));
  const service = new ScheduleWorkAttempt({
    store, executionPorts: [], runtimeSecurity: new Sha256ConnectorRuntimeSecurity(),
    nextId: () => "unused-id",
  });
  await assert.rejects(service.execute({
    work, responsibilityContractRevision: 1, authorizationReceiptId: "receipt-one",
    scheduledAt: "2026-08-24T11:00:00.000Z",
  }), /AGENT_EXECUTION_PORT_NOT_REGISTERED/);
  assert.equal((await store.read("company-one")).length, 0);
});
