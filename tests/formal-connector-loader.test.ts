import assert from "node:assert/strict";
import test from "node:test";

import {
  loadFormalConnectors,
  parseFormalConnectorPackages,
  type CompanyOsConnectorModule,
} from "../adapters/connectors/load-formal-connectors.ts";
import type { AgentExecutionPort } from "../ports/agent-execution-port.ts";

function port(connectorId: string): AgentExecutionPort {
  return {
    async capabilities() { return { connectorId, displayName: `Connector ${connectorId}`,
      protocolVersion: "1.0", supportsPause: true, supportsResume: true,
      supportsCancellation: true, supportsEvidence: true, maximumTimeoutSeconds: 3600 }; },
    async health() { return "HEALTHY"; }, async deploy() { throw new Error("unused"); },
    async submit() { throw new Error("unused"); }, async observe() { return []; },
    async pause() {}, async resume() {}, async cancel() {},
  };
}

test("formal Connector package configuration accepts installed package names only", () => {
  assert.deepEqual(parseFormalConnectorPackages("@company-os/raft, company-codex"),
    ["@company-os/raft", "company-codex"]);
  assert.deepEqual(parseFormalConnectorPackages(undefined), []);
  assert.throws(() => parseFormalConnectorPackages("./connector.ts"), /CONNECTOR_PACKAGE_LIST_INVALID/);
  assert.throws(() => parseFormalConnectorPackages("file:\/\/\/tmp/connector.mjs"), /CONNECTOR_PACKAGE_LIST_INVALID/);
  assert.throws(() => parseFormalConnectorPackages("connector,connector"), /CONNECTOR_PACKAGE_DUPLICATE/);
});

test("formal Connector loader waits for factories and rejects duplicate runtime identities", async () => {
  const modules = new Map<string, CompanyOsConnectorModule>([
    ["connector-a", { async createAgentExecutionPort() { return port("connector-one"); } }],
    ["connector-b", { async createAgentExecutionPort() { return port("connector-two"); } }],
    ["connector-duplicate", { async createAgentExecutionPort() { return port("connector-one"); } }],
  ]);
  const importer = async (specifier: string) => modules.get(specifier) ?? {};
  const loaded = await loadFormalConnectors(["connector-a", "connector-b"], importer);
  assert.equal(loaded.length, 2);
  assert.deepEqual(await Promise.all(loaded.map((candidate) => candidate.capabilities()
    .then(({ connectorId }) => connectorId))), ["connector-one", "connector-two"]);
  await assert.rejects(loadFormalConnectors(["connector-a", "connector-duplicate"], importer),
    /CONNECTOR_ID_DUPLICATE/);
  await assert.rejects(loadFormalConnectors(["unknown"], importer),
    /CONNECTOR_MODULE_FACTORY_REQUIRED/);
});

test("formal Connector loader rejects incomplete ports and unsafe capability claims", async () => {
  await assert.rejects(loadFormalConnectors(["broken"], async () => ({
    createAgentExecutionPort: () => ({}) as AgentExecutionPort,
  })), /CONNECTOR_PORT_INVALID/);
  await assert.rejects(loadFormalConnectors(["unsafe"], async () => ({
    createAgentExecutionPort: () => ({ ...port("connector-one"), async capabilities() {
      return { ...(await port("connector-one").capabilities()), supportsPause: false, supportsResume: true };
    } }),
  })), /CONNECTOR_CAPABILITIES_INVALID/);
});
