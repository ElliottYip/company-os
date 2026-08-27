import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createFederatedPortfolioSource,
  createPaperclipFederatedConnector,
  parsePaperclipAgentBindings,
} from "../connectors/federated-source-reference/source.ts";

const EXTERNAL_COMPANY = "51d31986-beb3-4f65-a1df-bdbe63ddf98c";
const EXTERNAL_AGENT = "64975d0e-ed6f-47c8-93be-ddae44c4af8e";
const EXTERNAL_ISSUE = "cbb915c2-dbed-48f7-aa4f-778587fdb6ec";
const AUTHORIZATION = `Bearer ${"x".repeat(32)}`;

function fakeFetch(requests: Array<{ url: string; authorization: string | null }>): typeof fetch {
  return (async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    requests.push({ url, authorization: headers.get("authorization") });
    if (url.endsWith(`/api/companies/${EXTERNAL_COMPANY}/agents`)) {
      return Response.json([{
        id: EXTERNAL_AGENT,
        companyId: EXTERNAL_COMPANY,
        name: "Research Agent",
        status: "running",
        updatedAt: "2026-08-27T09:00:00.000Z",
        adapterType: "codex_local",
        adapterConfig: { internalField: "must-not-cross" },
      }]);
    }
    if (url.includes(`/api/companies/${EXTERNAL_COMPANY}/issues?`)) {
      return Response.json([{
        id: EXTERNAL_ISSUE,
        companyId: EXTERNAL_COMPANY,
        identifier: "PC-42",
        title: "Prepare the Alpha evidence",
        description: "private task body must not cross",
        status: "in_progress",
        priority: "high",
        assigneeAgentId: EXTERNAL_AGENT,
        responsibleUserId: "external-user-sensitive",
        executionRunId: "external-run-sensitive",
        updatedAt: "2026-08-27T09:30:00.000Z",
      }]);
    }
    return Response.json({ error: "not found" }, { status: 404 });
  }) as typeof fetch;
}

test("Paperclip connector fetches the pinned official inventory and issue APIs into neutral contracts", async () => {
  const requests: Array<{ url: string; authorization: string | null }> = [];
  const connector = createPaperclipFederatedConnector({
    baseUrl: "https://paperclip.alpha.example",
    externalCompanyId: EXTERNAL_COMPANY,
    companyId: "coral-labs",
    connectorId: "paperclip-alpha",
    runtimeAgentId: "paperclip-runtime",
    runtimeAccountableHumanId: "human-owner",
    synchronizedAt: () => "2026-08-27T10:00:00.000Z",
    authorizationHeader: async () => AUTHORIZATION,
    agentBindings: [{
      externalAgentId: EXTERNAL_AGENT,
      agentId: "research-agent",
      accountableHumanId: "human-owner",
    }],
    fetch: fakeFetch(requests),
  });

  assert.deepEqual(connector.capabilityDeclaration(), {
    connectorId: "paperclip-alpha",
    protocolVersion: "2.0",
    capabilities: {
      data: ["AGENT_INVENTORY", "FEDERATED_WORK", "RESULT_REFERENCES"],
      control: ["SYNCHRONIZE_FEDERATED_RECORDS"],
    },
    maximumBatchSize: 200,
  });

  const snapshot = await connector.synchronize();
  const replay = await connector.synchronize();
  assert.equal(snapshot.inventory.length, 2);
  assert.equal(snapshot.inventory[0]?.agentClass, "FEDERATED_RUNTIME");
  assert.equal(snapshot.inventory[1]?.displayName, "Research Agent");
  assert.equal(snapshot.inventory[1]?.managementDepth, "OBSERVED");
  assert.equal(snapshot.work.length, 1);
  assert.equal(snapshot.work[0]?.mode, "FEDERATED");
  assert.equal(snapshot.work[0]?.record.agentId, "research-agent");
  assert.equal(snapshot.work[0]?.record.status, "WORKING");
  assert.equal(snapshot.work[0]?.record.summary, "External issue status: in_progress; priority: high.");
  assert.equal(snapshot.work[0]?.record.source.externalId, `issue:${EXTERNAL_ISSUE}`);
  assert.equal(snapshot.anomalies.length, 0);
  assert.deepEqual(replay.work, snapshot.work);
  assert.deepEqual(requests.map(({ authorization }) => authorization), [
    AUTHORIZATION, AUTHORIZATION, AUTHORIZATION, AUTHORIZATION,
  ]);
  assert.equal(requests.some(({ url }) => url.endsWith(
    `/api/companies/${EXTERNAL_COMPANY}/issues?limit=200&offset=0&sortField=updated&sortDir=desc`,
  )), true);
  assert.equal(JSON.stringify(snapshot).includes(AUTHORIZATION), false);
  assert.equal(JSON.stringify(snapshot).includes("private task body"), false);
  assert.equal(JSON.stringify(snapshot).includes("external-user-sensitive"), false);
  assert.equal(JSON.stringify(snapshot).includes("external-run-sensitive"), false);
  assert.equal(JSON.stringify(snapshot).includes("codex_local"), false);
});

test("Paperclip connector reports unmapped Agents without importing falsely attributed Work", async () => {
  const connector = createPaperclipFederatedConnector({
    baseUrl: "https://paperclip.alpha.example",
    externalCompanyId: EXTERNAL_COMPANY,
    companyId: "coral-labs",
    connectorId: "paperclip-alpha",
    runtimeAgentId: "paperclip-runtime",
    runtimeAccountableHumanId: "human-owner",
    synchronizedAt: () => "2026-08-27T10:00:00.000Z",
    authorizationHeader: async () => AUTHORIZATION,
    agentBindings: [],
    fetch: fakeFetch([]),
  });

  const snapshot = await connector.synchronize();
  assert.equal(snapshot.inventory.length, 1);
  assert.equal(snapshot.work.length, 0);
  assert.deepEqual(snapshot.anomalies.map(({ code }) => code), [
    "EXTERNAL_AGENT_BINDING_MISSING",
    "EXTERNAL_WORK_AGENT_BINDING_MISSING",
  ]);
});

test("Paperclip connector refuses public cleartext and malformed upstream responses", async () => {
  assert.throws(() => createPaperclipFederatedConnector({
    baseUrl: "http://paperclip.example",
    externalCompanyId: EXTERNAL_COMPANY,
    companyId: "coral-labs",
    connectorId: "paperclip-alpha",
    runtimeAgentId: "paperclip-runtime",
    runtimeAccountableHumanId: "human-owner",
    synchronizedAt: () => "2026-08-27T10:00:00.000Z",
    authorizationHeader: async () => AUTHORIZATION,
    agentBindings: [],
  }), /PAPERCLIP_BASE_URL_INVALID/);

  const connector = createPaperclipFederatedConnector({
    baseUrl: "http://127.0.0.1:3100",
    externalCompanyId: EXTERNAL_COMPANY,
    companyId: "coral-labs",
    connectorId: "paperclip-alpha",
    runtimeAgentId: "paperclip-runtime",
    runtimeAccountableHumanId: "human-owner",
    synchronizedAt: () => "2026-08-27T10:00:00.000Z",
    authorizationHeader: async () => AUTHORIZATION,
    agentBindings: [],
    fetch: (async () => Response.json({ unexpected: true })) as typeof fetch,
  });
  await assert.rejects(connector.synchronize(), /PAPERCLIP_RESPONSE_INVALID/);
});

test("Paperclip deployment bindings use an exact secret-free schema", () => {
  assert.deepEqual(parsePaperclipAgentBindings(JSON.stringify([{
    externalAgentId: EXTERNAL_AGENT,
    agentId: "research-agent",
    accountableHumanId: "human-owner",
  }])), [{
    externalAgentId: EXTERNAL_AGENT,
    agentId: "research-agent",
    accountableHumanId: "human-owner",
  }]);
  assert.throws(() => parsePaperclipAgentBindings(JSON.stringify([{
    externalAgentId: EXTERNAL_AGENT,
    agentId: "research-agent",
    accountableHumanId: "human-owner",
    unexpectedField: "forbidden",
  }])), /PAPERCLIP_AGENT_BINDINGS_INVALID/);
});

test("Paperclip deployment credential rejects broad permissions and symbolic links", () => {
  const directory = mkdtempSync(join(tmpdir(), "company-os-paperclip-secret-"));
  const credential = join(directory, "board-key");
  const linkedCredential = join(directory, "linked-board-key");
  const environment = {
    COMPANY_OS_PAPERCLIP_BASE_URL: "http://127.0.0.1:3100",
    COMPANY_OS_PAPERCLIP_ANC_COMPANY_ID: "coral-labs",
    COMPANY_OS_PAPERCLIP_COMPANY_ID: EXTERNAL_COMPANY,
    COMPANY_OS_PAPERCLIP_CONNECTOR_ID: "paperclip-alpha",
    COMPANY_OS_PAPERCLIP_RUNTIME_AGENT_ID: "paperclip-runtime",
    COMPANY_OS_PAPERCLIP_ACCOUNTABLE_HUMAN_ID: "human-owner",
    COMPANY_OS_PAPERCLIP_AGENT_BINDINGS: "[]",
  };
  try {
    writeFileSync(credential, "x".repeat(32), { mode: 0o644 });
    assert.throws(() => createFederatedPortfolioSource({
      ...environment,
      COMPANY_OS_PAPERCLIP_AUTHORIZATION_FILE: credential,
    }), /PAPERCLIP_AUTHORIZATION_FILE_PERMISSIONS_INVALID/);

    chmodSync(credential, 0o600);
    symlinkSync(credential, linkedCredential);
    assert.throws(() => createFederatedPortfolioSource({
      ...environment,
      COMPANY_OS_PAPERCLIP_AUTHORIZATION_FILE: linkedCredential,
    }), /PAPERCLIP_AUTHORIZATION_FILE_INVALID/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Paperclip deployment credential rotates without restarting the formal API", async () => {
  const directory = mkdtempSync(join(tmpdir(), "company-os-paperclip-rotation-"));
  const credential = join(directory, "board-key");
  const authorizations: string[] = [];
  const originalFetch = globalThis.fetch;
  try {
    writeFileSync(credential, "a".repeat(32), { mode: 0o600 });
    globalThis.fetch = (async (_input, init) => {
      authorizations.push(new Headers(init?.headers).get("authorization") ?? "");
      return Response.json([]);
    }) as typeof fetch;
    const source = createFederatedPortfolioSource({
      COMPANY_OS_PAPERCLIP_BASE_URL: "http://127.0.0.1:3100",
      COMPANY_OS_PAPERCLIP_ANC_COMPANY_ID: "coral-labs",
      COMPANY_OS_PAPERCLIP_COMPANY_ID: EXTERNAL_COMPANY,
      COMPANY_OS_PAPERCLIP_CONNECTOR_ID: "paperclip-alpha",
      COMPANY_OS_PAPERCLIP_RUNTIME_AGENT_ID: "paperclip-runtime",
      COMPANY_OS_PAPERCLIP_ACCOUNTABLE_HUMAN_ID: "human-owner",
      COMPANY_OS_PAPERCLIP_AGENT_BINDINGS: "[]",
      COMPANY_OS_PAPERCLIP_AUTHORIZATION_FILE: credential,
    });
    await source.synchronize();
    writeFileSync(credential, "b".repeat(32), { mode: 0o600 });
    await source.synchronize();
    assert.deepEqual(authorizations, [
      `Bearer ${"a".repeat(32)}`,
      `Bearer ${"a".repeat(32)}`,
      `Bearer ${"b".repeat(32)}`,
      `Bearer ${"b".repeat(32)}`,
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(directory, { recursive: true, force: true });
  }
});
