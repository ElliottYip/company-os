import type { ModelProviderPort } from "./model-provider-port.ts";

export type { ModelProviderCapabilities } from "./model-provider-port.ts";

/** Installed package form of the neutral model-provider control-plane port. */
export interface ModelProviderRuntimePort extends ModelProviderPort {}
