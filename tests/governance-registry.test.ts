import assert from "node:assert/strict";
import test from "node:test";

import { GovernanceRegistry } from "../application/governance-registry.ts";
import { EventBackedGovernanceCatalogStore } from "../adapters/storage/event-backed-governance-catalog-store.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { validateGovernanceCatalog } from "../core/governance-catalog.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

function catalog() {
  return {
    companyId: "company-one",
    modelRoutingPolicies: [{
      id: "models-default",
      companyId: "company-one",
      routes: [{
        id: "route-local",
        providerAdapterId: "provider-local",
        modelReference: "model-research",
        credentialReference: "secret-model-one",
        allowedDataClassifications: ["PUBLIC", "INTERNAL"] as const,
        residency: "LOCAL" as const,
        enabled: true,
      }],
    }],
    dataAuthorizationContracts: [{
      id: "data-contract-one",
      companyId: "company-one",
      dataSourceId: "knowledge-base",
      authorizedAgentIds: ["agent-one"],
      authorizedOperations: ["READ"] as const,
      allowedPurposes: ["customer-research"],
      maximumClassification: "INTERNAL" as const,
      allowedExportDestinations: [],
      validFrom: "2026-08-20T00:00:00.000Z",
      validUntil: "2027-08-20T00:00:00.000Z",
      status: "ACTIVE" as const,
    }],
  };
}

function identity(assurance: "ENTERPRISE_ASSERTED" | "LOCAL_DEMO" = "ENTERPRISE_ASSERTED"): IdentityPort {
  return {
    async getCurrentIdentity() {
      return { actorId: "human-one", organizationId: "company-one", displayName: "Human", assurance };
    },
    async currentPrincipal() { return { id: "human-one", kind: "HUMAN", displayName: "Human" }; },
    async authorize() {
      return { id: "receipt-governance", principalId: "human-one", authorizedAt: "2026-08-20T15:00:00.000Z" };
    },
  };
}

test("governance catalog validates model Secret references and bounded data contracts", () => {
  const valid = validateGovernanceCatalog(catalog());
  assert.equal(valid.modelRoutingPolicies[0]?.routes[0]?.credentialReference, "secret-model-one");
  assert.throws(
    () => validateGovernanceCatalog({
      ...catalog(),
      dataAuthorizationContracts: [{ ...catalog().dataAuthorizationContracts[0]!, validUntil: "2025-01-01" }],
    }),
    /DATA_CONTRACT_VALIDITY_INVALID/,
  );
  assert.throws(
    () => validateGovernanceCatalog({
      ...catalog(),
      modelRoutingPolicies: [{
        ...catalog().modelRoutingPolicies[0]!,
        routes: [{ ...catalog().modelRoutingPolicies[0]!.routes[0]!, credentialReference: "not a reference/value" }],
      }],
    }),
    /MODEL_ROUTE_REFERENCE_INVALID/,
  );
});

test("formal human persists one revisioned model/data governance catalog", async () => {
  const events = new InMemoryEventStore();
  let id = 0;
  const store = new EventBackedGovernanceCatalogStore(events, () => `governance-event-${++id}`);
  const registry = new GovernanceRegistry({ identity: identity(), store });
  const saved = await registry.replace({
    ...catalog(), expectedRevision: 0, recordedAt: "2026-08-20T15:00:00.000Z",
  });
  assert.equal(saved.revision, 1);
  assert.deepEqual(await store.load("company-one"), saved);

  await assert.rejects(new GovernanceRegistry({ identity: identity("LOCAL_DEMO"), store }).replace({
    ...catalog(), expectedRevision: 1, recordedAt: "2026-08-20T15:01:00.000Z",
  }), /FORMAL_IDENTITY_REQUIRED/);
});
