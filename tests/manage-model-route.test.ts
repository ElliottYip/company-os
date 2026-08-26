import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { EventBackedGovernanceCatalogStore } from "../adapters/storage/event-backed-governance-catalog-store.ts";
import { ManageModelRoute } from "../application/manage-model-route.ts";

function harness(secretStatus: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
  const events = new InMemoryEventStore(); let id = 0;
  const store = new EventBackedGovernanceCatalogStore(events, () => `event-${++id}`);
  const provider = { async capabilities() { return { providerAdapterId: "provider-one", displayName: "Provider",
    protocolVersion: "1.0" as const, modelReferences: ["model-one"], supportedResidencies: ["LOCAL" as const] }; },
    async health() { return "HEALTHY" as const; } };
  const secretBroker = { async capabilities() { return { brokerId: "vault", displayName: "Vault",
    protocolVersion: "1.0" as const, supportedPurposes: ["MODEL_PROVIDER" as const], maximumLeaseSeconds: 600 }; },
    async health() { return "HEALTHY" as const; }, async describe() { return { id: "secret-one",
      companyId: "company-one", purpose: "MODEL_PROVIDER" as const, providerAdapterId: "provider-one",
      currentVersion: 1, status: secretStatus }; }, async issueLease() { return { ok: false as const,
      error: { code: "unused", retryable: false } }; }, async revokeLease() {} };
  const identity = { async getCurrentIdentity() { return { actorId: "human-one", organizationId: "company-one",
    displayName: "Human", assurance: "ENTERPRISE_ASSERTED" as const }; }, async currentPrincipal() { return null; },
    async authorize() { return { id: `receipt-${++id}`, principalId: "human-one", authorizedAt: "2026-08-24T12:00:00.000Z" }; } };
  return { identity, provider, secretBroker, store, service: new ManageModelRoute({ identity, store,
    providers: [provider], secretBroker, now: () => "2026-08-24T12:00:00.000Z" }) };
}

const input = { companyId: "company-one", policyId: "default-models", routeId: "route-one",
  providerAdapterId: "provider-one", modelReference: "model-one", credentialReference: "secret-one",
  allowedDataClassifications: ["PUBLIC" as const], residency: "LOCAL" as const, expectedRevision: 0 };

test("model route is created disabled and enabled only after provider and Secret validation", async () => {
  const { service, store } = harness();
  const created = await service.create(input);
  assert.equal(created.modelRoutingPolicies[0]?.routes[0]?.enabled, false);
  const enabled = await service.setEnabled({ companyId: "company-one", routeId: "route-one",
    enabled: true, expectedRevision: 1 });
  assert.equal(enabled.modelRoutingPolicies[0]?.routes[0]?.enabled, true);
  assert.equal((await store.load("company-one")).revision, 2);
});

test("model route fails closed for inactive Secrets and absent provider runtime", async () => {
  await assert.rejects(harness("SUSPENDED").service.create(input), /SECRET_REFERENCE_INACTIVE/);
  const { identity, secretBroker, store, service } = harness();
  await service.create(input);
  const inaccessible = new ManageModelRoute({
    identity, store, providers: [], secretBroker, now: () => "2026-08-24T12:00:00.000Z",
  });
  await assert.rejects(inaccessible.setEnabled({ companyId: "company-one", routeId: "route-one",
    enabled: true, expectedRevision: 1 }), /MODEL_PROVIDER_NOT_INSTALLED/);
});
