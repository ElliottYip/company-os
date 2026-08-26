import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAgentExecutionPort } from "../connectors/http-agent-node/index.mjs";
import { createReferenceAgentNode, JsonFileReferenceNodeStore } from "../connectors/http-agent-node-reference/index.mjs";

test("maintained reference node interoperates with the installed Connector and survives node reconstruction", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-reference-node-"));
  const stateFile = join(directory, "state.json");
  const bearerToken = randomBytes(24).toString("base64url");
  let submitCount = 0;
  let commandCount = 0;
  const driver = {
    async health() { return "HEALTHY"; },
    async submit(submission: { workId: string }, context: { recordObservation(workId: string, value: unknown): Promise<unknown> }) {
      submitCount += 1;
      await context.recordObservation(submission.workId, { workId: submission.workId, sequence: 1, status: "WORKING",
        summary: "Synthetic reference driver accepted work", evidenceRefs: [],
        recordedAt: "2026-08-25T12:00:00.000Z" });
    },
    async command(command: { workId: string; operation: string }, context: { recordObservation(workId: string, value: unknown): Promise<unknown> }) {
      commandCount += 1;
      if (command.operation === "RESUME") await context.recordObservation(command.workId, {
        workId: command.workId, sequence: 2, status: "COMPLETED", summary: "Synthetic reference driver completed work",
        evidenceRefs: ["result-one"], evidenceOutputs: [{ evidenceReference: "result-one",
          contentDigest: `sha256:${"a".repeat(64)}` }], resultReference: "result-one",
        recordedAt: "2026-08-25T12:01:00.000Z",
      });
    },
  };
  const start = async () => {
    const node = createReferenceAgentNode({ bearerToken, store: new JsonFileReferenceNodeStore(stateFile), driver });
    node.listen(0, "127.0.0.1"); await once(node, "listening");
    const address = node.address(); assert.ok(address && typeof address !== "string");
    return { node, baseUrl: `http://127.0.0.1:${address.port}` };
  };
  let active = await start();
  const connector = () => createAgentExecutionPort({ connectorId: "http-agent-node",
    displayName: "Reference Node", baseUrl: active.baseUrl, bearerToken, allowInsecureLoopback: true,
    requestTimeoutMs: 2_000 });
  const request = { id: "work-one", companyId: "company-one", agentId: "agent-one", requestedBy: "human-one",
    goal: "Exercise the reference protocol", input: { actionReferences: ["read"], permissionReferences: [],
      dataAuthorizationReferences: [], responsibilityContractId: "contract-one", responsibilityContractRevision: 1 },
    idempotencyKey: "work-one-v1", timeoutAt: "2026-08-25T13:00:00.000Z" };
  const proof = { proofId: "proof-one", connectorId: "http-agent-node", issuedAt: "2026-08-25T11:59:00.000Z",
    expiresAt: "2026-08-25T12:04:00.000Z", digest: `sha256:${"b".repeat(64)}` };
  try {
    const first = connector();
    const deployment = await first.deploy({ id: "agent-one", companyId: "company-one", displayName: "Agent One",
      runtimeConnectorId: "http-agent-node", accountableHumanId: "human-one", role: "Operator", autonomyLevel: 2 });
    await first.submit(deployment, request, proof);
    await first.submit(deployment, request, proof);
    assert.equal(submitCount, 1);
    active.node.close(); await once(active.node, "close");
    active = await start();
    const restarted = connector();
    assert.equal((await restarted.observe("work-one"))[0]?.status, "WORKING");
    await restarted.resume("work-one", "approval-one");
    await restarted.resume("work-one", "approval-one");
    assert.equal(commandCount, 1);
    assert.equal((await restarted.observe("work-one"))[1]?.resultReference, "result-one");
  } finally {
    if ((active.node as ReturnType<typeof createServer>).listening) {
      active.node.close(); await once(active.node, "close");
    }
  }
});

test("reference node rejects missing authentication and private material before the driver", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-reference-node-security-"));
  const bearerToken = randomBytes(24).toString("base64url");
  let invoked = false;
  const node = createReferenceAgentNode({ bearerToken,
    store: new JsonFileReferenceNodeStore(join(directory, "state.json")),
    driver: { async health() { return "HEALTHY"; }, async submit() { invoked = true; }, async command() {} } });
  node.listen(0, "127.0.0.1"); await once(node, "listening");
  const address = node.address(); assert.ok(address && typeof address !== "string");
  try {
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/v1/health`)).status, 401);
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/work`, { method: "POST",
      headers: { authorization: `Bearer ${bearerToken}`, "content-type": "application/json" },
      body: JSON.stringify({ schemaVersion: 1, deployment: {}, request: { id: "work-one", external_session: "forbidden" },
        runtimeProof: {} }) });
    assert.equal(response.status, 422);
    assert.equal(invoked, false);
  } finally {
    node.close(); await once(node, "close");
  }
});
