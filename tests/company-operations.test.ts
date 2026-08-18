import assert from "node:assert/strict";
import test from "node:test";

import { createDemoComposition } from "../adapters/demo/create-demo-composition.ts";

test("Demo uses the shared application pipeline for the complete responsibility loop", async () => {
  const demo = createDemoComposition();

  await demo.runtime.assignTask();
  await demo.runtime.advance();
  await demo.runtime.advance();
  const paused = await demo.runtime.advance();

  assert.equal(paused.phase, "AWAITING_APPROVAL");
  assert.equal(paused.events.length, 4);

  const complete = await demo.runtime.decide("APPROVED");
  assert.equal(complete.phase, "COMPLETED");
  assert.deepEqual(complete.responsibility.evidenceIds, [
    "demo-evidence-plan",
    "demo-evidence-tool",
    "demo-evidence-result",
  ]);

  const stored = await demo.ports.eventStore.read("demo-company");
  assert.deepEqual(stored.map(({ type }) => type), [
    "work.assigned",
    "plan.recorded",
    "tool.activity.recorded",
    "approval.requested",
    "approval.decided",
    "evidence.recorded",
    "work.completed",
  ]);
});

test("Demo reset clears only fixture state and restores deterministic IDs", async () => {
  const demo = createDemoComposition();
  await demo.runtime.assignTask();
  await demo.runtime.advance();

  const reset = await demo.runtime.reset();
  assert.equal(reset.phase, "READY");
  assert.deepEqual(reset.events, []);

  const reassigned = await demo.runtime.assignTask();
  assert.equal(reassigned.events[0]?.id, "demo-event-001");
});

test("Demo composition exposes no network, process, filesystem, model, or credential port", () => {
  const demo = createDemoComposition();
  assert.deepEqual(Object.keys(demo.ports).sort(), [
    "approval",
    "auditEvidence",
    "eventStore",
    "organization",
  ]);
});

