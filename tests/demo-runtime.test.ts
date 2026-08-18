import assert from "node:assert/strict";
import test from "node:test";

import { createDemoComposition } from "../adapters/demo/create-demo-composition.ts";

test("demo runtime deterministically reaches a high-risk approval pause", async () => {
  const { runtime } = createDemoComposition();

  await runtime.assignTask();
  await runtime.advance();
  await runtime.advance();
  const state = await runtime.advance();

  assert.equal(state.phase, "AWAITING_APPROVAL");
  assert.equal(state.events.length, 4);
  assert.equal(state.responsibility.approvalIds[0], "demo-approval-001");
  assert.equal(state.mode, "DEMO_FIXTURE");
});

test("approval completes the responsibility chain with evidence and result", async () => {
  const { runtime } = createDemoComposition();
  await runtime.assignTask();
  await runtime.advance();
  await runtime.advance();
  await runtime.advance();

  const state = await runtime.decide("APPROVED");

  assert.equal(state.phase, "COMPLETED");
  assert.deepEqual(state.responsibility, {
    workId: "demo-work-001",
    goalInitiatorId: "demo-boss",
    accountableHumanId: "demo-boss",
    executingAgentId: "demo-researcher",
    permissionIds: ["permission-read-demo", "permission-publish-demo"],
    dataAuthorizationIds: ["data-contract-demo-market"],
    approvalIds: ["demo-approval-001"],
    evidenceIds: ["demo-evidence-plan", "demo-evidence-tool", "demo-evidence-result"],
    resultId: "demo-result-001",
  });
});

test("reset returns byte-for-byte deterministic initial state", async () => {
  const { runtime } = createDemoComposition();
  const initial = await runtime.snapshot();
  await runtime.assignTask();
  await runtime.advance();

  assert.deepEqual(await runtime.reset(), initial);
});
