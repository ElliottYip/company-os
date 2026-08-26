import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Sha256ConnectorRuntimeSecurity } from "../adapters/connectors/sha256-connector-runtime-security.ts";
import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import { CollectConnectorObservations } from "../application/collect-connector-observations.ts";
import { DeliverConnectorCommands } from "../application/deliver-connector-commands.ts";
import { WorkAttemptService } from "../application/work-attempt-service.ts";
import { DecideHighRiskAction } from "../application/decide-high-risk-action.ts";
import { EventBackedApprovalStore } from "../adapters/storage/event-backed-approval-store.ts";
import { createAgentExecutionPort } from "../connectors/http-agent-node/index.mjs";

const structure = {
  organization: {
    company: { id: "company-one", name: "Company One", purpose: "Operate", locale: "en-US" },
    departments: [{ id: "operations", name: "Operations", mandate: "Operate" }],
    humans: [{ id: "human-one", name: "Human One", title: "Owner", departmentId: "operations", avatarId: "human-one" }],
    agents: [{ id: "agent-one", name: "Agent One", role: "Operator", departmentId: "operations",
      accountableHumanId: "human-one", runtimeConnectorId: "http-agent-node", avatarId: "fish-one", autonomyLevel: 2 }],
  },
  projects: [], workspaces: [],
  positions: [{ id: "position-one", title: "Operator", departmentId: "operations",
    principalId: "agent-one", accountableHumanId: "human-one" }],
  reportingLines: [],
} as const;

test("HTTP Agent Node execution resumes from durable control-plane state after process reconstruction", async () => {
  const remoteObservations = new Map<string, unknown[]>();
  let submitCount = 0;
  const node = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
    const path = new URL(request.url ?? "/", "http://node.test").pathname;
    const send = (status: number, value: unknown) => {
      response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(value));
    };
    if (path === "/v1/health") return send(200, { status: "HEALTHY" });
    if (path === "/v1/deployments") return send(200, { deploymentId: "deployment-one" });
    if (path === "/v1/work") {
      submitCount += 1;
      const workId = (body as { request: { id: string } }).request.id;
      remoteObservations.set(workId, [{ workId, sequence: 1, status: "WORKING",
        summary: "Customer node accepted the referenced work", evidenceRefs: [],
        recordedAt: "2026-08-25T10:02:00.000Z" }]);
      return send(202, { accepted: true, executionId: "execution-one" });
    }
    const match = path.match(/^\/v1\/work\/([^/]+)\/observations$/);
    if (match) return send(200, { observations: remoteObservations.get(match[1] as string) ?? [] });
    return send(404, { error: { code: "NOT_FOUND" } });
  });
  node.listen(0, "127.0.0.1");
  await once(node, "listening");
  const address = node.address();
  assert.ok(address && typeof address !== "string");
  const connectorOptions = { connectorId: "http-agent-node", displayName: "Enterprise HTTP Agent Node",
    baseUrl: `http://127.0.0.1:${address.port}`, bearerToken: "synthetic-restart-token",
    allowInsecureLoopback: true, requestTimeoutMs: 2_000 };
  const directory = await mkdtemp(join(tmpdir(), "company-os-http-node-restart-"));
  try {
    const initialStore = new LocalDurableControlPlaneStore(directory);
    const initialPort = createAgentExecutionPort(connectorOptions);
    const security = new Sha256ConnectorRuntimeSecurity();
    const capabilityDigest = await security.digestCapabilities(await initialPort.capabilities());
    await initialStore.append({ id: "work-event", companyId: "company-one", type: "work.dispatched",
      occurredAt: "2026-08-25T10:00:00.000Z", actorId: "human-one", provenance: "PRODUCTION",
      payload: { work: { id: "work-one", companyId: "company-one", title: "Reconcile invoices",
        goal: "Reconcile the authorized invoice references", scope: "AGENT", departmentId: "operations",
        projectId: null, agentId: "agent-one", requestedBy: "human-one", actionIds: ["read-invoices"],
        parentWorkId: null, accountableHumanId: "human-one", responsibilityContractId: "contract-one",
        runtimeConnectorId: "http-agent-node", status: "PENDING" } } }, 0);
    await new WorkAttemptService(initialStore).create({ draft: { id: "attempt-one", companyId: "company-one",
      workId: "work-one", agentId: "agent-one", attemptNumber: 1, idempotencyKey: "work-one-v1",
      createdAt: "2026-08-25T10:00:01.000Z", timeoutAt: "2026-08-25T11:00:00.000Z",
      authority: { responsibilityContractId: "contract-one", responsibilityContractRevision: 1,
        accountableHumanId: "human-one", actionIds: ["read-invoices"], permissionIds: ["invoice-read"],
        dataAuthorizationIds: ["invoice-data"], connectorId: "http-agent-node", connectorCapabilityDigest: capabilityDigest } },
      eventId: "attempt-event", publicationId: "submit-publication", actorId: "human-one", expectedEventSequence: 1 });
    let ids = 0;
    const delivery = new DeliverConnectorCommands({ store: initialStore,
      structure: { async load() { return structure; } }, executionPorts: [initialPort], runtimeSecurity: security,
      now: () => "2026-08-25T10:01:00.000Z", nextId: () => `delivery-${++ids}` });
    assert.equal((await delivery.execute("company-one"))[0]?.status, "DELIVERED");
    assert.equal(submitCount, 1);
    assert.equal((await new WorkAttemptService(initialStore).load("company-one", "attempt-one"))?.status, "RUNNING");

    remoteObservations.set("work-one", [
      { workId: "work-one", sequence: 1, status: "WORKING", summary: "Customer node accepted the referenced work",
        evidenceRefs: [], recordedAt: "2026-08-25T10:02:00.000Z" },
      { workId: "work-one", sequence: 2, status: "COMPLETED", summary: "Customer node completed the work",
        evidenceRefs: ["evidence-one", "result-one"], evidenceOutputs: [
          { evidenceReference: "evidence-one", contentDigest: `sha256:${"b".repeat(64)}` },
          { evidenceReference: "result-one", contentDigest: `sha256:${"c".repeat(64)}` },
        ], resultReference: "result-one", recordedAt: "2026-08-25T10:04:00.000Z" },
    ]);

    const restartedStore = new LocalDurableControlPlaneStore(directory);
    const restartedPort = createAgentExecutionPort(connectorOptions);
    let observationIds = 0;
    const outcomes = await new CollectConnectorObservations({ store: restartedStore,
      executionPorts: [restartedPort], nextId: () => `observation-${++observationIds}` }).execute("company-one");
    assert.deepEqual(outcomes.map(({ sequence, status }) => ({ sequence, status })), [
      { sequence: 1, status: "RECORDED" }, { sequence: 2, status: "RECORDED" },
    ]);
    const completed = await new WorkAttemptService(restartedStore).load("company-one", "attempt-one");
    assert.equal(completed?.status, "SUCCEEDED");
    assert.equal(completed?.resultId, "result-one");
    assert.equal(submitCount, 1);
    assert.equal((await restartedStore.readPendingPublications("company-one", { afterSequence: 0, limit: 10 })).length, 0);
  } finally {
    node.close();
    await once(node, "close");
  }
});

test("HTTP Agent Node approval pause survives repeated control-plane reconstruction before exact resume", async () => {
  const observations = new Map<string, unknown[]>();
  const commands: string[] = [];
  let submitCount = 0;
  const node = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown> : null;
    const path = new URL(request.url ?? "/", "http://node.test").pathname;
    const send = (status: number, value: unknown) => {
      response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(value));
    };
    if (path === "/v1/health") return send(200, { status: "HEALTHY" });
    if (path === "/v1/deployments") return send(200, { deploymentId: "deployment-approval" });
    if (path === "/v1/work") {
      submitCount += 1;
      const workId = ((body?.request as { id: string }).id);
      observations.set(workId, [{
        workId, sequence: 1, status: "AWAITING_APPROVAL",
        summary: "Human approval required before publishing the referenced report",
        evidenceRefs: ["evidence-review"],
        evidenceOutputs: [{ evidenceReference: "evidence-review", contentDigest: `sha256:${"b".repeat(64)}` }],
        approvalRequest: {
          requestId: "approval-publish", expiresAt: "2026-08-25T10:45:00.000Z",
          action: { id: "publish-report", type: "publish", description: "Publish the reviewed report",
            inputDigest: `sha256:${"c".repeat(64)}`, risk: "HIGH" },
        },
        recordedAt: "2026-08-25T10:05:00.000Z",
      }]);
      return send(202, { accepted: true, executionId: "execution-approval" });
    }
    const observationMatch = path.match(/^\/v1\/work\/([^/]+)\/observations$/);
    if (observationMatch) return send(200, { observations: observations.get(observationMatch[1] as string) ?? [] });
    const commandMatch = path.match(/^\/v1\/work\/([^/]+)\/commands$/);
    if (commandMatch) {
      const operation = body?.operation;
      if (typeof operation !== "string") return send(422, { error: { code: "INVALID_OPERATION" } });
      commands.push(operation);
      if (operation === "RESUME") observations.set(commandMatch[1] as string, [
        ...(observations.get(commandMatch[1] as string) ?? []),
        { workId: commandMatch[1], sequence: 2, status: "COMPLETED",
          summary: "Published the human-approved report", evidenceRefs: ["evidence-review", "result-report"],
          evidenceOutputs: [
            { evidenceReference: "evidence-review", contentDigest: `sha256:${"b".repeat(64)}` },
            { evidenceReference: "result-report", contentDigest: `sha256:${"d".repeat(64)}` },
          ], resultReference: "result-report", recordedAt: "2026-08-25T10:12:00.000Z" },
      ]);
      return send(202, { accepted: true });
    }
    return send(404, { error: { code: "NOT_FOUND" } });
  });
  node.listen(0, "127.0.0.1");
  await once(node, "listening");
  const address = node.address();
  assert.ok(address && typeof address !== "string");
  const connectorOptions = { connectorId: "http-agent-node", displayName: "Enterprise HTTP Agent Node",
    baseUrl: `http://127.0.0.1:${address.port}`, bearerToken: "synthetic-approval-restart-token",
    allowInsecureLoopback: true, requestTimeoutMs: 2_000 };
  const directory = await mkdtemp(join(tmpdir(), "company-os-http-node-approval-restart-"));
  const security = new Sha256ConnectorRuntimeSecurity();
  let id = 0;
  const nextId = () => `approval-restart-${++id}`;
  const port = () => createAgentExecutionPort(connectorOptions);
  const structurePort = { async load() { return structure; } };
  try {
    const firstStore = new LocalDurableControlPlaneStore(directory);
    const firstPort = port();
    const capabilityDigest = await security.digestCapabilities(await firstPort.capabilities());
    await firstStore.append({ id: nextId(), companyId: "company-one", type: "work.dispatched",
      occurredAt: "2026-08-25T10:00:00.000Z", actorId: "human-one", provenance: "PRODUCTION",
      payload: { work: { id: "work-approval", companyId: "company-one", title: "Publish report",
        goal: "Publish the reviewed report", scope: "AGENT", departmentId: "operations", projectId: null,
        agentId: "agent-one", requestedBy: "human-one", actionIds: ["publish-report"], parentWorkId: null,
        accountableHumanId: "human-one", responsibilityContractId: "contract-one",
        runtimeConnectorId: "http-agent-node", status: "PENDING" } } }, 0);
    await new WorkAttemptService(firstStore).create({ draft: { id: "attempt-approval", companyId: "company-one",
      workId: "work-approval", agentId: "agent-one", attemptNumber: 1, idempotencyKey: "work-approval-v1",
      createdAt: "2026-08-25T10:00:01.000Z", timeoutAt: "2026-08-25T11:00:00.000Z",
      authority: { responsibilityContractId: "contract-one", responsibilityContractRevision: 1,
        accountableHumanId: "human-one", actionIds: ["publish-report"], permissionIds: ["report-publish"],
        dataAuthorizationIds: ["report-data"], connectorId: "http-agent-node", connectorCapabilityDigest: capabilityDigest } },
      eventId: nextId(), publicationId: nextId(), actorId: "human-one", expectedEventSequence: 1 });
    const firstDelivery = new DeliverConnectorCommands({ store: firstStore, structure: structurePort,
      executionPorts: [firstPort], runtimeSecurity: security,
      now: () => "2026-08-25T10:01:00.000Z", nextId });
    assert.equal((await firstDelivery.execute("company-one"))[0]?.status, "DELIVERED");
    assert.equal(submitCount, 1);

    const secondStore = new LocalDurableControlPlaneStore(directory);
    const secondPort = port();
    const secondApprovals = new EventBackedApprovalStore(secondStore, "company-one", nextId,
      () => "2026-08-25T10:05:00.000Z");
    await new CollectConnectorObservations({ store: secondStore, executionPorts: [secondPort],
      approvals: secondApprovals, nextId }).execute("company-one");
    assert.equal((await new WorkAttemptService(secondStore).load("company-one", "attempt-approval"))?.status,
      "AWAITING_APPROVAL");
    const pauseDelivery = new DeliverConnectorCommands({ store: secondStore, structure: structurePort,
      executionPorts: [secondPort], runtimeSecurity: security,
      now: () => "2026-08-25T10:06:00.000Z", nextId });
    assert.equal((await pauseDelivery.execute("company-one"))[0]?.status, "DELIVERED");
    assert.deepEqual(commands, ["PAUSE"]);

    const thirdStore = new LocalDurableControlPlaneStore(directory);
    const thirdPort = port();
    const thirdApprovals = new EventBackedApprovalStore(thirdStore, "company-one", nextId,
      () => "2026-08-25T10:08:00.000Z");
    const request = (await thirdApprovals.pending("company-one"))[0]!;
    await new DecideHighRiskAction({
      identity: { async getCurrentIdentity() { return { actorId: "human-one", organizationId: "company-one",
        displayName: "Human One", assurance: "ENTERPRISE_ASSERTED" as const }; },
      async currentPrincipal() { return null; }, async authorize() { return { id: nextId(), principalId: "human-one",
        authorizedAt: "2026-08-25T10:08:00.000Z" }; } },
      approvals: thirdApprovals, events: thirdStore, attempts: new WorkAttemptService(thirdStore),
      now: () => "2026-08-25T10:08:00.000Z", nextId,
    }).execute({ companyId: "company-one", requestId: request.id, expectedBinding: request.binding,
      decision: "APPROVED" });
    const resumeDelivery = new DeliverConnectorCommands({ store: thirdStore, structure: structurePort,
      executionPorts: [thirdPort], runtimeSecurity: security,
      now: () => "2026-08-25T10:09:00.000Z", nextId });
    assert.equal((await resumeDelivery.execute("company-one"))[0]?.status, "DELIVERED");
    assert.deepEqual(commands, ["PAUSE", "RESUME"]);

    const fourthStore = new LocalDurableControlPlaneStore(directory);
    await new CollectConnectorObservations({ store: fourthStore, executionPorts: [port()],
      approvals: new EventBackedApprovalStore(fourthStore, "company-one", nextId,
        () => "2026-08-25T10:12:00.000Z"), nextId }).execute("company-one");
    const completed = await new WorkAttemptService(fourthStore).load("company-one", "attempt-approval");
    assert.equal(completed?.status, "SUCCEEDED");
    assert.equal(completed?.resultId, "result-report");
    assert.equal(submitCount, 1);
    assert.equal((await fourthStore.readPendingPublications("company-one", { afterSequence: 0, limit: 10 })).length, 0);
  } finally {
    node.close();
    await once(node, "close");
  }
});
