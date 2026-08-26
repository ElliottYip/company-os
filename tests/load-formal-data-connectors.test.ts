import assert from "node:assert/strict";
import test from "node:test";

import { loadFormalDataConnectors, parseFormalDataConnectorPackages } from "../adapters/data/load-formal-data-connectors.ts";

const port = (id: string, source: string) => ({
  async capabilities() { return { connectorId: id, displayName: id, protocolVersion: "1.0" as const,
    dataSourceIds: [source], supportedOperations: ["READ" as const] }; },
  async health() { return "HEALTHY" as const; },
  async access() { return { type: "DENIED" as const, policyCode: "TEST_DENIAL", retryable: false }; },
});

test("formal Data Connector loader admits installed packages with one canonical owner per source", async () => {
  assert.deepEqual(parseFormalDataConnectorPackages("@company-os/a,@company-os/b"), ["@company-os/a", "@company-os/b"]);
  const loaded = await loadFormalDataConnectors(["@company-os/a", "@company-os/b"], async (name) => ({
    createDataConnectorPort: () => name.endsWith("a") ? port("data-a", "source-a") : port("data-b", "source-b"),
  }));
  assert.equal(loaded.length, 2);
});

test("formal Data Connector loader rejects paths, duplicate sources, and malformed capabilities", async () => {
  assert.throws(() => parseFormalDataConnectorPackages("./local.js"), /DATA_CONNECTOR_PACKAGE_LIST_INVALID/);
  await assert.rejects(() => loadFormalDataConnectors(["data-a", "data-b"], async (name) => ({
    createDataConnectorPort: () => port(name, "shared-source"),
  })), /DATA_CONNECTOR_SOURCE_AMBIGUOUS/);
  await assert.rejects(() => loadFormalDataConnectors(["data-a"], async () => ({
    createDataConnectorPort: () => port("bad_id", "source-a"),
  })), /DATA_CONNECTOR_CAPABILITIES_INVALID/);
});
