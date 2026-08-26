import assert from "node:assert/strict";
import test from "node:test";

import {
  loadFormalSecretBroker,
  parseFormalSecretBrokerPackage,
} from "../adapters/secrets/load-formal-secret-broker.ts";
import type { SecretBrokerRuntimePort } from "../ports/secret-broker-runtime-port.ts";

function broker(overrides: Partial<SecretBrokerRuntimePort> = {}): SecretBrokerRuntimePort {
  return {
    async capabilities() { return { brokerId: "enterprise-vault", displayName: "Enterprise Vault",
      protocolVersion: "1.0", supportedPurposes: ["MODEL_PROVIDER", "DATA_CONNECTOR"],
      maximumLeaseSeconds: 600 }; },
    async health() { return "HEALTHY"; },
    async describe() { return null; },
    async issueLease() { return { ok: false, error: { code: "NOT_CONFIGURED", retryable: false } }; },
    async revokeLease() {},
    ...overrides,
  };
}

test("formal Secret Broker package loader accepts one installed package and waits for its factory", async () => {
  assert.equal(parseFormalSecretBrokerPackage("@company/vault-broker"), "@company/vault-broker");
  assert.equal(parseFormalSecretBrokerPackage(undefined), null);
  const loaded = await loadFormalSecretBroker("@company/vault-broker", async () => ({
    async createSecretBrokerRuntimePort() { return broker(); },
  }));
  assert.equal((await loaded?.capabilities())?.brokerId, "enterprise-vault");
});

test("formal Secret Broker package loader rejects paths, missing factories, and unsafe capabilities", async () => {
  assert.throws(() => parseFormalSecretBrokerPackage("./vault.ts"), /SECRET_BROKER_PACKAGE_INVALID/);
  await assert.rejects(loadFormalSecretBroker("company-vault", async () => ({})),
    /SECRET_BROKER_MODULE_FACTORY_REQUIRED/);
  await assert.rejects(loadFormalSecretBroker("company-vault", async () => ({
    createSecretBrokerRuntimePort: () => broker({
      async capabilities() { return { brokerId: "vault", displayName: "Vault", protocolVersion: "1.0",
        supportedPurposes: [], maximumLeaseSeconds: 901 }; },
    }),
  })), /SECRET_BROKER_CAPABILITIES_INVALID/);
});
