import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";

import { createDataConnectorPort, validateHttpDataNodeConfiguration } from "../connectors/http-data-node/index.mjs";

test("HTTP Data Node returns reference-only governed output across adapter reconstruction", async () => {
  const bearer = randomBytes(24).toString("hex");
  const requests: { authorization: string | null; body: unknown }[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
    requests.push({ authorization: request.headers.authorization ?? null, body });
    const send = (status: number, value: unknown) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(value)); };
    if (request.url === "/v1/health") return send(200, { status: "HEALTHY" });
    if (request.url === "/v1/data-access" && request.method === "POST") return send(201, { result: {
      type: "GRANTED", dataReference: "export-one", evidenceReference: "evidence-one",
      contentDigest: `sha256:${"a".repeat(64)}`,
    } });
    return send(404, { error: { code: "NOT_FOUND" } });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const options = { connectorId: "data-node", displayName: "Enterprise Data Node",
    dataSourceIds: ["warehouse-one"], supportedOperations: ["READ", "EXPORT"],
    baseUrl: `http://127.0.0.1:${address.port}`, bearerToken: bearer,
    allowInsecureLoopback: true, requestTimeoutMs: 2_000 };
  const request = { requestId: "request-one", companyId: "company-one", workId: "work-one",
    agentId: "agent-one", dataSourceId: "warehouse-one", operation: "EXPORT", purpose: "board-report",
    classification: "CONFIDENTIAL", destinationId: "board-portal", contentDigest: `sha256:${"a".repeat(64)}`,
    requestedAt: "2026-08-25T12:00:00.000Z", authorizationContractId: "contract-one",
    authorizationReceiptId: "receipt-one" } as const;
  try {
    const connector = createDataConnectorPort(options);
    assert.equal(await connector.health(), "HEALTHY");
    assert.equal((await connector.access(request)).dataReference, "export-one");
    assert.equal((await createDataConnectorPort(options).access(request)).evidenceReference, "evidence-one");
    assert.ok(requests.every(({ authorization }) => authorization === `Bearer ${bearer}`));
    const bodies = JSON.stringify(requests.map(({ body }) => body));
    assert.equal(bodies.includes(bearer), false);
    assert.doesNotMatch(bodies, /recordContent|rawData|credential|privateReasoning|externalSession/i);
  } finally { server.close(); await once(server, "close"); }
});

test("HTTP Data Node rejects unsafe transport and private material before network access", async () => {
  const base = { connectorId: "data-node", displayName: "Data Node", dataSourceIds: ["warehouse-one"],
    supportedOperations: ["READ"], bearerToken: "synthetic", allowInsecureLoopback: false, requestTimeoutMs: 1_000 };
  assert.throws(() => validateHttpDataNodeConfiguration({ ...base, baseUrl: "http://data.example" }), /HTTP_DATA_NODE_TLS_REQUIRED/);
  assert.throws(() => validateHttpDataNodeConfiguration({ ...base, baseUrl: "https://user:pass@data.example" }), /HTTP_DATA_NODE_URL_CREDENTIALS_FORBIDDEN/);
  const connector = createDataConnectorPort({ ...base, baseUrl: "https://data.example" });
  await assert.rejects(() => connector.access({ requestId: "request-one", companyId: "company-one", workId: "work-one",
    agentId: "agent-one", dataSourceId: "warehouse-one", operation: "READ", purpose: "report",
    classification: "PUBLIC", destinationId: null, contentDigest: null, requestedAt: "2026-08-25T12:00:00.000Z",
    authorizationContractId: "contract-one", authorizationReceiptId: "receipt-one",
    privateReasoning: "forbidden" } as never), /HTTP_DATA_NODE_PRIVATE_MATERIAL_FORBIDDEN/);
});
