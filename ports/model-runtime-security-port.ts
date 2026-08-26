import type { ModelProviderCapabilities } from "./model-provider-runtime-port.ts";

/** Canonical fingerprinting boundary for installed model-provider capability contracts. */
export interface ModelRuntimeSecurityPort {
  digestCapabilities(capabilities: ModelProviderCapabilities): Promise<string>;
}
