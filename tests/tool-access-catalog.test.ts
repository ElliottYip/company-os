import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { EventBackedToolAccessCatalogStore } from "../adapters/storage/event-backed-tool-access-catalog-store.ts";
import { ToolAccessRegistry } from "../application/tool-access-registry.ts";
import { evaluateToolAccess, validateToolAccessCatalog, type ToolAccessCatalog } from "../core/tool-access.ts";

const catalog = (): ToolAccessCatalog => ({
  companyId: "company-one", revision: 0,
  profiles: [{ id: "profile-engineering", companyId: "company-one", profileKey: "engineering",
    name: "Engineering", description: null, status: "active", defaultAction: "deny" }],
  entries: [{ id: "entry-read", companyId: "company-one", profileId: "profile-engineering",
    selectorType: "tool_name", selectorValue: "read-repository", effect: "include" }],
  bindings: [{ id: "binding-agent", companyId: "company-one", profileId: "profile-engineering",
    targetType: "agent", targetId: "agent-one", priority: 100 }],
  policies: [{ id: "policy-approval", companyId: "company-one", name: "Deploy approval",
    description: null, policyType: "require_approval", priority: 10, enabled: true,
    selectors: { toolName: "deploy-production" } }],
});
const intent = { companyId: "company-one", agentId: "agent-one", projectId: null,
  applicationId: "source-control", connectionId: "connection-one", catalogEntryId: "entry-tool-one",
  toolName: "read-repository", riskLevel: "read" as const };

test("tool profiles, entries, bindings, and policies preserve upstream default-deny order", () => {
  const valid = validateToolAccessCatalog(catalog());
  assert.equal(evaluateToolAccess(valid, intent).decision, "allow");
  assert.deepEqual(evaluateToolAccess(valid, { ...intent, toolName: "deploy-production" }), {
    decision: "require_approval", reasonCode: "requires_approval_policy",
    effectiveProfileIds: ["profile-engineering"], matchedPolicyIds: ["policy-approval"],
  });
  assert.equal(evaluateToolAccess(valid, { ...intent, toolName: "unknown-tool" }).reasonCode, "deny_default");
});

test("unsupported trust and rate-limit runtime semantics fail closed", () => {
  for (const policyType of ["trust_rule", "rate_limit"] as const) {
    const next = catalog();
    const decision = evaluateToolAccess({ ...next, policies: [{ ...next.policies[0]!,
      policyType, selectors: { toolName: "read-repository" } }] }, intent);
    assert.equal(decision.decision, "deny");
    assert.equal(decision.reasonCode, "deny_unsupported_policy_runtime");
  }
});

test("formal tool catalog persists by revision and rejects Demo writers", async () => {
  const events = new InMemoryEventStore(); let id = 0;
  const store = new EventBackedToolAccessCatalogStore(events, () => `event-${++id}`);
  const identity = { async getCurrentIdentity() { return { actorId: "human-one", organizationId: "company-one",
    displayName: "Human", assurance: "ENTERPRISE_ASSERTED" as const }; }, async currentPrincipal() { return null; },
    async authorize() { return { id: `receipt-${++id}`, principalId: "human-one", authorizedAt: "2026-08-24T12:00:00.000Z" }; } };
  const service = new ToolAccessRegistry(identity, store, () => "2026-08-24T12:00:00.000Z");
  const saved = await service.replace("company-one", catalog(), 0);
  assert.equal(saved.revision, 1);
  await assert.rejects(service.replace("company-one", { ...catalog(), revision: 0 }, 0), /TOOL_ACCESS_REVISION_CONFLICT/);
  const demo = new ToolAccessRegistry({ ...identity, async getCurrentIdentity() { return { actorId: "demo",
    organizationId: "company-one", displayName: "Demo", assurance: "LOCAL_DEMO" as const }; } }, store,
  () => "2026-08-24T12:00:00.000Z");
  await assert.rejects(demo.load("company-one"), /FORMAL_IDENTITY_REQUIRED/);
});
