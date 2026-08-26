import assert from "node:assert/strict";
import test from "node:test";

import { validateCustomerAcceptanceRecord } from "../scripts/validate-customer-acceptance-record.mjs";

const sha = (value: string) => `sha256:${value.repeat(64)}`;
const evidence = (keys: readonly string[]) => Object.fromEntries(keys.map((key, index) => [key, sha(String((index % 9) + 1))]));
const stagingKeys = [
  "boundaryPreflight", "browserIdentity", "responsibilityContract", "agentExecution",
  "modelExecution", "dataBoundary", "secretLifecycle", "idempotency", "restartRecovery",
] as const;
const productionKeys = [
  "changeRecord", "certificateChain", "networkPolicy", "rotationOwnership",
  "sessionPolicy", "backupDestination", "retentionPolicy", "monitoringRoute",
  "incidentContacts", "rollbackWindow", "legalHoldPolicy",
] as const;
const record = (scope: "CUSTOMER_STAGING" | "PRODUCTION" = "CUSTOMER_STAGING") => ({
  schemaVersion: 2,
  recordId: "acceptance-2026-08-25",
  scope,
  release: { version: "1.2.3", sourceRevision: "a".repeat(40), manifestDigest: sha("a") },
  owners: {
    acceptance: "human-acceptance", identity: "human-identity", agentRuntime: "human-agent",
    modelGovernance: "human-model", dataGovernance: "human-data", secretManagement: "human-secrets",
    backupRecovery: "human-backup", incidentResponse: "human-incident",
  },
  stagingEvidence: evidence(stagingKeys),
  productionEvidence: scope === "PRODUCTION" ? evidence(productionKeys) : null,
  approvedAt: "2026-08-25T12:00:00.000Z",
  approvalEvidenceDigest: sha("f"),
});

test("customer acceptance record binds every staging boundary but does not self-attest truth", () => {
  const result = validateCustomerAcceptanceRecord(record());
  assert.equal(result.status, "RECORD_STRUCTURALLY_VALID");
  assert.equal(result.independentlyVerified, false);
  assert.equal(result.externalEvidenceRequired, true);
});

test("customer staging cannot pass without separately owned real model execution evidence", () => {
  const incomplete = record();
  delete (incomplete.stagingEvidence as Record<string, string>).modelExecution;
  assert.throws(() => validateCustomerAcceptanceRecord(incomplete), /ACCEPTANCE_STAGING_EVIDENCE_INVALID/);
  const missingOwner = record();
  delete (missingOwner.owners as Record<string, string>).modelGovernance;
  assert.throws(() => validateCustomerAcceptanceRecord(missingOwner), /ACCEPTANCE_OWNERS_INVALID/);
});

test("production acceptance additionally requires recovery, retention, monitoring and incident evidence", () => {
  const result = validateCustomerAcceptanceRecord(record("PRODUCTION"));
  assert.equal(result.scope, "PRODUCTION");
  const incomplete = record("PRODUCTION");
  delete (incomplete.productionEvidence as Record<string, string>).backupDestination;
  assert.throws(() => validateCustomerAcceptanceRecord(incomplete), /ACCEPTANCE_PRODUCTION_EVIDENCE_INVALID/);
});

test("acceptance record rejects coordinates, personal identity and credentials", () => {
  assert.throws(() => validateCustomerAcceptanceRecord({ ...record(), customerUrl: "https://customer.example" }),
    /ACCEPTANCE_RECORD_FORBIDDEN_FIELD/);
  assert.throws(() => validateCustomerAcceptanceRecord({ ...record(), owners: {
    ...record().owners, identity: "person@example.com",
  } }), /ACCEPTANCE_RECORD_CUSTOMER_COORDINATE_FORBIDDEN/);
  assert.throws(() => validateCustomerAcceptanceRecord({ ...record(), clientSecret: "not-allowed" }),
    /ACCEPTANCE_RECORD_FORBIDDEN_FIELD/);
});

test("staging record cannot imply production acceptance", () => {
  assert.throws(() => validateCustomerAcceptanceRecord({
    ...record(), productionEvidence: evidence(productionKeys),
  }), /ACCEPTANCE_STAGING_PRODUCTION_EVIDENCE_MUST_BE_NULL/);
});
