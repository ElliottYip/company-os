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
  const calls: { readonly url: string; readonly init?: RequestInit }[] = [];
  const projection = {
    schemaVersion: 1,
    mode: "PRODUCTION",
    viewer: { actorId: "human-one", displayName: "Human One" },
    organization: {
      company: { id: "company-one", name: "Company One", purpose: "", locale: "zh-CN" },
      departments: [{ id: "operations", name: "Operations", mandate: "" }],
      projects: [],
      workspaces: [],
      humans: [{ id: "human-one", name: "Human One", title: "Agent Boss", departmentId: "operations", avatarId: "human-one" }],
      agents: [{ id: "agent-one", name: "Agent One", role: "Research", departmentId: "operations", accountableHumanId: "human-one", runtimeConnectorId: "connector-one", avatarId: "fish-one", autonomyLevel: 2 }],
    },
    responsibilities: { revision: 1, contracts: [{
      id: "contract-one", companyId: "company-one", agentId: "agent-one",
      accountableHumanId: "human-one", backupHumanId: null, autonomyLevel: 2,
      allowedActions: ["read-knowledge", "publish-content"], approvalRequiredActions: ["publish-content"],
      escalationTimeoutSeconds: null, status: "ACTIVE",
    }] },
    work: [{
      id: "work-one", companyId: "company-one", title: "Brief", goal: "Prepare brief",
      scope: "AGENT", departmentId: "operations", projectId: null, agentId: "agent-one",
      requestedBy: "human-one", actionIds: ["read-knowledge"], parentWorkId: null,
      accountableHumanId: "human-one", responsibilityContractId: "contract-one",
      runtimeConnectorId: "connector-one", status: "PENDING",
    }],
    attempts: [{ id: "attempt-one", workId: "work-one", status: "AWAITING_APPROVAL", attemptNumber: 1 }],
    pendingApprovals: [{
      id: "approval-one", companyId: "company-one", status: "AWAITING_APPROVAL",
      requestedAt: "2026-08-20T15:00:00.000Z", expiresAt: "2026-08-20T17:00:00.000Z",
      binding: {
        action: { id: "publish-content", digest: "sha256:approval" }, workId: "work-one",
        responsibilityContractId: "contract-one", executingAgentId: "agent-one",
        accountableHumanId: "human-one", evidenceReferences: ["evidence-one"], resultReference: null,
      },
    }],
    generatedAt: "2026-08-20T16:00:00.000Z",
  } as const;
  const client = createFormalApplicationClient({
    baseUrl: "https://company-os.example/",
    companyId: "company-one",
    fetcher: async (input, init) => {
      calls.push({ url: String(input), init });
      if (String(input).endsWith("/administration")) return response({
        schemaVersion: 1, mode: "PRODUCTION", viewer: projection.viewer,
        connectorCatalog: { revision: 1, connectors: [] },
        governance: { revision: 1, modelRoutingPolicies: [], dataAuthorizationContracts: [] },
        egressDecisions: [], generatedAt: projection.generatedAt,
      });
      return init?.method === "POST" ? response({ ok: true }) : response(projection);
    },
  });

  assert.equal(client.mode, "FORMAL");
  assert.equal((await client.organization()).company.name, "Company One");
  const state = await client.snapshot();
  assert.equal(state.mode, "PRODUCTION");
  assert.equal(state.phase, "AWAITING_APPROVAL");
  assert.equal(state.responsibility.accountableHumanId, "human-one");
  assert.deepEqual(state.responsibility.approvalIds, ["approval-one"]);
  const options = await client.assignmentOptions();
  assert.equal(options.viewerId, "human-one");
  assert.deepEqual(options.agents[0]?.allowedActionIds, ["read-knowledge", "publish-content"]);
  assert.equal((await client.administration())?.governance.revision, 1);

  await client.assignWork({
    title: "New brief", goal: "Prepare new brief", agentId: "agent-one",
    departmentId: "operations", requestedBy: "human-one", actionIds: ["read-knowledge"],
  });
  const workCommand = calls.find(({ url, init }) => url.endsWith("/work") && init?.method === "POST");
  assert.ok(workCommand);
  const workBody = JSON.parse(String(workCommand.init?.body)) as { draft: Record<string, unknown> };
  assert.match(String(workBody.draft.id), /^work-/);
  const { id: _generatedId, ...workDraft } = workBody.draft;
  assert.deepEqual(workDraft, {
    title: "New brief", goal: "Prepare new brief", scope: "AGENT", departmentId: "operations",
    projectId: null, agentId: "agent-one", requestedBy: "human-one",
    actionIds: ["read-knowledge"], parentWorkId: null,
  });

  await client.decideApproval("APPROVED");
  const decision = calls.find(({ url }) => url.endsWith("/approvals/approval-one/decisions"));
  assert.ok(decision);
  assert.deepEqual(JSON.parse(String(decision.init?.body)), {
    decision: "APPROVED", expectedBinding: projection.pendingApprovals[0].binding,
  });
});

test("formal Web client surfaces stable API error codes without depending on message copy", async () => {
  const client = createFormalApplicationClient({
    baseUrl: "",
    companyId: "company-one",
    fetcher: async () => response({ error: { code: "TENANT_MISMATCH", parameters: {} } }, 403),
  });
  await assert.rejects(client.snapshot(), /TENANT_MISMATCH/);
});
