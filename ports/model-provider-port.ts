import type { ModelResidency } from "../core/model-governance.ts";

export interface ModelProviderCapabilities {
  readonly providerAdapterId: string;
  readonly displayName: string;
  readonly protocolVersion: "1.0";
  readonly modelReferences: readonly string[];
  readonly supportedResidencies: readonly ModelResidency[];
}

/**
 * Control-plane view of an installed model boundary.
 *
 * Inference is deliberately absent: the bound Agent execution node redeems the
 * opaque Broker grant and owns provider I/O. Company OS only selects, freezes,
 * fingerprints, and health-checks the route.
 */
export interface ModelProviderPort {
  capabilities(): Promise<ModelProviderCapabilities>;
  health(): Promise<"HEALTHY" | "DEGRADED" | "UNAVAILABLE">;
}
