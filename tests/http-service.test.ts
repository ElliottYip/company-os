import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createDemoComposition } from "../adapters/demo/create-demo-composition.ts";
import { createCompanyOsHttpService } from "../adapters/http/company-os-http-service.ts";

async function withService(
  run: (baseUrl: string) => Promise<void>,
  formalApi?: {
    getAgentBoss(companyId: string): Promise<unknown>;
    dispatchWork?(companyId: string, input: unknown): Promise<unknown>;
    decideApproval?(companyId: string, requestId: string, input: unknown): Promise<unknown>;
  },
) {
  const { runtime } = createDemoComposition();
  const server = createCompanyOsHttpService({
    runtime,
    deploymentProfile: "self-hosted",
    allowedOrigins: ["http://allowed.test"],
    maxBodyBytes: 2_048,
    formalApi,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS_MISSING");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("HTTP service exposes bounded Demo, health, and security-header contracts", async () => {
  await withService(async (baseUrl) => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("x-content-type-options"), "nosniff");
    assert.equal(health.headers.get("x-frame-options"), "DENY");
    assert.deepEqual(await health.json(), {
      status: "ok",
      service: "company-os",
      mode: "DEMO_FIXTURE",
      deploymentProfile: "self-hosted",
      uptimeSeconds: 0,
    });

    const assigned = await fetch(`${baseUrl}/api/demo/actions`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ action: "ASSIGN" }),
    });
    assert.equal(assigned.status, 200);
    assert.equal((await assigned.json() as { phase: string }).phase, "PLANNING");
  });
});

test("formal API returns a versioned projection and stable structured errors", async () => {
  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/companies/company-one/agent-boss`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { schemaVersion: 1, company: { id: "company-one" } });
  }, {
    async getAgentBoss(companyId) {
      return { schemaVersion: 1, company: { id: companyId } };
    },
  });

  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/companies/company-one/agent-boss`);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: { code: "TENANT_MISMATCH", parameters: {} },
    });
  }, {
    async getAgentBoss() { throw new Error("TENANT_MISMATCH"); },
  });
});

test("formal command API validates and tenant-binds accountable work and exact approval", async () => {
  const calls: unknown[] = [];
  const binding = {
    action: {
      id: "action-one",
      type: "publish-content",
      description: "Publish approved brief",
      inputDigest: "sha256:exact-input",
      risk: "HIGH",
    },
    workId: "work-one",
    responsibilityContractId: "contract-one",
    executingAgentId: "agent-one",
    accountableHumanId: "human-one",
    evidenceReferences: ["evidence-one"],
    resultReference: null,
  };
  await withService(async (baseUrl) => {
    const created = await fetch(`${baseUrl}/api/v1/companies/company-one/work`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({
        draft: {
          id: "work-one", title: "Prepare brief", goal: "Prepare an accountable brief.",
          scope: "AGENT", departmentId: "operations", projectId: null, agentId: "agent-one",
          requestedBy: "human-one", actionIds: ["read-knowledge"], parentWorkId: null,
        },
        genericGoalId: null,
      }),
    });
    assert.equal(created.status, 201);

    const decided = await fetch(`${baseUrl}/api/v1/companies/company-one/approvals/approval-one/decisions`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ decision: "APPROVED", expectedBinding: binding }),
    });
    assert.equal(decided.status, 200);
    assert.deepEqual(calls, [
      { operation: "dispatch", companyId: "company-one", draftCompanyId: "company-one" },
      { operation: "decide", companyId: "company-one", requestId: "approval-one", binding },
    ]);
  }, {
    async getAgentBoss() { return {}; },
    async dispatchWork(companyId, input) {
      calls.push({
        operation: "dispatch",
        companyId,
        draftCompanyId: (input as { draft: { companyId: string } }).draft.companyId,
      });
      return { work: { id: "work-one" } };
    },
    async decideApproval(companyId, requestId, input) {
      calls.push({
        operation: "decide",
        companyId,
        requestId,
        binding: (input as { expectedBinding: unknown }).expectedBinding,
      });
      return { requestId, decision: "APPROVED" };
    },
  });
});

test("formal command API rejects bad structure, disallowed origin, and unavailable commands", async () => {
  await withService(async (baseUrl) => {
    const invalid = await fetch(`${baseUrl}/api/v1/companies/company-one/work`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ draft: { id: "../../escape" } }),
    });
    assert.equal(invalid.status, 422);
    assert.deepEqual(await invalid.json(), { error: { code: "INVALID_FORMAL_COMMAND", parameters: {} } });

    const forbidden = await fetch(`${baseUrl}/api/v1/companies/company-one/work`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://evil.test" },
      body: "{}",
    });
    assert.equal(forbidden.status, 403);
    assert.deepEqual(await forbidden.json(), { error: { code: "ORIGIN_NOT_ALLOWED", parameters: {} } });

    const unavailable = await fetch(`${baseUrl}/api/v1/companies/company-one/work`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({
        draft: {
          id: "work-one", title: "Prepare brief", goal: "Prepare an accountable brief.",
          scope: "AGENT", departmentId: "operations", projectId: null, agentId: "agent-one",
          requestedBy: "human-one", actionIds: ["read-knowledge"], parentWorkId: null,
        }, genericGoalId: null,
      }),
    });
    assert.equal(unavailable.status, 503);
  }, { async getAgentBoss() { return {}; } });
});

test("HTTP service fails closed for origin, input, size, and route errors", async () => {
  await withService(async (baseUrl) => {
    const forbidden = await fetch(`${baseUrl}/api/demo/actions`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://evil.test" },
      body: JSON.stringify({ action: "RESET" }),
    });
    assert.equal(forbidden.status, 403);
    assert.equal((await forbidden.json() as { error: { code: string } }).error.code, "ORIGIN_NOT_ALLOWED");

    const invalid = await fetch(`${baseUrl}/api/demo/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "EXECUTE_SHELL" }),
    });
    assert.equal(invalid.status, 422);

    const oversized = await fetch(`${baseUrl}/api/demo/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "RESET", padding: "x".repeat(4_096) }),
    });
    assert.equal(oversized.status, 413);

    const missing = await fetch(`${baseUrl}/not-found`);
    assert.equal(missing.status, 404);
    const text = await missing.text();
    assert.doesNotMatch(text, /stack|node:internal|\/Users\//i);
  });
});
