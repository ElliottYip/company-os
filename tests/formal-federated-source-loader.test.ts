import assert from "node:assert/strict";
import test from "node:test";

import {
  loadFormalFederatedSources,
  parseFormalFederatedSourcePackages,
} from "../adapters/connectors/load-formal-federated-sources.ts";

test("formal Federated Sources load only installed packages with unique neutral identities", async () => {
  assert.deepEqual(parseFormalFederatedSourcePackages(
    "@company-os/federated-source-reference,enterprise-source",
  ), ["@company-os/federated-source-reference", "enterprise-source"]);
  assert.throws(() => parseFormalFederatedSourcePackages("../local-source.mjs"),
    /FEDERATED_SOURCE_PACKAGE_LIST_INVALID/);

  const sources = await loadFormalFederatedSources(["enterprise-source"], async () => ({
    createFederatedPortfolioSource: async () => ({
      connectorId: "source-one",
      companyId: "company-one",
      async synchronize() { return { inventory: [], work: [], anomalies: [] }; },
    }),
  }));
  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.connectorId, "source-one");
});

test("formal Federated Source loader rejects missing factories and duplicate connectors", async () => {
  await assert.rejects(loadFormalFederatedSources(["missing"], async () => ({})),
    /FEDERATED_SOURCE_MODULE_FACTORY_REQUIRED/);
  await assert.rejects(loadFormalFederatedSources(["first", "second"], async () => ({
    createFederatedPortfolioSource: async () => ({
      connectorId: "source-one",
      companyId: "company-one",
      async synchronize() { return { inventory: [], work: [], anomalies: [] }; },
    }),
  })), /FEDERATED_SOURCE_CONNECTOR_DUPLICATE/);
});
