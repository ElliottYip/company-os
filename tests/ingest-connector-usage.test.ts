import assert from "node:assert/strict";
import test from "node:test";

import { IngestConnectorUsage } from "../application/ingest-connector-usage.ts";
import type { UsageBudgetLedger } from "../core/usage-budget.ts";
import type { WorkAttempt } from "../core/work-attempt.ts";

const attempt: WorkAttempt = {
  id: "attempt-one", companyId: "company-one", workId: "work-one", agentId: "agent-one",
  attemptNumber: 1, idempotencyKey: "attempt-one", status: "RUNNING",
  authority: { responsibilityContractId: "contract-one", responsibilityContractRevision: 1,
    accountableHumanId: "human-one", actionIds: [], permissionIds: [], dataAuthorizationIds: [],
    connectorId: "connector-one", connectorCapabilityDigest: `sha256:${"a".repeat(64)}`,
    model: { policyId: "policy-one", routeId: "route-one", providerAdapterId: "provider-one",
      modelReference: "model-one", classification: "INTERNAL", residency: "LOCAL",
      credentialReferenceId: "credential-one", credentialVersion: 2,
      providerCapabilityDigest: `sha256:${"b".repeat(64)}` } },
  createdAt: "2026-08-25T10:00:00.000Z", timeoutAt: "2026-08-25T11:00:00.000Z",
  lease: { ownerId: "connector-one", fencingToken: 1, acquiredAt: "2026-08-25T10:00:01.000Z",
    expiresAt: "2026-08-25T10:59:59.000Z" }, lastFencingToken: 1,
  startedAt: "2026-08-25T10:00:02.000Z", completedAt: null, resultId: null,
  pendingApprovalId: null, unknownOutcome: null,
};

function harness() {
  let ledger: UsageBudgetLedger = { companyId: "company-one", revision: 0, costEvents: [], policies: [] };
  let id = 0;
  const service = new IngestConnectorUsage({
    store: { async load() { return structuredClone(ledger); }, async replace(next, expected) {
      assert.equal(expected, ledger.revision);
      ledger = structuredClone({ ...next, revision: expected + 1 });
      return structuredClone(ledger);
    } },
    nextId: () => `cost-event-${++id}`,
  });
  return { service, ledger: () => ledger };
}

const usage = { usageReference: "usage-one", biller: "provider-one", billingType: "metered_api" as const,
  costStatus: "reported" as const, inputTokens: 100, cachedInputTokens: 20,
  outputTokens: 30, costCents: 45, occurredAt: "2026-08-25T10:01:00.000Z" };
const evidence = [{ evidenceReference: "usage-one", contentDigest: `sha256:${"c".repeat(64)}` }];

test("authenticated Connector usage is bound to frozen Attempt model authority and ingested once", async () => {
  const { service, ledger } = harness();
  const input = { attempt, usageOutputs: [usage], evidenceOutputs: evidence,
    observationRecordedAt: "2026-08-25T10:02:00.000Z", projectId: "project-one", goalId: null };
  assert.equal((await service.execute(input))[0]?.status, "RECORDED");
  assert.equal((await service.execute(input))[0]?.status, "REPLAYED");
  assert.deepEqual(ledger().costEvents[0], {
    id: "cost-event-1", companyId: "company-one", agentId: "agent-one", workId: "work-one",
    projectId: "project-one", goalId: null, usageReference: "usage-one",
    sourceDigest: `sha256:${"c".repeat(64)}`, provider: "provider-one", biller: "provider-one",
    billingType: "metered_api", costStatus: "reported", model: "model-one",
    inputTokens: 100, cachedInputTokens: 20, outputTokens: 30, costCents: 45,
    occurredAt: "2026-08-25T10:01:00.000Z", recordedAt: "2026-08-25T10:02:00.000Z",
  });
});

test("usage fails closed without model authority, matching digest evidence, or stable replay", async () => {
  const { service } = harness();
  const base = { attempt, usageOutputs: [usage], evidenceOutputs: evidence,
    observationRecordedAt: "2026-08-25T10:02:00.000Z", projectId: null, goalId: null };
  await assert.rejects(service.execute({ ...base, attempt: { ...attempt,
    authority: { ...attempt.authority, model: null } } }), /CONNECTOR_MODEL_USAGE_NOT_AUTHORIZED/);
  await assert.rejects(service.execute({ ...base, evidenceOutputs: [] }), /CONNECTOR_USAGE_EVIDENCE_REQUIRED/);
  await service.execute(base);
  await assert.rejects(service.execute({ ...base, usageOutputs: [{ ...usage, costCents: 46 }] }),
    /CONNECTOR_USAGE_REFERENCE_CONFLICT/);
});

test("one observation ingests all usage records atomically", async () => {
  const { service, ledger } = harness();
  await assert.rejects(service.execute({ attempt,
    usageOutputs: [usage, { ...usage, usageReference: "usage-two", costStatus: "unpriced", costCents: 1 }],
    evidenceOutputs: [...evidence, { evidenceReference: "usage-two", contentDigest: `sha256:${"d".repeat(64)}` }],
    observationRecordedAt: "2026-08-25T10:02:00.000Z", projectId: null, goalId: null,
  }), /UNPRICED_COST_MUST_BE_ZERO/);
  assert.equal(ledger().costEvents.length, 0);
});
