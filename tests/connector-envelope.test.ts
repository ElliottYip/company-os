import assert from "node:assert/strict";
import test from "node:test";

import { parseConnectorEnvelope } from "../connector-sdk/connector-envelope.ts";

test("parseConnectorEnvelope accepts a provider-neutral connector request", () => {
  const result = parseConnectorEnvelope({
    connectorId: "fixture-codex",
    protocolVersion: "1.0",
    requestId: "request-001",
    sentAt: "2026-08-18T08:00:00.000Z",
    type: "capabilities.describe",
    payload: {},
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.type, "capabilities.describe");
  }
});

test("parseConnectorEnvelope rejects provider-specific or incomplete input", () => {
  const result = parseConnectorEnvelope({
    connectorId: "",
    protocolVersion: "1.0",
    type: "capabilities.describe",
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "INVALID_CONNECTOR_ENVELOPE",
      message: "Connector envelope is missing required string fields.",
    },
  });
});
