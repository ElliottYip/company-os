import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";

import { runConnectorConformance } from "../connector-sdk/conformance.ts";
import { loadFormalConnectors } from "../adapters/connectors/load-formal-connectors.ts";
import {
  createAgentExecutionPort,
  validateHttpAgentNodeConfiguration,
} from "../connectors/http-agent-node/index.mjs";

interface CapturedRequest {
  readonly method: string;
  readonly path: string;
  readonly authorization: string | null;
  readonly body: unknown;
}

test("separately packaged HTTP Agent Node connector passes conformance and survives adapter restart", async () => {
  const requests: CapturedRequest[] = [];
  const observations = new Map<string, unknown[]>();
  const deployments = new Map<string, string>();
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
    const url = new URL(request.url ?? "/", "http://node.test");
    requests.push({ method: request.method ?? "GET", path: url.pathname,
      authorization: request.headers.authorization ?? null, body });
    const send = (status: number, value: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(value));
    };
    if (url.pathname === "/v1/health") return send(200, { status: "HEALTHY" });
    if (url.pathname === "/v1/deployments" && request.method === "POST") {
      const agentId = (body as { agent: { id: string } }).agent.id;
      const deploymentId = deployments.get(agentId) ?? `deployment-${agentId}`;
      deployments.set(agentId, deploymentId);
      return send(200, { deploymentId });
    }
    if (url.pathname === "/v1/work" && request.method === "POST") {
      const workId = (body as { request: { id: string } }).request.id;
      if (!observations.has(workId)) observations.set(workId, [{
        workId, sequence: 1, status: "WORKING", summary: "Synthetic node accepted work",
        evidenceRefs: [], recordedAt: "2026-08-18T08:01:00.000Z",
      }]);
      return send(202, { accepted: true, executionId: `execution-${workId}` });
    }
    const observationMatch = url.pathname.match(/^\/v1\/work\/([^/]+)\/observations$/);
    if (observationMatch && request.method === "GET") {
      return send(200, { observations: observations.get(observationMatch[1] as string) ?? [] });
    }
    const commandMatch = url.pathname.match(/^\/v1\/work\/([^/]+)\/commands$/);
    if (commandMatch && request.method === "POST") {
      const workId = commandMatch[1] as string;
      const existing = observations.get(workId) ?? [];
      const operation = (body as { operation: string }).operation;
      const status = operation === "PAUSE" ? "WAITING" : operation === "CANCEL" ? "CANCELLED" : "WORKING";
      observations.set(workId, [...existing, { workId, sequence: existing.length + 1, status,
        summary: `Synthetic node ${operation.toLowerCase()}`, evidenceRefs: [],
        recordedAt: `2026-08-18T08:0${existing.length + 1}:00.000Z` }]);
      return send(202, { accepted: true });
    }
    return send(404, { error: { code: "NOT_FOUND" } });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const options = {
    connectorId: "http-agent-node", displayName: "Enterprise HTTP Agent Node",
    baseUrl: `http://127.0.0.1:${address.port}`, bearerToken: "synthetic-test-token",
    allowInsecureLoopback: true, requestTimeoutMs: 2_000,
  };
  try {
    await runConnectorConformance(() => createAgentExecutionPort(options));
    const restarted = createAgentExecutionPort(options);
    const afterRestart = await restarted.observe("work-conformance");
    assert.equal(afterRestart.at(-1)?.status, "CANCELLED");
    observations.set("work-usage", [{ workId: "work-usage", sequence: 1, status: "COMPLETED",
      summary: "Real-node-shaped usage fixture", evidenceRefs: ["usage-one"],
      evidenceOutputs: [{ evidenceReference: "usage-one", contentDigest: `sha256:${"a".repeat(64)}` }],
      usageOutputs: [{ usageReference: "usage-one", biller: "provider-one", billingType: "metered_api",
        costStatus: "reported", inputTokens: 10, cachedInputTokens: 0, outputTokens: 5, costCents: 4,
        occurredAt: "2026-08-18T08:01:00.000Z" }], resultReference: "result-one",
      recordedAt: "2026-08-18T08:02:00.000Z" }]);
    assert.equal((await restarted.observe("work-usage"))[0]?.usageOutputs?.[0]?.costCents, 4);
    observations.set("work-bad-usage", [{ workId: "work-bad-usage", sequence: 1, status: "WORKING",
      summary: "Malformed usage", evidenceRefs: [], usageOutputs: [{ usageReference: "usage-one",
        biller: "provider-one", billingType: "metered_api", costStatus: "reported",
        inputTokens: -1, cachedInputTokens: 0, outputTokens: 0, costCents: 0,
        occurredAt: "2026-08-18T08:01:00.000Z" }], recordedAt: "2026-08-18T08:02:00.000Z" }]);
    await assert.rejects(restarted.observe("work-bad-usage"), /HTTP_AGENT_NODE_OBSERVATION_INVALID/);
    assert.ok(requests.length > 6);
    assert.ok(requests.every(({ authorization }) => authorization === "Bearer synthetic-test-token"));
    const serializedBodies = JSON.stringify(requests.map(({ body }) => body));
    assert.equal(serializedBodies.includes("synthetic-test-token"), false);
    assert.equal(serializedBodies.includes("externalSession"), false);
    assert.equal(serializedBodies.includes("privateReasoning"), false);
    const environmentKeys = [
      "COMPANY_OS_HTTP_AGENT_NODE_ID", "COMPANY_OS_HTTP_AGENT_NODE_NAME",
      "COMPANY_OS_HTTP_AGENT_NODE_BASE_URL", "COMPANY_OS_HTTP_AGENT_NODE_BEARER_TOKEN",
      "COMPANY_OS_HTTP_AGENT_NODE_ALLOW_INSECURE_LOOPBACK", "COMPANY_OS_HTTP_AGENT_NODE_TIMEOUT_MS",
      "COMPANY_OS_HTTP_AGENT_NODE_MAXIMUM_TIMEOUT_SECONDS",
    ] as const;
    const previous = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
    try {
      process.env.COMPANY_OS_HTTP_AGENT_NODE_ID = options.connectorId;
      process.env.COMPANY_OS_HTTP_AGENT_NODE_NAME = options.displayName;
      process.env.COMPANY_OS_HTTP_AGENT_NODE_BASE_URL = options.baseUrl;
      process.env.COMPANY_OS_HTTP_AGENT_NODE_BEARER_TOKEN = options.bearerToken;
      process.env.COMPANY_OS_HTTP_AGENT_NODE_ALLOW_INSECURE_LOOPBACK = "true";
      process.env.COMPANY_OS_HTTP_AGENT_NODE_TIMEOUT_MS = String(options.requestTimeoutMs);
      process.env.COMPANY_OS_HTTP_AGENT_NODE_MAXIMUM_TIMEOUT_SECONDS = "3600";
      const installed = await loadFormalConnectors(["@company-os/http-agent-node-connector"]);
      assert.equal(installed.length, 1);
      assert.equal((await installed[0]?.capabilities()).connectorId, "http-agent-node");
      assert.equal((await installed[0]?.capabilities()).maximumTimeoutSeconds, 3600);
      assert.equal(await installed[0]?.health(), "HEALTHY");
    } finally {
      for (const key of environmentKeys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("HTTP Agent Node connector configuration fails closed before network access", () => {
  assert.throws(() => validateHttpAgentNodeConfiguration({ connectorId: "bad_id", displayName: "Bad",
    baseUrl: "https://agent.example", bearerToken: "token", allowInsecureLoopback: false,
    requestTimeoutMs: 1_000 }), /HTTP_AGENT_NODE_CONNECTOR_ID_INVALID/);
  assert.throws(() => validateHttpAgentNodeConfiguration({ connectorId: "node-one", displayName: "Node",
    baseUrl: "http://agent.example", bearerToken: "token", allowInsecureLoopback: false,
    requestTimeoutMs: 1_000 }), /HTTP_AGENT_NODE_TLS_REQUIRED/);
  assert.throws(() => validateHttpAgentNodeConfiguration({ connectorId: "node-one", displayName: "Node",
    baseUrl: "https://user:password@agent.example", bearerToken: "token", allowInsecureLoopback: false,
    requestTimeoutMs: 1_000 }), /HTTP_AGENT_NODE_URL_CREDENTIALS_FORBIDDEN/);
  assert.throws(() => validateHttpAgentNodeConfiguration({ connectorId: "node-one", displayName: "Node",
    baseUrl: "https://agent.example", bearerToken: "", allowInsecureLoopback: false,
    requestTimeoutMs: 1_000 }), /HTTP_AGENT_NODE_BEARER_TOKEN_REQUIRED/);
  assert.throws(() => validateHttpAgentNodeConfiguration({ connectorId: "node-one", displayName: "Node",
    baseUrl: "https://agent.example", bearerToken: "token", allowInsecureLoopback: false,
    requestTimeoutMs: 1_000, maximumTimeoutSeconds: 0 }), /HTTP_AGENT_NODE_MAXIMUM_WORK_TIMEOUT_INVALID/);
});
