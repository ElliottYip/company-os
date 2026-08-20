import assert from "node:assert/strict";
import test from "node:test";

import { createFormalApplicationClient } from "../web/application-client.ts";

function response(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }));
}

test("formal Web client consumes only the stable Agent Boss projection", async () => {
  const calls: string[] = [];
  const client = createFormalApplicationClient({
    baseUrl: "https://company-os.example/",
    companyId: "company-one",
    fetcher: async (input) => {
      calls.push(String(input));
      return response({
        schemaVersion: 1,
        mode: "PRODUCTION",
        organization: {
          company: { id: "company-one", name: "Company One", purpose: "", locale: "zh-CN" },
          departments: [{ id: "operations", name: "Operations", mandate: "" }],
          humans: [{ id: "human-one", name: "Human One", title: "Agent Boss", departmentId: "operations", avatarId: "human-one" }],
          agents: [{ id: "agent-one", name: "Agent One", role: "Research", departmentId: "operations", accountableHumanId: "human-one", runtimeConnectorId: "connector-one", avatarId: "fish-one", autonomyLevel: 2 }],
        },
        responsibilities: { revision: 1, contracts: [] },
        work: [{
          id: "work-one", companyId: "company-one", title: "Brief", goal: "Prepare brief",
          scope: "AGENT", departmentId: "operations", projectId: null, agentId: "agent-one",
          requestedBy: "human-one", actionIds: ["read"], parentWorkId: null,
          accountableHumanId: "human-one", responsibilityContractId: "contract-one",
          runtimeConnectorId: "connector-one", status: "PENDING",
        }],
        attempts: [{ id: "attempt-one", workId: "work-one", status: "AWAITING_APPROVAL", attemptNumber: 1 }],
        pendingApprovals: [{ id: "approval-one" }],
        generatedAt: "2026-08-20T16:00:00.000Z",
      });
    },
  });

  assert.equal(client.mode, "FORMAL");
  assert.equal((await client.organization()).company.name, "Company One");
  const state = await client.snapshot();
  assert.equal(state.mode, "PRODUCTION");
  assert.equal(state.phase, "AWAITING_APPROVAL");
  assert.equal(state.responsibility.accountableHumanId, "human-one");
  assert.deepEqual(state.responsibility.approvalIds, ["approval-one"]);
  assert.deepEqual(calls, [
    "https://company-os.example/api/v1/companies/company-one/agent-boss",
    "https://company-os.example/api/v1/companies/company-one/agent-boss",
  ]);
  await assert.rejects(client.assignWork(), /FORMAL_MUTATION_NOT_CONFIGURED/);
});

test("formal Web client surfaces stable API error codes without depending on message copy", async () => {
  const client = createFormalApplicationClient({
    baseUrl: "",
    companyId: "company-one",
    fetcher: async () => response({ error: { code: "TENANT_MISMATCH", parameters: {} } }, 403),
  });
  await assert.rejects(client.snapshot(), /TENANT_MISMATCH/);
});
