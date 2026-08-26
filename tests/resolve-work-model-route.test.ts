import assert from "node:assert/strict";
import test from "node:test";

import { ResolveWorkModelRoute } from "../application/resolve-work-model-route.ts";

const policy = {
  id: "default-models",
  companyId: "company-one",
  routes: [{
    id: "local-primary",
    providerAdapterId: "provider-one",
    modelReference: "model-one",
    credentialReference: "model-secret-one",
    allowedDataClassifications: ["INTERNAL" as const],
    residency: "LOCAL" as const,
    enabled: true,
  }],
};

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    governance: {
      async load() {
        return {
          companyId: "company-one",
          revision: 3,
          modelRoutingPolicies: [policy],
          dataAuthorizationContracts: [],
        };
      },
      async replace() { throw new Error("unused"); },
    },
    providers: [{
      async capabilities() {
        return {
          providerAdapterId: "provider-one",
          displayName: "Provider One",
          protocolVersion: "1.0" as const,
          modelReferences: ["model-one"],
          supportedResidencies: ["LOCAL" as const],
        };
      },
      async health() { return "HEALTHY" as const; },
    }],
    secretBroker: {
      async capabilities() {
        return {
          brokerId: "broker-one", displayName: "Broker One", protocolVersion: "1.0" as const,
          supportedPurposes: ["MODEL_PROVIDER" as const], maximumLeaseSeconds: 900,
        };
      },
      async health() { return "HEALTHY" as const; },
      async describe() {
        return {
          id: "model-secret-one", companyId: "company-one", purpose: "MODEL_PROVIDER" as const,
          providerAdapterId: "provider-one", currentVersion: 7, status: "ACTIVE" as const,
        };
      },
      async issueLease() { throw new Error("unused"); },
      async revokeLease() { throw new Error("unused"); },
    },
    runtimeSecurity: {
      async digestCapabilities() { return `sha256:${"f".repeat(64)}`; },
    },
    ...overrides,
  };
}

test("model routing freezes one installed, healthy, broker-backed route as secret-free execution authority", async () => {
  const resolver = new ResolveWorkModelRoute(dependencies());
  const authority = await resolver.execute({
    companyId: "company-one",
    policyId: "default-models",
    classification: "INTERNAL",
    requiredResidency: "LOCAL",
  });

  assert.deepEqual(authority, {
    policyId: "default-models",
    routeId: "local-primary",
    providerAdapterId: "provider-one",
    modelReference: "model-one",
    classification: "INTERNAL",
    residency: "LOCAL",
    credentialReferenceId: "model-secret-one",
    credentialVersion: 7,
    providerCapabilityDigest: `sha256:${"f".repeat(64)}`,
  });
  assert.doesNotMatch(JSON.stringify(authority), /api.?key|password|access.?token|secretValue/i);
});

test("model routing fails closed when the selected provider or broker binding changed", async () => {
  const unavailable = dependencies({
    providers: [{
      async capabilities() {
        return { providerAdapterId: "provider-one", displayName: "Provider One", protocolVersion: "1.0" as const,
          modelReferences: ["model-one"], supportedResidencies: ["LOCAL" as const] };
      },
      async health() { return "UNAVAILABLE" as const; },
    }],
  });
  await assert.rejects(
    new ResolveWorkModelRoute(unavailable).execute({
      companyId: "company-one", policyId: "default-models",
      classification: "INTERNAL", requiredResidency: "LOCAL",
    }),
    /MODEL_PROVIDER_UNAVAILABLE/,
  );

  const wrongSecret = dependencies({
    secretBroker: {
      ...dependencies().secretBroker,
      async describe() {
        return { id: "model-secret-one", companyId: "company-one", purpose: "MODEL_PROVIDER" as const,
          providerAdapterId: "provider-other", currentVersion: 7, status: "ACTIVE" as const };
      },
    },
  });
  await assert.rejects(
    new ResolveWorkModelRoute(wrongSecret).execute({
      companyId: "company-one", policyId: "default-models",
      classification: "INTERNAL", requiredResidency: "LOCAL",
    }),
    /MODEL_ROUTE_SECRET_BINDING_INVALID/,
  );
});
