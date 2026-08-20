import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ApplyFdeTemplate } from "../application/apply-fde-template.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { EventBackedCompanyConfigurationProjection } from "../adapters/storage/event-backed-company-configuration-projection.ts";
import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import { DEMO_COMPANY } from "../adapters/demo/demo-company.ts";
import { validateFdeTemplate } from "../core/fde-template.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

function template() {
  return {
    id: "template-market-research",
    version: "1.2.0",
    schemaVersion: 1 as const,
    name: "市场研究团队",
    industryCode: "general-research",
    contentDigest: `sha256:${"c".repeat(64)}`,
    trust: { publisherId: "company-os-fde", signatureReference: "signature-market-v1" },
    organization: DEMO_COMPANY,
    responsibilityContracts: [{
      id: "demo-contract-researcher", companyId: "demo-company", agentId: "demo-researcher",
      accountableHumanId: "demo-boss", backupHumanId: null, autonomyLevel: 2,
      allowedActions: ["read-knowledge", "publish-content"] as const,
      approvalRequiredActions: ["publish-content"] as const,
      escalationTimeoutSeconds: null, status: "ACTIVE" as const,
    }, {
      id: "demo-contract-operator", companyId: "demo-company", agentId: "demo-operator",
      accountableHumanId: "demo-boss", backupHumanId: null, autonomyLevel: 1,
      allowedActions: ["read-knowledge"] as const, approvalRequiredActions: [] as const,
      escalationTimeoutSeconds: null, status: "ACTIVE" as const,
    }],
    connectors: [{
      id: "fixture-reference-one", companyId: "demo-company", displayName: "Research connector",
      protocolVersion: "1.0" as const, operations: ["SUBMIT", "PROGRESS", "PAUSE", "RESUME", "CANCEL", "EVIDENCE", "RESULT"] as const,
      maximumTimeoutSeconds: 3_600, executionResidency: "CUSTOMER_ENVIRONMENT" as const,
      secretReferenceId: null, status: "ENABLED" as const,
    }, {
      id: "fixture-reference-two", companyId: "demo-company", displayName: "Journal connector",
      protocolVersion: "1.0" as const, operations: ["SUBMIT", "PROGRESS", "CANCEL", "EVIDENCE", "RESULT"] as const,
      maximumTimeoutSeconds: 3_600, executionResidency: "CUSTOMER_ENVIRONMENT" as const,
      secretReferenceId: null, status: "ENABLED" as const,
    }],
    governance: { companyId: "demo-company", modelRoutingPolicies: [], dataAuthorizationContracts: [] },
  };
}

function identity(): IdentityPort {
  return {
    async getCurrentIdentity() {
      return { actorId: "demo-boss", organizationId: "demo-company", displayName: "Boss", assurance: "ENTERPRISE_ASSERTED" as const };
    },
    async currentPrincipal() { return { id: "demo-boss", kind: "HUMAN", displayName: "Boss" }; },
    async authorize() {
      return { id: "receipt-fde", principalId: "demo-boss", authorizedAt: "2026-08-20T17:00:00.000Z" };
    },
  };
}

test("FDE template is versioned, cross-domain validated, and contains references only", () => {
  const valid = validateFdeTemplate(template());
  assert.equal(valid.version, "1.2.0");
  assert.equal(valid.responsibilityContracts.length, DEMO_COMPANY.agents.length);
  assert.throws(
    () => validateFdeTemplate({ ...template(), version: "latest" }),
    /FDE_TEMPLATE_VERSION_INVALID/,
  );
});

test("trusted FDE template supports dry-run, atomic apply event, and rollback event", async () => {
  const events = new InMemoryEventStore();
  let id = 0;
  const service = new ApplyFdeTemplate({
    identity: identity(),
    trust: {
      async verify(candidate) {
        return { trusted: true, verifiedDigest: candidate.contentDigest, publisherId: candidate.trust.publisherId };
      },
    },
    events,
    now: () => "2026-08-20T17:00:00.000Z",
    nextId: () => `fde-event-${++id}`,
  });
  const plan = await service.dryRun(template(), { organization: 2, responsibility: 3, connectors: 1, governance: 1 });
  assert.equal(plan.mutations.organization, 1);
  assert.equal(plan.rollbackSupported, true);

  const applied = await service.apply(template(), {
    expectedEventSequence: 0,
    previousRevisions: { organization: 2, responsibility: 3, connectors: 1, governance: 1 },
  });
  await service.rollback("demo-company", applied.applicationId, 1, "PILOT_ROLLBACK");
  assert.deepEqual((await events.read("demo-company")).map(({ type }) => type), [
    "fde.template-applied",
    "fde.template-rolled-back",
  ]);
});

test("untrusted template fails before any configuration event", async () => {
  const events = new InMemoryEventStore();
  const service = new ApplyFdeTemplate({
    identity: identity(),
    trust: { async verify() { return { trusted: false, code: "PUBLISHER_NOT_TRUSTED" }; } },
    events,
    now: () => "2026-08-20T17:00:00.000Z",
    nextId: () => "unused",
  });
  await assert.rejects(service.apply(template(), {
    expectedEventSequence: 0,
    previousRevisions: { organization: 0, responsibility: 0, connectors: 0, governance: 0 },
  }), /FDE_TEMPLATE_UNTRUSTED:PUBLISHER_NOT_TRUSTED/);
  assert.equal((await events.read("demo-company")).length, 0);
});

test("applied and rolled-back FDE packages replay into all canonical configuration catalogs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-fde-replay-"));
  const events = new LocalDurableControlPlaneStore(directory);
  let id = 0;
  const service = new ApplyFdeTemplate({
    identity: identity(),
    trust: { async verify(candidate) { return { trusted: true, verifiedDigest: candidate.contentDigest, publisherId: candidate.trust.publisherId }; } },
    events,
    now: () => "2026-08-20T17:00:00.000Z",
    nextId: () => `fde-projection-${++id}`,
  });
  const applied = await service.apply(template(), {
    expectedEventSequence: 0,
    previousRevisions: { organization: 0, responsibility: 0, connectors: 0, governance: 0 },
  });
  const restarted = new EventBackedCompanyConfigurationProjection(new LocalDurableControlPlaneStore(directory));
  const active = await restarted.load("demo-company");
  assert.equal(active?.applicationId, applied.applicationId);
  assert.equal(active?.organization.company.name, DEMO_COMPANY.company.name);
  assert.equal(active?.responsibility.contracts.length, 2);
  assert.equal(active?.connectors.connectors.length, 2);
  assert.equal(active?.governance.companyId, "demo-company");
  assert.deepEqual(active?.revisions, { organization: 1, responsibility: 1, connectors: 1, governance: 1 });

  await service.rollback("demo-company", applied.applicationId, 1, "PILOT_ROLLBACK");
  assert.equal(await new EventBackedCompanyConfigurationProjection(new LocalDurableControlPlaneStore(directory)).load("demo-company"), null);
});
