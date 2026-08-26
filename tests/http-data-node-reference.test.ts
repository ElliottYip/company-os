import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createDataConnectorPort } from "../connectors/http-data-node/index.mjs";
import {
  createReferenceDataNode,
  JsonFileReferenceDataNodeStore,
  loadReferenceDataNodeFixtureCatalog,
} from "../connectors/http-data-node-reference/index.mjs";
import { createReferenceDataNodeService } from "../connectors/http-data-node-reference/service-entry.mjs";

const fixtureDigest = `sha256:${"a".repeat(64)}`;

test("reference Data Node grants only governed fixture references and persists idempotency", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-data-node-"));
  const bearerToken = randomBytes(24).toString("base64url");
  const statePath = join(directory, "state.json");
  const start = async () => {
    const server = createReferenceDataNode({
      bearerToken,
      store: new JsonFileReferenceDataNodeStore(statePath),
      dataSources: [{
        id: "acceptance-fixtures",
        classification: "INTERNAL",
        allowedOperations: ["READ"],
        contentDigest: fixtureDigest,
      }],
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    return { server, baseUrl: `http://127.0.0.1:${address.port}` };
  };
  let active = await start();
  context.after(async () => {
    if (active.server.listening) {
      active.server.close();
      await once(active.server, "close");
    }
  });
  const connector = () => createDataConnectorPort({
    connectorId: "reference-data-node",
    displayName: "Acceptance fixture Data Node",
    dataSourceIds: ["acceptance-fixtures"],
    supportedOperations: ["READ"],
    baseUrl: active.baseUrl,
    bearerToken,
    allowInsecureLoopback: true,
    requestTimeoutMs: 2_000,
  });
  const request = {
    requestId: "request-one",
    companyId: "company-one",
    workId: "work-one",
    agentId: "agent-one",
    dataSourceId: "acceptance-fixtures",
    authorizationContractId: "contract-one",
    authorizationReceiptId: "receipt-one",
    operation: "READ" as const,
    purpose: "acceptance-check",
    classification: "INTERNAL" as const,
    destinationId: null,
    contentDigest: null,
    requestedAt: "2026-08-26T12:00:00.000Z",
  };

  const first = await connector().access(request);
  assert.equal(first.type, "GRANTED");
  assert.equal(first.contentDigest, fixtureDigest);
  assert.match(first.dataReference, /^fixture-[a-f0-9]{24}$/);
  assert.match(first.evidenceReference, /^evidence-[a-f0-9]{24}$/);

  active.server.close();
  await once(active.server, "close");
  active = await start();
  assert.deepEqual(await connector().access(request), first);
});

test("reference Data Node denies out-of-policy access before creating a fixture reference", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-data-node-denial-"));
  const bearerToken = randomBytes(24).toString("base64url");
  const server = createReferenceDataNode({
    bearerToken,
    store: new JsonFileReferenceDataNodeStore(join(directory, "state.json")),
    dataSources: [{
      id: "acceptance-fixtures",
      classification: "INTERNAL",
      allowedOperations: ["READ"],
      contentDigest: fixtureDigest,
    }],
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(async () => {
    server.close();
    await once(server, "close");
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  assert.equal((await fetch(`${baseUrl}/v1/health`, {
    headers: { "x-company-os-data-connector-protocol": "1.0" },
  })).status, 401);

  const response = await fetch(`${baseUrl}/v1/data-access`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearerToken}`,
      "content-type": "application/json",
      "x-company-os-data-connector-protocol": "1.0",
    },
    body: JSON.stringify({ schemaVersion: 1, request: {
      requestId: "request-two",
      companyId: "company-one",
      workId: "work-one",
      agentId: "agent-one",
      dataSourceId: "acceptance-fixtures",
      authorizationContractId: "contract-one",
      authorizationReceiptId: "receipt-one",
      operation: "EXPORT",
      purpose: "forbidden-export",
      classification: "INTERNAL",
      destinationId: "external-destination",
      contentDigest: fixtureDigest,
      requestedAt: "2026-08-26T12:00:00.000Z",
    } }),
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    result: { type: "DENIED", policyCode: "OPERATION_NOT_ALLOWED", retryable: false },
  });

  const underclassified = await fetch(`${baseUrl}/v1/data-access`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearerToken}`,
      "content-type": "application/json",
      "x-company-os-data-connector-protocol": "1.0",
    },
    body: JSON.stringify({ schemaVersion: 1, request: {
      requestId: "request-underclassified", companyId: "company-one", workId: "work-one",
      agentId: "agent-one", dataSourceId: "acceptance-fixtures", authorizationContractId: "contract-one",
      authorizationReceiptId: "receipt-one", operation: "READ", purpose: "underclassified-read",
      classification: "PUBLIC", destinationId: null, contentDigest: null,
      requestedAt: "2026-08-26T12:00:00.000Z",
    } }),
  });
  assert.equal(underclassified.status, 403);
  assert.deepEqual(await underclassified.json(), {
    result: { type: "DENIED", policyCode: "CLASSIFICATION_NOT_ALLOWED", retryable: false },
  });
});

test("reference Data Node rejects protocol drift, private material and idempotency conflicts", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-data-node-validation-"));
  const bearerToken = randomBytes(24).toString("base64url");
  const server = createReferenceDataNode({
    bearerToken,
    store: new JsonFileReferenceDataNodeStore(join(directory, "state.json")),
    dataSources: [{ id: "acceptance-fixtures", classification: "INTERNAL",
      allowedOperations: ["READ"], contentDigest: fixtureDigest }],
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(async () => {
    server.close();
    await once(server, "close");
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const post = (request: Record<string, unknown>, protocol = "1.0") => fetch(`${baseUrl}/v1/data-access`, {
    method: "POST",
    headers: { authorization: `Bearer ${bearerToken}`, "content-type": "application/json",
      "x-company-os-data-connector-protocol": protocol },
    body: JSON.stringify({ schemaVersion: 1, request }),
  });
  const valid = {
    requestId: "request-three", companyId: "company-one", workId: "work-one", agentId: "agent-one",
    dataSourceId: "acceptance-fixtures", authorizationContractId: "contract-one",
    authorizationReceiptId: "receipt-one", operation: "READ", purpose: "acceptance-check",
    classification: "INTERNAL", destinationId: null, contentDigest: null,
    requestedAt: "2026-08-26T12:00:00.000Z",
  };

  assert.equal((await post(valid, "2.0")).status, 400);
  assert.equal((await post({ ...valid, privateReasoning: "forbidden" })).status, 422);
  assert.equal((await post(valid)).status, 201);
  const conflict = await post({ ...valid, purpose: "different-purpose" });
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: { code: "REFERENCE_DATA_NODE_REQUEST_CONFLICT", retryable: false } });
});

test("container entry loads an explicitly fixture-only catalog and a file-injected bearer token", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-data-node-entry-"));
  const tokenPath = join(directory, "bearer-token");
  await writeFile(tokenPath, `${randomBytes(24).toString("base64url")}\n`, { mode: 0o600 });
  const catalogPath = new URL("../connectors/http-data-node-reference/fixtures/acceptance-fixtures.json",
    import.meta.url).pathname;
  const sources = await loadReferenceDataNodeFixtureCatalog(catalogPath);
  assert.deepEqual(sources.map(({ id, allowedOperations }) => ({ id, allowedOperations })), [
    { id: "acceptance-fixtures", allowedOperations: ["READ"] },
  ]);
  assert.match(sources[0]?.contentDigest ?? "", /^sha256:[a-f0-9]{64}$/);

  const server = await createReferenceDataNodeService({
    COMPANY_OS_REFERENCE_DATA_NODE_CATALOG_FILE: catalogPath,
    COMPANY_OS_REFERENCE_DATA_NODE_STATE_FILE: join(directory, "state.json"),
    COMPANY_OS_REFERENCE_DATA_NODE_BEARER_TOKEN_FILE: tokenPath,
  });
  context.after(async () => {
    if (server.listening) {
      server.close();
      await once(server, "close");
    }
  });
  assert.equal(server.listening, false);
});
