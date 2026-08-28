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
      async capabilities() { return { connectorId: "source-one", protocolVersion: "2.0" as const,
        capabilities: { data: ["AGENT_INVENTORY" as const, "FEDERATED_WORK" as const],
          control: ["SYNCHRONIZE_FEDERATED_RECORDS" as const] }, maximumBatchSize: 200 }; },
      async health() { return { status: "NOT_CHECKED" as const, checkedAt: null, lastSuccessfulAt: null }; },
      async synchronize() { return { inventory: [], work: [], anomalies: [] }; },
    }),
  }));
  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.connectorId, "source-one");
  assert.deepEqual(await sources[0]?.capabilities(), {
    connectorId: "source-one", protocolVersion: "2.0",
    capabilities: { data: ["AGENT_INVENTORY", "FEDERATED_WORK"],
      control: ["SYNCHRONIZE_FEDERATED_RECORDS"] }, maximumBatchSize: 200,
  });
});

test("formal Federated Source loader rejects missing factories and duplicate connectors", async () => {
  await assert.rejects(loadFormalFederatedSources(["missing"], async () => ({})),
    /FEDERATED_SOURCE_MODULE_FACTORY_REQUIRED/);
  await assert.rejects(loadFormalFederatedSources(["first", "second"], async () => ({
    createFederatedPortfolioSource: async () => ({
      connectorId: "source-one",
      companyId: "company-one",
      async capabilities() { return { connectorId: "source-one", protocolVersion: "2.0" as const,
        capabilities: { data: ["FEDERATED_WORK" as const],
          control: ["SYNCHRONIZE_FEDERATED_RECORDS" as const] }, maximumBatchSize: 200 }; },
      async health() { return { status: "NOT_CHECKED" as const, checkedAt: null, lastSuccessfulAt: null }; },
      async synchronize() { return { inventory: [], work: [], anomalies: [] }; },
    }),
  })), /FEDERATED_SOURCE_CONNECTOR_DUPLICATE/);
});

test("formal Federated Source loader rejects packages without capability and health contracts", async () => {
  await assert.rejects(loadFormalFederatedSources(["incomplete"], async () => ({
    createFederatedPortfolioSource: async () => ({
      connectorId: "source-one", companyId: "company-one",
      async synchronize() { return { inventory: [], work: [], anomalies: [] }; },
    }),
  })), /FEDERATED_SOURCE_PORT_INVALID/);
});
