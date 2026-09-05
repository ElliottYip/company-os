import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import { OperationalRiskRuleRegistry } from "../application/operational-risk-rule-registry.ts";

test("operational risk rules are tenant-authorized, revisioned, and bounded", async () => {
  const events = new LocalDurableControlPlaneStore(await mkdtemp(join(tmpdir(), "company-os-risk-rules-")));
  let id = 0;
  const identity = { async getCurrentIdentity() { return { actorId: "human-one", organizationId: "company-one",
    displayName: "Human", assurance: "ENTERPRISE_ASSERTED" as const }; }, async currentPrincipal() { return null; },
    async authorize() { return { id: `receipt-${++id}`, principalId: "human-one", authorizedAt: "2026-09-05T10:00:00.000Z" }; } };
  const registry = new OperationalRiskRuleRegistry({ identity, events,
    now: () => "2026-09-05T10:00:00.000Z", nextId: () => `event-${++id}` });
  assert.equal((await registry.load("company-one")).revision, 0);
  const catalog = await registry.replace("company-one", { expectedRevision: 0, rules: [{ id: "restricted-export",
    resourceType: "DATA", resourceId: "supplier-data", operation: "EXPORT", severity: "CRITICAL",
    summary: "Supplier data cannot be exported" }] });
  assert.equal(catalog.revision, 1);
  assert.equal((await registry.load("company-one")).rules[0]?.severity, "CRITICAL");
  await assert.rejects(registry.replace("company-one", { expectedRevision: 0, rules: [] }),
    /OPERATIONAL_RISK_RULE_REVISION_CONFLICT/);
});
