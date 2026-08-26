import type { Identifier } from "../core/control-plane.ts";
import type { DataOperation, GovernedDataAccessRequest } from "../core/data-governance.ts";

export interface DataConnectorCapabilities {
  readonly connectorId: Identifier;
  readonly displayName: string;
  readonly protocolVersion: "1.0";
  readonly dataSourceIds: readonly Identifier[];
  readonly supportedOperations: readonly DataOperation[];
}

export interface DataAccessRequest extends GovernedDataAccessRequest {
  readonly requestId: Identifier;
  readonly authorizationContractId: Identifier;
  readonly authorizationReceiptId: Identifier;
}

export type DataAccessResult =
  | {
      readonly type: "GRANTED";
      readonly dataReference: Identifier;
      readonly evidenceReference: Identifier;
      readonly contentDigest: string;
    }
  | { readonly type: "DENIED"; readonly policyCode: string; readonly retryable: boolean };

/** Data-plane boundary. It returns references and digests, never enterprise records. */
export interface DataConnectorPort {
  capabilities(): Promise<DataConnectorCapabilities>;
  health(): Promise<"HEALTHY" | "DEGRADED" | "UNAVAILABLE">;
  access(request: DataAccessRequest): Promise<DataAccessResult>;
}
