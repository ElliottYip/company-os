import type { Identifier } from "./control-plane.ts";

export type SecretPurpose =
  | "MODEL_PROVIDER"
  | "DATA_CONNECTOR"
  | "AGENT_CONNECTOR"
  | "IDENTITY_ADAPTER";

/** Metadata only. Secret material is owned by the selected broker adapter. */
export interface SecretReference {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly purpose: SecretPurpose;
  readonly providerAdapterId: Identifier;
  readonly currentVersion: number;
  readonly status: "ACTIVE" | "SUSPENDED" | "REVOKED";
}

export interface SecretLeaseIntent {
  readonly companyId: Identifier;
  readonly secretReferenceId: Identifier;
  readonly expectedVersion: number;
  readonly consumerId: Identifier;
  readonly workAttemptId: Identifier;
  readonly reasonCode: string;
  readonly expiresAt: string;
}

/** Opaque, secret-free proof that an execution node may redeem at its broker. */
export interface SecretLeaseGrant {
  readonly id: Identifier;
  readonly secretReferenceId: Identifier;
  readonly version: number;
  readonly consumerId: Identifier;
  readonly workAttemptId: Identifier;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly attestationDigest: string;
}

export type SecretReferenceManagementOperation =
  | "CREATE"
  | "ROTATE"
  | "SUSPEND"
  | "REVOKE";

/** Secret-free intent. Credential material is collected by the broker UI. */
export interface SecretReferenceManagementIntent {
  readonly companyId: Identifier;
  readonly referenceId: Identifier;
  readonly operation: SecretReferenceManagementOperation;
  readonly purpose: SecretPurpose;
  readonly providerAdapterId: Identifier;
  readonly expectedVersion: number | null;
}

/** A short-lived browser handoff. The URL must never be persisted as an event. */
export interface SecretReferenceManagementSession {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly referenceId: Identifier;
  readonly operation: SecretReferenceManagementOperation;
  readonly managementUrl: string;
  readonly expiresAt: string;
}

export type SecretReferenceManagementResult =
  | { readonly status: "PENDING" }
  | { readonly status: "FAILED"; readonly code: string; readonly retryable: boolean }
  | { readonly status: "COMPLETED"; readonly reference: SecretReference };
