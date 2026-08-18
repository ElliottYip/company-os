import assert from "node:assert/strict";
import test from "node:test";

import { parseConnectorEnvelope } from "../connector-sdk/connector-envelope.ts";

test("parseConnectorEnvelope accepts a provider-neutral connector request", () => {
  const result = parseConnectorEnvelope({
    connectorId: "fixture-reference",
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

test("task submit requires bounded provider-neutral references and timing", () => {
  const result = parseConnectorEnvelope({
    connectorId: "fixture-reference",
    protocolVersion: "1.0",
    requestId: "request-001",
    sentAt: "2026-08-18T08:00:00.000Z",
    type: "task.submit",
    idempotencyKey: "idempotency-one",
    timeoutAt: "2026-08-18T08:05:00.000Z",
    payload: {
      workId: "work-one",
      goalReference: "goal-one",
      permissionReferences: ["permission-one"],
      dataAuthorizationReferences: ["data-one"],
      idempotencyKey: "idempotency-one",
      timeoutAt: "2026-08-18T08:05:00.000Z",
    },
  });
  assert.equal(result.ok, true);
});

test("connector envelope rejects credentials, private sessions, reasoning and oversized payloads", () => {
  for (const payload of [
    { apiKey: "not-allowed" },
    { nested: { accessToken: "not-allowed" } },
    { providerSession: "not-allowed" },
    { privateReasoning: "not-allowed" },
    { value: "x".repeat(70_000) },
  ]) {
    const result = parseConnectorEnvelope({
      connectorId: "fixture-reference",
      protocolVersion: "1.0",
      requestId: "request-001",
      sentAt: "2026-08-18T08:00:00.000Z",
      type: "health.report",
      payload,
    });
    assert.equal(result.ok, false);
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
