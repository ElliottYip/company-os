import assert from "node:assert/strict";
import test from "node:test";

import { SynchronizeFederatedSource } from "../application/synchronize-federated-source.ts";
import type { AgentPortfolioRecord } from "../core/agent-portfolio.ts";
import type { ExternalWorkInput } from "../core/cross-source-work.ts";

const agent = { id: "runtime-one", companyId: "company-one" } as AgentPortfolioRecord;
const work = { id: "work-one", companyId: "company-one" } as ExternalWorkInput;

test("federated source synchronization applies a bounded idempotent batch through neutral services", async () => {
  const calls: string[] = [];
  const service = new SynchronizeFederatedSource({
    sources: [{
      connectorId: "source-one",
      companyId: "company-one",
      async synchronize() {
        return {
          inventory: [agent],
          work: [work],
          anomalies: [{ code: "EXTERNAL_MAPPING_MISSING", externalId: "external-one" }],
        };
      },
    }],
    agents: {
      async synchronize(record) { calls.push(`agent:${record.id}`); return { status: "RECORDED" as const }; },
    },
    work: {
      async synchronizeFederated(record) { calls.push(`work:${record.id}`); return { status: "UPDATED" as const }; },
    },
  });

  const result = await service.execute({ companyId: "company-one", connectorId: "source-one" });
  assert.deepEqual(calls, ["agent:runtime-one", "work:work-one"]);
  assert.deepEqual(result, {
    connectorId: "source-one",
    inventory: { recorded: 1, replayed: 0, updated: 0 },
    work: { recorded: 0, replayed: 0, updated: 1 },
    anomalies: [{ code: "EXTERNAL_MAPPING_MISSING", externalId: "external-one" }],
  });
});

test("federated source synchronization fails before reads on connector or tenant mismatch", async () => {
  let calls = 0;
  const service = new SynchronizeFederatedSource({
    sources: [{
      connectorId: "source-one",
      companyId: "company-one",
      async synchronize() { calls += 1; return { inventory: [], work: [], anomalies: [] }; },
    }],
    agents: { async synchronize() { throw new Error("unexpected"); } },
    work: { async synchronizeFederated() { throw new Error("unexpected"); } },
  });

  await assert.rejects(
    service.execute({ companyId: "company-two", connectorId: "source-one" }),
    /FEDERATED_SOURCE_TENANT_MISMATCH/,
  );
  await assert.rejects(
    service.execute({ companyId: "company-one", connectorId: "missing" }),
    /FEDERATED_SOURCE_NOT_FOUND/,
  );
  assert.equal(calls, 0);
});

test("federated source synchronization hides vendor failures behind one stable boundary code", async () => {
  const service = new SynchronizeFederatedSource({
    sources: [{
      connectorId: "source-one",
      companyId: "company-one",
      async synchronize() { throw new Error("VENDOR_TOKEN_AND_COORDINATE_DETAIL"); },
    }],
    agents: { async synchronize() { throw new Error("unexpected"); } },
    work: { async synchronizeFederated() { throw new Error("unexpected"); } },
  });
  await assert.rejects(
    service.execute({ companyId: "company-one", connectorId: "source-one" }),
    (error: unknown) => error instanceof Error && error.message === "FEDERATED_SOURCE_UNAVAILABLE",
  );
});
