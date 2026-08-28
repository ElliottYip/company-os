import assert from "node:assert/strict";
import test from "node:test";

import type {
  CapabilityDeclarationV2,
  FederatedWorkSynchronization,
  ObservedWorkRegistration,
} from "../connector-sdk/index.ts";

test("Connector SDK publishes provider-neutral inventory, observed, and federated contracts", () => {
  const declaration: CapabilityDeclarationV2 = {
    connectorId: "connector-one",
    protocolVersion: "2.0",
    capabilities: {
      data: ["AGENT_INVENTORY", "OBSERVED_WORK", "FEDERATED_WORK", "USAGE"],
      control: ["REGISTER_OBSERVED_WORK", "SYNCHRONIZE_FEDERATED_RECORDS"],
    },
    maximumBatchSize: 100,
  };
  const observed: ObservedWorkRegistration = {
    mode: "OBSERVED",
    idempotencyKey: "observed-one",
    record: {} as ObservedWorkRegistration["record"],
  };
  const federated: FederatedWorkSynchronization = {
    mode: "FEDERATED",
    idempotencyKey: "federated-one",
    record: {} as FederatedWorkSynchronization["record"],
  };

  assert.equal(declaration.protocolVersion, "2.0");
  assert.equal(observed.mode, "OBSERVED");
  assert.equal(federated.mode, "FEDERATED");
});
