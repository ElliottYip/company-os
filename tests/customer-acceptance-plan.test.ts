import assert from "node:assert/strict";
import test from "node:test";

import { createCustomerAcceptancePlan } from "../scripts/prepare-customer-acceptance-plan.mjs";

const digest = (value: string) => `sha256:${value.repeat(64)}`;
const manifest = {
  schemaVersion: 1,
  product: "company-os",
  releaseVersion: "1.2.3",
  sourceRevision: "a".repeat(40),
  profiles: ["managed-cloud", "self-hosted"],
  images: {
    api: `registry.invalid/api@${digest("a")}`,
    web: `registry.invalid/web@${digest("b")}`,
    ops: `registry.invalid/ops@${digest("c")}`,
    codexAgentNode: `registry.invalid/codex-agent-node@${digest("e")}`,
    vaultSecretBroker: `registry.invalid/vault-secret-broker@${digest("f")}`,
    referenceDataNode: `registry.invalid/reference-data-node@${digest("1")}`,
  },
};

test("customer staging plan binds a release and every external evidence gate without claiming execution", () => {
  const plan = createCustomerAcceptancePlan(manifest, "CUSTOMER_STAGING", digest("d"));
  assert.equal(plan.status, "PLANNED_NOT_EXECUTED");
  assert.equal(plan.release.version, "1.2.3");
  assert.equal(plan.release.manifestDigest, digest("d"));
  assert.deepEqual(plan.requiredEvidenceKeys, [
    "boundaryPreflight", "browserIdentity", "responsibilityContract", "agentExecution",
    "modelExecution", "dataBoundary", "secretLifecycle", "idempotency", "restartRecovery",
  ]);
  assert.equal(plan.steps.find(({ evidenceKey }) => evidenceKey === "boundaryPreflight")?.command,
    "npm run ops:preflight:customer-boundaries");
  assert.ok(plan.steps.filter(({ authorization }) => authorization === "CUSTOMER_STAGING_REQUIRED").length >= 8);
  assert.equal(plan.completion.independentlyVerified, false);
  assert.equal(plan.completion.externalEvidenceRequired, true);
  assert.doesNotMatch(JSON.stringify(plan), /customer\.example|bearer|password|clientSecret/i);
});

test("production plan adds sign-off and recovery evidence without weakening staging gates", () => {
  const staging = createCustomerAcceptancePlan(manifest, "CUSTOMER_STAGING", digest("d"));
  const production = createCustomerAcceptancePlan(manifest, "PRODUCTION", digest("d"));
  assert.deepEqual(production.requiredEvidenceKeys.slice(0, staging.requiredEvidenceKeys.length),
    staging.requiredEvidenceKeys);
  assert.ok(production.requiredEvidenceKeys.includes("backupDestination"));
  assert.ok(production.requiredEvidenceKeys.includes("legalHoldPolicy"));
  assert.ok(production.steps.some(({ authorization }) => authorization === "PRODUCTION_CHANGE_REQUIRED"));
});

test("acceptance plan rejects mutable or mismatched release input", () => {
  assert.throws(() => createCustomerAcceptancePlan({ ...manifest, product: "another-product" },
    "CUSTOMER_STAGING", digest("d")), /ACCEPTANCE_PLAN_RELEASE_INVALID/);
  assert.throws(() => createCustomerAcceptancePlan({ ...manifest, images: { ...manifest.images,
    api: "registry.invalid/api:latest" } }, "CUSTOMER_STAGING", digest("d")),
  /ACCEPTANCE_PLAN_RELEASE_INVALID/);
  assert.throws(() => createCustomerAcceptancePlan(manifest, "STAGING" as "CUSTOMER_STAGING", digest("d")),
    /ACCEPTANCE_PLAN_SCOPE_INVALID/);
});
