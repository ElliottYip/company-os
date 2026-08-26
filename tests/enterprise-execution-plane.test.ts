import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Sha256ConnectorRuntimeSecurity } from "../adapters/connectors/sha256-connector-runtime-security.ts";
import { EventBackedApprovalStore } from "../adapters/storage/event-backed-approval-store.ts";
import { EventBackedGenericWorkStore } from "../adapters/storage/event-backed-generic-work-store.ts";
import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import { AccessGovernedData } from "../application/access-governed-data.ts";
import { CollectConnectorObservations } from "../application/collect-connector-observations.ts";
import { DecideHighRiskAction } from "../application/decide-high-risk-action.ts";
import { DeliverConnectorCommands } from "../application/deliver-connector-commands.ts";
import { DispatchAccountableWork } from "../application/dispatch-accountable-work.ts";
import { IssueSecretLease } from "../application/issue-secret-lease.ts";
import { PrepareWorkExecution } from "../application/prepare-work-execution.ts";
import { ScheduleWorkAttempt } from "../application/schedule-work-attempt.ts";
import { WorkAttemptService } from "../application/work-attempt-service.ts";
import { RevokeAttemptSecretLeases } from "../application/revoke-attempt-secret-leases.ts";
import { createSecretBrokerRuntimePort } from "../brokers/http-secret-broker/index.mjs";
import { createAgentExecutionPort } from "../connectors/http-agent-node/index.mjs";
import {
  createReferenceAgentNode,
  JsonFileReferenceNodeStore,
} from "../connectors/http-agent-node-reference/index.mjs";
import { createDataConnectorPort } from "../connectors/http-data-node/index.mjs";
import type { IdentityPort } from "../ports/identity-port.ts";

const organization = {
  company: { id: "company-one", name: "Company One", purpose: "Fixture admission", locale: "en-US" },
  departments: [{ id: "operations", name: "Operations", mandate: "Operate accountably" }],
  humans: [{ id: "human-one", name: "Human One", title: "Agent Boss", departmentId: "operations", avatarId: "human-one" }],
  agents: [{ id: "agent-one", name: "Fixture Agent", role: "Publisher", departmentId: "operations",
    accountableHumanId: "human-one", runtimeConnectorId: "http-agent-node",
    avatarId: "fish-one", autonomyLevel: 2 }],
};

const structure = {
  organization, projects: [], workspaces: [],
  positions: [{ id: "position-agent", title: "Publisher", departmentId: "operations",
    principalId: "agent-one", accountableHumanId: "human-one" }],
  reportingLines: [],
};

function identity(nextId: () => string): IdentityPort {
  return {
    async getCurrentIdentity() {
      return { actorId: "human-one", organizationId: "company-one", displayName: "Human One",
        assurance: "ENTERPRISE_ASSERTED" };
    },
    async currentPrincipal() { return { id: "human-one", kind: "HUMAN", displayName: "Human One" }; },
    async authorize() {
      return { id: nextId(), principalId: "human-one", authorizedAt: "2026-08-25T10:00:00.000Z" };
    },
  };
}

async function listen(server: Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  server.close();
  await once(server, "close");
}

test("three independent fixture nodes complete one governed approval and evidence chain", async () => {
  const dataBearer = "fixture-data-node-bearer";
  const brokerBearer = "fixture-secret-broker-bearer";
  const agentBearer = "fixture-agent-node-bearer";
  const nodeCalls = { data: 0, broker: 0, revocations: 0, agentSubmit: 0, commands: [] as string[] };
  let agentSubmission: unknown = null;

  const dataNode = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
    const send = (status: number, payload: unknown) => {
      response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(payload));
    };
    if (request.headers.authorization !== `Bearer ${dataBearer}`) return send(401, { error: { code: "AUTHENTICATION_REQUIRED" } });
    if (request.url === "/v1/health") return send(200, { status: "HEALTHY" });
    if (request.url === "/v1/data-access" && request.method === "POST") {
      nodeCalls.data += 1;
      assert.equal(body.request.workId, "work-one");
      return send(201, { result: { type: "GRANTED", dataReference: "customer-data-reference",
        evidenceReference: "data-access-evidence", contentDigest: `sha256:${"a".repeat(64)}` } });
    }
    return send(404, { error: { code: "NOT_FOUND" } });
  });

  const brokerNode = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
    const path = new URL(request.url ?? "/", "http://broker.fixture").pathname;
    const send = (status: number, payload: unknown) => {
      response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(payload));
    };
    if (request.headers.authorization !== `Bearer ${brokerBearer}`) return send(401, { error: { code: "AUTHENTICATION_REQUIRED" } });
    if (path === "/v1/health") return send(200, { status: "HEALTHY" });
    if (path === "/v1/companies/company-one/references/connector-credential-one") return send(200, { reference: {
      id: "connector-credential-one", companyId: "company-one", purpose: "AGENT_CONNECTOR",
      providerAdapterId: "http-agent-node", currentVersion: 2, status: "ACTIVE",
    } });
    if (path === "/v1/leases" && request.method === "POST") {
      nodeCalls.broker += 1;
      const intent = body.intent;
      return send(201, { lease: { id: "execution-grant-one", secretReferenceId: intent.secretReferenceId,
        version: intent.expectedVersion, consumerId: intent.consumerId, workAttemptId: intent.workAttemptId,
        issuedAt: "2026-08-25T10:00:01.000Z", expiresAt: intent.expiresAt,
        attestationDigest: `sha256:${"b".repeat(64)}` } });
    }
    if (path === "/v1/companies/company-one/leases/execution-grant-one/revocations" && request.method === "POST") {
      nodeCalls.revocations += 1;
      return send(202, { revoked: true });
    }
    return send(404, { error: { code: "SECRET_REFERENCE_NOT_FOUND", retryable: false } });
  });

  const directory = await mkdtemp(join(tmpdir(), "company-os-three-node-admission-"));
  const agentNode = createReferenceAgentNode({
    store: new JsonFileReferenceNodeStore(join(directory, "agent-node.json")),
    bearerToken: agentBearer,
    driver: {
      async health() { return "HEALTHY"; },
      async deploy() {},
      async submit(submission: unknown, context: { recordObservation(workId: string, value: unknown): Promise<unknown> }) {
        nodeCalls.agentSubmit += 1;
        agentSubmission = structuredClone(submission);
        await context.recordObservation("work-one", {
          workId: "work-one", sequence: 1, status: "AWAITING_APPROVAL",
          summary: "Fixture node paused before the exact external action",
          evidenceRefs: ["review-evidence"],
          evidenceOutputs: [{ evidenceReference: "review-evidence", contentDigest: `sha256:${"c".repeat(64)}` }],
          approvalRequest: { requestId: "approval-one", expiresAt: "2026-08-25T10:20:00.000Z",
            action: { id: "publish-content", type: "publish-content", description: "Publish reviewed report",
              inputDigest: `sha256:${"d".repeat(64)}`, risk: "HIGH" } },
          recordedAt: "2026-08-25T10:02:00.000Z",
        });
      },
      async command(command: { workId: string; operation: string }, context: { recordObservation(workId: string, value: unknown): Promise<unknown> }) {
        nodeCalls.commands.push(command.operation);
        if (command.operation === "RESUME") await context.recordObservation(command.workId, {
          workId: command.workId, sequence: 2, status: "COMPLETED",
          summary: "Fixture node completed the human-approved action",
          evidenceRefs: ["review-evidence", "result-evidence"],
          evidenceOutputs: [
            { evidenceReference: "review-evidence", contentDigest: `sha256:${"c".repeat(64)}` },
            { evidenceReference: "result-evidence", contentDigest: `sha256:${"e".repeat(64)}` },
          ], resultReference: "result-evidence", recordedAt: "2026-08-25T10:05:00.000Z",
        });
      },
    },
  });

  const [dataUrl, brokerUrl, agentUrl] = await Promise.all([
    listen(dataNode), listen(brokerNode), listen(agentNode),
  ]);
  try {
    const store = new LocalDurableControlPlaneStore(join(directory, "control-plane"));
    let sequence = 0;
    const nextId = () => `admission-${++sequence}`;
    const humanIdentity = identity(nextId);
    const dataPort = createDataConnectorPort({ connectorId: "data-node", displayName: "Fixture Data Node",
      dataSourceIds: ["crm-one"], supportedOperations: ["READ"], baseUrl: dataUrl,
      bearerToken: dataBearer, allowInsecureLoopback: true, requestTimeoutMs: 2_000 });
    const brokerPort = createSecretBrokerRuntimePort({ brokerId: "broker-one", displayName: "Fixture Broker",
      baseUrl: brokerUrl, bearerToken: brokerBearer, allowInsecureLoopback: true,
      requestTimeoutMs: 2_000, maximumLeaseSeconds: 600 });
    const agentPort = createAgentExecutionPort({ connectorId: "http-agent-node", displayName: "Fixture Agent Node",
      baseUrl: agentUrl, bearerToken: agentBearer, allowInsecureLoopback: true, requestTimeoutMs: 2_000 });
    const security = new Sha256ConnectorRuntimeSecurity();
    const structurePort = { async load() { return structure; } };
    const delivery = (time: string) => new DeliverConnectorCommands({ store, structure: structurePort,
      executionPorts: [agentPort], runtimeSecurity: security, now: () => time, nextId });
    const approvals = new EventBackedApprovalStore(store, "company-one", nextId,
      () => "2026-08-25T10:03:00.000Z");
    const dispatch = new DispatchAccountableWork({
      identity: humanIdentity,
      organization: { async getOrganization() { return organization; }, async listPrincipals() { return []; } },
      contracts: { async load() { return { revision: 1, contracts: [{ id: "responsibility-one",
        companyId: "company-one", agentId: "agent-one", accountableHumanId: "human-one",
        backupHumanId: null, autonomyLevel: 2, allowedActions: ["read-knowledge", "publish-content"],
        approvalRequiredActions: ["publish-content"], escalationTimeoutSeconds: null, status: "ACTIVE" }] }; },
      async replace() { throw new Error("not used"); } },
      genericWork: new EventBackedGenericWorkStore(store, () => "2026-08-25T10:00:00.000Z", nextId),
      events: store,
      lifecycle: { async load() { return { revision: 1, agents: [{ companyId: "company-one", agentId: "agent-one",
        status: "idle" as const, pauseReason: null, pausedAt: null, errorCode: null,
        updatedAt: "2026-08-25T10:00:00.000Z" }] }; }, async transition() { throw new Error("not used"); } },
      structure: structurePort,
      maintenance: { async load() { return { schemaVersion: 1 as const, mode: "OPEN" as const,
        revision: 0, operationId: null, authorizationReference: null, changedBy: null, changedAt: null }; } },
      now: () => "2026-08-25T10:00:00.000Z", nextId,
      attemptScheduler: new ScheduleWorkAttempt({ store, executionPorts: [agentPort], runtimeSecurity: security, nextId }),
      commandDelivery: delivery("2026-08-25T10:01:00.000Z"),
      executionPreparation: new PrepareWorkExecution({
        events: store,
        dataAccess: new AccessGovernedData({ identity: humanIdentity,
          governance: { async load() { return { companyId: "company-one", revision: 1, modelRoutingPolicies: [],
            dataAuthorizationContracts: [{ id: "data-contract-one", companyId: "company-one",
              dataSourceId: "crm-one", authorizedAgentIds: ["agent-one"], authorizedOperations: ["READ"],
              allowedPurposes: ["customer-report"], maximumClassification: "CONFIDENTIAL",
              allowedExportDestinations: [], validFrom: "2026-08-25T00:00:00.000Z",
              validUntil: "2026-08-26T00:00:00.000Z", status: "ACTIVE" }] }; },
          async replace() { throw new Error("not used"); } }, events: store, connectors: [dataPort],
          now: () => "2026-08-25T10:00:00.000Z", nextId }),
        secretLeases: new IssueSecretLease({ identity: humanIdentity, broker: brokerPort, events: store,
          now: () => "2026-08-25T10:00:00.000Z", nextId }),
        now: () => "2026-08-25T10:00:00.000Z", nextId,
      }),
    });

    const created = await dispatch.execute({ draft: { id: "work-one", companyId: "company-one",
      title: "Publish customer report", goal: "Prepare and publish the reviewed customer report.",
      scope: "AGENT", departmentId: "operations", projectId: null, agentId: "agent-one",
      requestedBy: "human-one", actionIds: ["read-knowledge", "publish-content"], parentWorkId: null },
    genericGoalId: null, executionPreparation: {
      dataAccess: [{ requestId: "data-request-one", contractId: "data-contract-one", dataSourceId: "crm-one",
        operation: "READ", purpose: "customer-report", classification: "CONFIDENTIAL",
        destinationId: null, contentDigest: null }],
      secretLeases: [{ secretReferenceId: "connector-credential-one", expectedVersion: 2,
        reasonCode: "WORK_EXECUTION", leaseDurationSeconds: 300 }],
    } });
    assert.equal(created.connectorDelivery?.[0] && (created.connectorDelivery[0] as { status: string }).status, "DELIVERED");
    assert.deepEqual(nodeCalls, { data: 1, broker: 1, revocations: 0, agentSubmit: 1, commands: [] });

    await new CollectConnectorObservations({ store, executionPorts: [agentPort], approvals, nextId })
      .execute("company-one");
    assert.equal((await new WorkAttemptService(store).load("company-one", created.attempt!.id))?.status,
      "AWAITING_APPROVAL");
    await delivery("2026-08-25T10:03:00.000Z").execute("company-one");
    const approval = (await approvals.pending("company-one"))[0]!;
    await new DecideHighRiskAction({ identity: humanIdentity, approvals, events: store,
      attempts: new WorkAttemptService(store), now: () => "2026-08-25T10:03:30.000Z", nextId })
      .execute({ companyId: "company-one", requestId: approval.id,
        expectedBinding: approval.binding, decision: "APPROVED" });
    await delivery("2026-08-25T10:04:00.000Z").execute("company-one");
    await new CollectConnectorObservations({ store, executionPorts: [agentPort], approvals, nextId })
      .execute("company-one");

    const completed = await new WorkAttemptService(store).load("company-one", created.attempt!.id);
    assert.equal(completed?.status, "SUCCEEDED");
    assert.equal(completed?.resultId, "result-evidence");
    assert.deepEqual(nodeCalls.commands, ["PAUSE", "RESUME"]);
    await new RevokeAttemptSecretLeases({ events: store, broker: brokerPort,
      now: () => "2026-08-25T10:06:00.000Z", nextId }).execute("company-one");
    assert.equal(nodeCalls.revocations, 1);
    const submissionText = JSON.stringify(agentSubmission);
    assert.match(submissionText, /customer-data-reference/);
    assert.match(submissionText, /execution-grant-one/);
    const controlPlaneText = JSON.stringify(await store.read("company-one"));
    for (const forbidden of [dataBearer, brokerBearer, agentBearer]) {
      assert.equal(controlPlaneText.includes(forbidden), false);
      assert.equal(submissionText.includes(forbidden), false);
    }
    assert.doesNotMatch(controlPlaneText, /customerRecord|credentialValue|privateReasoning|externalSession/i);
    assert.equal((await store.readPendingPublications("company-one", { afterSequence: 0, limit: 100 })).length, 0);
  } finally {
    await Promise.all([close(dataNode), close(brokerNode), close(agentNode)]);
  }
});
