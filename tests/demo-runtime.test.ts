import assert from "node:assert/strict";
import test from "node:test";

import { createDemoRuntime } from "../application/demo-runtime.ts";

test("demo runtime deterministically reaches a high-risk approval pause", () => {
  const runtime = createDemoRuntime();

  runtime.assignTask();
  runtime.advance();
  runtime.advance();
  const state = runtime.advance();

  assert.equal(state.phase, "AWAITING_APPROVAL");
  assert.equal(state.events.length, 4);
  assert.equal(state.responsibility.approvalIds[0], "demo-approval-001");
  assert.equal(state.mode, "DEMO_FIXTURE");
});

test("approval completes the responsibility chain with evidence and result", () => {
  const runtime = createDemoRuntime();
  runtime.assignTask();
  runtime.advance();
  runtime.advance();
  runtime.advance();

  const state = runtime.decide("APPROVED");

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

test("reset returns byte-for-byte deterministic initial state", () => {
  const runtime = createDemoRuntime();
  const initial = runtime.snapshot();
  runtime.assignTask();
  runtime.advance();

  assert.deepEqual(runtime.reset(), initial);
});

