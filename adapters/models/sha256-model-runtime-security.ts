import { createHash } from "node:crypto";

import type { ModelProviderCapabilities } from "../../ports/model-provider-runtime-port.ts";
import type { ModelRuntimeSecurityPort } from "../../ports/model-runtime-security-port.ts";

export class Sha256ModelRuntimeSecurity implements ModelRuntimeSecurityPort {
  async digestCapabilities(capabilities: ModelProviderCapabilities): Promise<string> {
    const canonical = {
      schemaVersion: 1,
      providerAdapterId: capabilities.providerAdapterId,
      protocolVersion: capabilities.protocolVersion,
      modelReferences: [...capabilities.modelReferences].sort(),
      supportedResidencies: [...capabilities.supportedResidencies].sort(),
    };
    return `sha256:${createHash("sha256").update(JSON.stringify(canonical)).digest("hex")}`;
  }
}
