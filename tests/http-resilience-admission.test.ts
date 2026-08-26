import assert from "node:assert/strict";
import test from "node:test";
import { runHttpResilienceAdmission } from "../scripts/http-resilience-admission.ts";

test("HTTP resilience admission sustains bounded concurrency and recovers from dependency failure", async () => {
  const result = await runHttpResilienceAdmission({
    concurrency: 12,
    healthyRequests: 96,
    abusiveRequests: 24,
    maximumP95Milliseconds: 1_500,
  });

  assert.deepEqual(result, {
    schemaVersion: 1,
    status: "PASS",
    healthyRequests: 96,
    abusiveRequests: 24,
    recovered: true,
    secretLeakage: false,
    availabilityFailures: 0,
    p95WithinBudget: true,
  });
});

test("HTTP resilience admission rejects invalid load parameters before opening a listener", async () => {
  await assert.rejects(
    runHttpResilienceAdmission({
      concurrency: 0,
      healthyRequests: 10,
      abusiveRequests: 10,
      maximumP95Milliseconds: 1_500,
    }),
    /HTTP_RESILIENCE_CONCURRENCY_INVALID/,
  );
  await assert.rejects(
    runHttpResilienceAdmission({
      concurrency: 4,
      healthyRequests: 10,
      abusiveRequests: 3,
      maximumP95Milliseconds: 1_500,
      minimumDurationMilliseconds: 300_001,
    }),
    /HTTP_RESILIENCE_DURATION_INVALID/,
  );
});
