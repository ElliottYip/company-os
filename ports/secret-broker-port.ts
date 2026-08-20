import type { Identifier } from "../core/control-plane.ts";
import type {
  SecretLeaseGrant,
  SecretLeaseIntent,
  SecretReference,
} from "../core/secret-governance.ts";

export type SecretLeaseResult =
  | { readonly ok: true; readonly value: SecretLeaseGrant }
  | { readonly ok: false; readonly error: { readonly code: string; readonly retryable: boolean } };

/**
 * Execution-plane broker boundary. It exposes metadata and opaque lease proofs,
 * never credential material, provider sessions, or environment values.
 */
export interface SecretBrokerPort {
  describe(companyId: Identifier, referenceId: Identifier): Promise<SecretReference | null>;
  issueLease(
    intent: SecretLeaseIntent,
    authorizationReceiptId: Identifier,
  ): Promise<SecretLeaseResult>;
  revokeLease(
    companyId: Identifier,
    leaseId: Identifier,
    reasonCode: string,
  ): Promise<void>;
}
