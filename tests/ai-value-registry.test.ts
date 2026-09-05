import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import { AiValueRegistry } from "../application/ai-value-registry.ts";

test("net value is shown only from verified outcomes and fully priced cost evidence", async () => {
  const events = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-value-")));
  let id = 0; const nextId = () => `value-${++id}`;
  const identity = { async getCurrentIdentity() { return { actorId: "human-one", organizationId: "company-one",
    displayName: "Human", assurance: "ENTERPRISE_ASSERTED" as const }; }, async currentPrincipal() { return null; },
    async authorize() { return { id: nextId(), principalId: "human-one", authorizedAt: "2026-09-05T12:00:00.000Z" }; } };
  const priced = { id: "cost-one", companyId: "company-one", agentId: "agent-one", workId: "work-one",
    projectId: null, goalId: null, usageReference: "usage-one", sourceDigest: `sha256:${"b".repeat(64)}`,
    provider: "provider-one", biller: "biller-one", billingType: "metered_api" as const,
    costStatus: "reported" as const, model: "model-one", inputTokens: 10, cachedInputTokens: 0,
    outputTokens: 5, costCents: 300, occurredAt: "2026-09-05T10:00:00.000Z", recordedAt: "2026-09-05T10:01:00.000Z" };
  let includeUnpriced = false;
  const costs = { async load() { return { companyId: "company-one", revision: 0,
    costEvents: includeUnpriced ? [priced, { ...priced, id: "cost-two", usageReference: "usage-two",
      costStatus: "unpriced" as const, costCents: 0 }] : [priced], policies: [] }; }, async replace() {} };
  const registry = new AiValueRegistry({ identity, events, costs,
    now: () => "2026-09-05T12:00:00.000Z", nextId });
  await registry.record("company-one", { expectedRevision: 0, measurement: { id: "outcome-one",
    scopeType: "AGENT", scopeId: "agent-one", metric: "OUTCOME_VALUE_CENTS", numerator: 2500,
    denominator: null, method: "Accepted invoice recovery value", sourceReference: "evidence-outcome",
    sourceDigest: `sha256:${"a".repeat(64)}`, confidence: "VERIFIED",
    periodStart: "2026-09-05T00:00:00.000Z", periodEnd: "2026-09-05T11:00:00.000Z",
    recordedAt: "2026-09-05T12:00:00.000Z" } });
  await registry.record("company-one", { expectedRevision: 1, measurement: { id: "adoption-one",
    scopeType: "AGENT", scopeId: "agent-one", metric: "ADOPTION", numerator: 8, denominator: 10,
    method: "Accepted users divided by eligible users", sourceReference: "evidence-adoption",
    sourceDigest: `sha256:${"c".repeat(64)}`, confidence: "VERIFIED",
    periodStart: "2026-09-05T00:00:00.000Z", periodEnd: "2026-09-05T11:00:00.000Z",
    recordedAt: "2026-09-05T12:00:00.000Z" } });
  let summary = await registry.summarize("company-one", { scopeType: "AGENT", scopeId: "agent-one",
    periodStart: "2026-09-05T00:00:00.000Z", periodEnd: "2026-09-06T00:00:00.000Z" });
  assert.equal(summary.verifiedAdoptionBps, 8000);
  assert.equal(summary.verifiedNetValueCents, 2200);
  includeUnpriced = true;
  summary = await registry.summarize("company-one", { scopeType: "AGENT", scopeId: "agent-one",
    periodStart: "2026-09-05T00:00:00.000Z", periodEnd: "2026-09-06T00:00:00.000Z" });
  assert.equal(summary.verifiedNetValueCents, null);
  assert.ok(summary.unavailableReasons.includes("UNPRICED_COST"));
});

test("estimated value remains explicit and cannot produce verified ROI", async () => {
  const events = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-value-estimate-")));
  let id = 0; const identity = { async getCurrentIdentity() { return { actorId: "human-one",
    organizationId: "company-one", displayName: "Human", assurance: "ENTERPRISE_ASSERTED" as const }; },
    async currentPrincipal() { return null; }, async authorize() { return { id: `receipt-${++id}`,
      principalId: "human-one", authorizedAt: "2026-09-05T12:00:00.000Z" }; } };
  const registry = new AiValueRegistry({ identity, events, costs: { async load() { return { companyId: "company-one",
    revision: 0, costEvents: [], policies: [] }; }, async replace() {} },
    now: () => "2026-09-05T12:00:00.000Z", nextId: () => `event-${++id}` });
  await registry.record("company-one", { expectedRevision: 0, measurement: { id: "estimate-one",
    scopeType: "COMPANY", scopeId: "company-one", metric: "OUTCOME_VALUE_CENTS", numerator: 999999,
    denominator: null, method: "Unvalidated stakeholder estimate", sourceReference: "estimate-source",
    sourceDigest: `sha256:${"d".repeat(64)}`, confidence: "ESTIMATED",
    periodStart: "2026-09-05T00:00:00.000Z", periodEnd: "2026-09-05T11:00:00.000Z",
    recordedAt: "2026-09-05T12:00:00.000Z" } });
  const summary = await registry.summarize("company-one", { scopeType: "COMPANY", scopeId: "company-one",
    periodStart: "2026-09-05T00:00:00.000Z", periodEnd: "2026-09-06T00:00:00.000Z" });
  assert.equal(summary.verifiedOutcomeValueCents, 0);
  assert.equal(summary.verifiedNetValueCents, null);
  assert.ok(summary.unavailableReasons.includes("NO_VERIFIED_OUTCOME_VALUE"));
});
