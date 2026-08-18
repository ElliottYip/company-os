import type { Identifier } from "../core/control-plane.ts";

export interface DataAccessRequest {
  readonly workId: Identifier;
  readonly authorizationContractId: Identifier;
  readonly dataSourceId: Identifier;
  readonly operation: "READ" | "WRITE" | "EXPORT";
  readonly purpose: string;
}

export type DataAccessResult =
  | { readonly type: "GRANTED"; readonly dataReference: Identifier }
  | { readonly type: "DENIED"; readonly policyCode: string };

export interface DataConnectorPort {
  access(request: DataAccessRequest): Promise<DataAccessResult>;
}

