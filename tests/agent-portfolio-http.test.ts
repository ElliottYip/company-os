import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createDemoComposition } from "../adapters/demo/create-demo-composition.ts";
import { createCompanyOsHttpService } from "../adapters/http/company-os-http-service.ts";

test("formal HTTP exposes separate neutral portfolio synchronization routes", async () => {
  const calls: Array<{ operation: string; companyId: string; input?: unknown }> = [];
  const server = createCompanyOsHttpService({
    runtime: createDemoComposition().runtime,
    deploymentProfile: "self-hosted",
    allowedOrigins: ["http://allowed.test"],
    formalApi: {
      async getAgentBoss() { return {}; },
      async listPortfolioAgents(_request, companyId) {
        calls.push({ operation: "list-agents", companyId });
        return { items: [] };
      },
      async registerObservedWork(_request, companyId, input) {
        calls.push({ operation: "observed", companyId, input });
        return { status: "RECORDED" };
      },
      async synchronizeFederatedWork(_request, companyId, input) {
        calls.push({ operation: "federated", companyId, input });
        return { status: "UPDATED" };
      },
      async importAgentUsage(_request, companyId, input) {
        calls.push({ operation: "usage", companyId, input });
        return { status: "RECORDED" };
      },
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS_MISSING");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(`${baseUrl}/api/v1/companies/company-one/agent-portfolio`)).status, 200);
    for (const [path, id] of [
      ["portfolio-work/observed", "work-observed"],
      ["portfolio-work/federated", "work-federated"],
      ["agent-commercial/usage", "usage-one"],
    ]) {
      const response = await fetch(`${baseUrl}/api/v1/companies/company-one/${path}`, {
        method: "POST",
        headers: { origin: "http://allowed.test", "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      assert.equal(response.status, 200);
    }
    assert.deepEqual(calls, [
      { operation: "list-agents", companyId: "company-one" },
      { operation: "observed", companyId: "company-one", input: { id: "work-observed" } },
      { operation: "federated", companyId: "company-one", input: { id: "work-federated" } },
      { operation: "usage", companyId: "company-one", input: { id: "usage-one" } },
    ]);
  } finally {
    server.close();
    await once(server, "close");
  }
});
