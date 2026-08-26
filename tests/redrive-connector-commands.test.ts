import assert from "node:assert/strict";
import test from "node:test";
import { RedriveConnectorCommands } from "../application/redrive-connector-commands.ts";

test("recovery scan isolates companies, deduplicates scopes, and reports stable codes", async () => {
  const calls: string[] = [];
  const redrive = new RedriveConnectorCommands({
    async listCompanyIds() { return ["company-b", "company-a", "company-b"]; },
    async deliver(companyId) {
      calls.push(companyId);
      if (companyId === "company-a") throw new Error("AGENT_EXECUTION_PORT_UNAVAILABLE");
      return [];
    },
  });
  assert.deepEqual(await redrive.tick(), [{
    companyId: "company-a", status: "FAILED", deliveries: [],
    code: "AGENT_EXECUTION_PORT_UNAVAILABLE",
  }, {
    companyId: "company-b", status: "SCANNED", deliveries: [],
    code: "CONNECTOR_REDRIVE_SCANNED",
  }]);
  assert.deepEqual(calls, ["company-a", "company-b"]);
});

test("overlapping recovery ticks do not double-deliver", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const redrive = new RedriveConnectorCommands({
    async listCompanyIds() { return ["company-a"]; },
    async deliver() { await gate; return []; },
  });
  const first = redrive.tick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await redrive.tick(), []);
  release();
  assert.equal((await first).length, 1);
});
