import assert from "node:assert/strict";
import test from "node:test";

import {
  configuredAccountabilityExportPolicyId,
  configuredRetentionPolicyId,
} from "../adapters/http/retention-policy-configuration.ts";

test("retention policy is an operator-owned stable reference, not a browser-selected duration", () => {
  assert.equal(configuredRetentionPolicyId(undefined), "standard-retention");
  assert.equal(configuredRetentionPolicyId(" regulated-seven-year "), "regulated-seven-year");
  for (const value of ["Seven Years", "delete-after=7", "a".repeat(65)]) {
    assert.throws(() => configuredRetentionPolicyId(value), /COMPANY_OS_RETENTION_POLICY_ID_INVALID/);
  }
});

test("accountability export policy is an operator-owned opaque reference", () => {
  assert.equal(configuredAccountabilityExportPolicyId(undefined), "standard-accountability-export");
  assert.equal(configuredAccountabilityExportPolicyId(" regulated-audit-export "), "regulated-audit-export");
  for (const value of ["UPPER", "contains space", "a".repeat(65)]) {
    assert.throws(
      () => configuredAccountabilityExportPolicyId(value),
      /COMPANY_OS_ACCOUNTABILITY_EXPORT_POLICY_ID_INVALID/,
    );
  }
});
