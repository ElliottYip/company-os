import assert from "node:assert/strict";
import test from "node:test";

import {
  capabilitiesFromLegacyOperations,
  validateConnectorCapabilities,
} from "../core/connector-capabilities.ts";

test("an inventory Connector can declare data visibility without execution control", () => {
  const capabilities = validateConnectorCapabilities({
    data: ["AGENT_INVENTORY", "USAGE", "CREDENTIAL_STATUS"],
    control: [],
  });

  assert.deepEqual(capabilities.control, []);
});

test("an observed Connector can register bounded Work without dispatch", () => {
  const capabilities = validateConnectorCapabilities({
    data: ["AGENT_INVENTORY", "OBSERVED_WORK", "USAGE"],
    control: ["REGISTER_OBSERVED_WORK"],
  });

  assert.equal(capabilities.control.includes("DISPATCH_WORK"), false);
});

test("a federated Connector synchronizes external runtime records without ANC execution", () => {
  const capabilities = validateConnectorCapabilities({
    data: ["AGENT_INVENTORY", "IDENTITY_MAPPING", "FEDERATED_WORK", "ARTIFACT_REFERENCES"],
    control: ["SYNCHRONIZE_FEDERATED_RECORDS"],
  });

  assert.equal(capabilities.control.includes("DISPATCH_WORK"), false);
});

test("governed execution requires dispatch, progress, and result controls", () => {
  assert.throws(() => validateConnectorCapabilities({
    data: ["EVIDENCE_REFERENCES"],
    control: ["DISPATCH_WORK", "OBSERVE_PROGRESS"],
  }), /CONNECTOR_GOVERNED_RESULT_CAPABILITY_REQUIRED/);

  assert.throws(() => validateConnectorCapabilities({
    data: ["EVIDENCE_REFERENCES"],
    control: ["PAUSE_WORK"],
  }), /CONNECTOR_PAUSE_RESUME_MISMATCH/);
});

test("legacy v1 operations map to an equivalent governed capability declaration", () => {
  assert.deepEqual(capabilitiesFromLegacyOperations([
    "SUBMIT", "PROGRESS", "PAUSE", "RESUME", "CANCEL", "EVIDENCE", "RESULT",
  ]), {
    data: ["EVIDENCE_REFERENCES", "RESULT_REFERENCES"],
    control: [
      "DISPATCH_WORK",
      "OBSERVE_PROGRESS",
      "PAUSE_WORK",
      "RESUME_WORK",
      "CANCEL_WORK",
      "RECORD_RESULT",
    ],
  });
});

