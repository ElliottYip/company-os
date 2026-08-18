import assert from "node:assert/strict";
import test from "node:test";

import { selectModelRoute } from "../core/model-governance.ts";

test("model route selects by policy without exposing a credential or raw prompt", () => {
  const route = selectModelRoute({
    id: "policy-one",
    companyId: "company-one",
    routes: [
      {
        id: "route-local",
        providerAdapterId: "provider-local",
        modelReference: "model-balanced",
        credentialReference: "credential-vault-ref-one",
        allowedDataClassifications: ["PUBLIC", "INTERNAL"],
        residency: "LOCAL",
        enabled: true,
      },
    ],
  }, {
    companyId: "company-one",
    policyId: "policy-one",
    classification: "INTERNAL",
    requiredResidency: "LOCAL",
  });

  assert.equal(route.type, "SELECTED");
  assert.equal(JSON.stringify(route).includes("apiKey"), false);
  assert.equal(JSON.stringify(route).includes("prompt"), false);
});

test("model routing denies tenant, classification, residency, or disabled routes", () => {
  const policy = {
    id: "policy-one",
    companyId: "company-one",
    routes: [{
      id: "route-cloud",
      providerAdapterId: "provider-cloud",
      modelReference: "model-one",
      credentialReference: "credential-ref",
      allowedDataClassifications: ["PUBLIC" as const],
      residency: "MANAGED_CLOUD" as const,
      enabled: true,
    }],
  };
  assert.equal(selectModelRoute(policy, {
    companyId: "company-two", policyId: "policy-one", classification: "PUBLIC",
    requiredResidency: "MANAGED_CLOUD",
  }).type, "DENIED");
  assert.equal(selectModelRoute(policy, {
    companyId: "company-one", policyId: "policy-one", classification: "CONFIDENTIAL",
    requiredResidency: "MANAGED_CLOUD",
  }).type, "DENIED");
  assert.equal(selectModelRoute(policy, {
    companyId: "company-one", policyId: "policy-one", classification: "PUBLIC",
    requiredResidency: "LOCAL",
  }).type, "DENIED");
});
