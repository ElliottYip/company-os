import type { Identifier } from "../core/control-plane.ts";

export interface ModelRequest {
  readonly requestId: Identifier;
  readonly modelPolicyId: Identifier;
  readonly promptReference: Identifier;
  readonly timeoutAt: string;
}

export interface ModelResult {
  readonly requestId: Identifier;
  readonly outputReference: Identifier;
  readonly usageReference: Identifier;
}

export interface ModelProviderPort {
  complete(request: ModelRequest): Promise<ModelResult>;
}

