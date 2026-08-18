import assert from "node:assert/strict";
import test from "node:test";

import { GetControlPlaneSnapshot } from "../application/get-control-plane-snapshot.ts";
import { createDemoPorts } from "../adapters/demo/create-demo-ports.ts";

test("snapshot presents every provider through the same connector shape", async () => {
  const useCase = new GetControlPlaneSnapshot(createDemoPorts());
  const snapshot = await useCase.execute();

  assert.equal(snapshot.mode, "DEMO_FIXTURE");
  assert.deepEqual(
    snapshot.connectors.map(({ provider, isFixture }) => ({ provider, isFixture })),
    [
      { provider: "Raft Agent", isFixture: true },
      { provider: "Codex", isFixture: true },
      { provider: "DeepSeek", isFixture: true },
      { provider: "Enterprise Agent", isFixture: true },
    ],
  );
});

test("snapshot exposes approval work without publishing it", async () => {
  const useCase = new GetControlPlaneSnapshot(createDemoPorts());
  const snapshot = await useCase.execute();

  assert.equal(snapshot.approvals.length, 1);
  assert.equal(snapshot.approvals[0]?.status, "AWAITING_APPROVAL");
  assert.match(snapshot.notice, /fixture/i);
});
