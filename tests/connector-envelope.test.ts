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

test("task submit accepts one secret-free model binding tied to an execution grant", () => {
  const result = parseConnectorEnvelope({
    connectorId: "fixture-reference",
    protocolVersion: "1.0",
    requestId: "request-model-001",
    sentAt: "2026-08-18T08:00:00.000Z",
    type: "task.submit",
    idempotencyKey: "idempotency-model-one",
    timeoutAt: "2026-08-18T08:05:00.000Z",
    payload: {
      workId: "work-model-one",
      goalReference: "goal-model-one",
      permissionReferences: ["permission-one"],
      dataAuthorizationReferences: ["data-one"],
      governedDataReferences: ["customer-data-one"],
      dataEvidenceReferences: ["evidence-one"],
      executionGrantReferences: ["model-grant-one"],
      modelBinding: {
        policyId: "policy-one",
        routeId: "route-one",
        providerAdapterId: "provider-one",
        modelReference: "model-one",
        classification: "CONFIDENTIAL",
        residency: "LOCAL",
        executionGrantReference: "model-grant-one",
      },
      idempotencyKey: "idempotency-model-one",
      timeoutAt: "2026-08-18T08:05:00.000Z",
    },
  });
  assert.equal(result.ok, true);
});

test("task submit rejects malformed or unbound model execution grants", () => {
  const base = {
    connectorId: "fixture-reference",
    protocolVersion: "1.0",
    requestId: "request-model-001",
    sentAt: "2026-08-18T08:00:00.000Z",
    type: "task.submit",
    idempotencyKey: "idempotency-model-one",
    timeoutAt: "2026-08-18T08:05:00.000Z",
  } as const;
  const payload = {
    workId: "work-model-one",
    goalReference: "goal-model-one",
    permissionReferences: ["permission-one"],
    dataAuthorizationReferences: ["data-one"],
    executionGrantReferences: ["different-grant"],
    modelBinding: {
      policyId: "policy-one",
      routeId: "route-one",
      providerAdapterId: "provider-one",
      modelReference: "model-one",
      classification: "CONFIDENTIAL",
      residency: "LOCAL",
      executionGrantReference: "model-grant-one",
    },
    idempotencyKey: "idempotency-model-one",
    timeoutAt: "2026-08-18T08:05:00.000Z",
  };

  assert.equal(parseConnectorEnvelope({ ...base, payload }).ok, false);
  assert.equal(parseConnectorEnvelope({
    ...base,
    payload: { ...payload, executionGrantReferences: ["model-grant-one"],
      modelBinding: { ...payload.modelBinding, residency: "GLOBAL" } },
  }).ok, false);
  assert.equal(parseConnectorEnvelope({
    ...base,
    payload: { ...payload, executionGrantReferences: ["model-grant-one"],
      modelBinding: { ...payload.modelBinding, providerCredentialReference: "must-not-cross" } },
  }).ok, false);
});

test("approval pause carries one exact high-risk action instead of a free-form status", () => {
  const result = parseConnectorEnvelope({
    connectorId: "connector-one", protocolVersion: "1.0", requestId: "request-one",
    sentAt: "2026-08-24T10:00:00.000Z", type: "task.pause", payload: {
      workId: "work-one", approvalRequestId: "approval-one",
      action: { id: "publish-report", type: "publish", description: "Publish report",
        inputDigest: `sha256:${"a".repeat(64)}`, risk: "HIGH" },
      evidenceReferences: ["evidence-one"], resultReference: null,
      expiresAt: "2026-08-24T10:30:00.000Z",
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
