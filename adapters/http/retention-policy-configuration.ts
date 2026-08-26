import type { Identifier } from "../../core/control-plane.ts";

const IDENTIFIER = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Resolves an operator-owned retention contract reference. The identifier does
 * not encode a deletion duration and grants no physical-erasure authority.
 */
export function configuredRetentionPolicyId(value: string | undefined): Identifier {
  const policyId = value?.trim() || "standard-retention";
  if (!IDENTIFIER.test(policyId)) throw new Error("COMPANY_OS_RETENTION_POLICY_ID_INVALID");
  return policyId;
}

/**
 * Resolves the operator-owned policy that governs which accountability records
 * may leave the control plane. It is a policy reference, never a destination or
 * credential.
 */
export function configuredAccountabilityExportPolicyId(value: string | undefined): Identifier {
  const policyId = value?.trim() || "standard-accountability-export";
  if (!IDENTIFIER.test(policyId)) {
    throw new Error("COMPANY_OS_ACCOUNTABILITY_EXPORT_POLICY_ID_INVALID");
  }
  return policyId;
}
