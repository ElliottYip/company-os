import type { Identifier } from "../core/control-plane.ts";
import type {
  SecretReferenceManagementIntent,
  SecretReferenceManagementResult,
  SecretReferenceManagementSession,
} from "../core/secret-governance.ts";

/**
 * Browser-mediated secret administration. Company OS supplies policy context;
 * the broker alone collects and stores credential material.
 */
export interface SecretBrokerManagementPort {
  beginReferenceManagement(
    intent: SecretReferenceManagementIntent,
    authorizationReceiptId: Identifier,
  ): Promise<SecretReferenceManagementSession>;
  referenceManagementResult(
    companyId: Identifier,
    sessionId: Identifier,
  ): Promise<SecretReferenceManagementResult>;
}
