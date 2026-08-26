import assert from "node:assert/strict";
import test from "node:test";

import { loadFormalModelProviders, parseFormalModelProviderPackages } from
  "../adapters/models/load-formal-model-providers.ts";

const provider = (id = "provider-one") => ({
  async capabilities() { return { providerAdapterId: id, displayName: "Provider One",
    protocolVersion: "1.0" as const, modelReferences: ["model-one"],
    supportedResidencies: ["LOCAL" as const] }; },
  async health() { return "HEALTHY" as const; },
});

test("formal model provider loader admits installed packages with unique provider identities", async () => {
  assert.deepEqual(parseFormalModelProviderPackages("provider-one,@company/provider-two"),
    ["provider-one", "@company/provider-two"]);
  const ports = await loadFormalModelProviders(["provider-one"], async () => ({
    createModelProviderRuntimePort: () => provider(),
  }));
  assert.equal((await ports[0]?.capabilities())?.providerAdapterId, "provider-one");
  assert.equal("complete" in (ports[0] as object), false);
});

test("formal model provider loader rejects paths, duplicate identities, and invalid capabilities", async () => {
  assert.throws(() => parseFormalModelProviderPackages("./provider.ts"), /MODEL_PROVIDER_PACKAGE_LIST_INVALID/);
  await assert.rejects(loadFormalModelProviders(["one", "two"], async () => ({
    createModelProviderRuntimePort: () => provider(),
  })), /MODEL_PROVIDER_ID_DUPLICATE/);
  await assert.rejects(loadFormalModelProviders(["one"], async () => ({
    createModelProviderRuntimePort: () => ({ ...provider(), async capabilities() { return {
      providerAdapterId: "provider-one", displayName: "Provider", protocolVersion: "1.0" as const,
      modelReferences: [], supportedResidencies: ["LOCAL" as const],
    }; } }),
  })), /MODEL_PROVIDER_CAPABILITIES_INVALID/);
});
