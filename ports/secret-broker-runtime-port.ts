import type { SecretPurpose } from "../core/secret-governance.ts";
import type { SecretBrokerPort } from "./secret-broker-port.ts";
import type { SecretBrokerManagementPort } from "./secret-broker-management-port.ts";

export interface SecretBrokerCapabilities {
  readonly brokerId: string;
  readonly displayName: string;
  readonly protocolVersion: "1.0";
  readonly supportedPurposes: readonly SecretPurpose[];
  readonly maximumLeaseSeconds: number;
}

/** Installed execution-edge Secret Broker with metadata-only runtime probes. */
export interface SecretBrokerRuntimePort extends SecretBrokerPort {
  capabilities(): Promise<SecretBrokerCapabilities>;
  health(): Promise<"HEALTHY" | "DEGRADED" | "UNAVAILABLE">;
  beginReferenceManagement?: SecretBrokerManagementPort["beginReferenceManagement"];
  referenceManagementResult?: SecretBrokerManagementPort["referenceManagementResult"];
}
