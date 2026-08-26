import assert from "node:assert/strict";
import test from "node:test";

import { getOperationalReadiness } from "../adapters/http/operational-readiness.ts";

test("readiness probes every installed execution-plane boundary", async () => {
  const readiness = await getOperationalReadiness({
    formalRequired: true,
    formalConfigured: true,
    database: { async ping() {}, async checkSchema() {} },
    connectors: [{ async health() { return "HEALTHY" as const; } }],
    modelProviders: [{ async health() { return "HEALTHY" as const; } }],
    secretBroker: { async health() { return "HEALTHY" as const; } },
    dataConnectors: [{ async health() { return "HEALTHY" as const; } }],
  });
  assert.equal(readiness.status, "ready");
  assert.deepEqual(readiness.checks, {
    configuration: { status: "pass", code: "FORMAL_CONFIGURATION_READY" },
    connectorRuntime: { status: "pass", code: "CONNECTOR_RUNTIME_HEALTHY" },
    modelRuntime: { status: "pass", code: "MODEL_RUNTIME_HEALTHY" },
    secretBroker: { status: "pass", code: "SECRET_BROKER_HEALTHY" },
    dataRuntime: { status: "pass", code: "DATA_RUNTIME_HEALTHY" },
    database: { status: "pass", code: "DATABASE_READY" },
  });
});

test("optional unavailable runtimes are visible as degraded instead of installed-as-healthy", async () => {
  const readiness = await getOperationalReadiness({
    formalRequired: true,
    formalConfigured: true,
    database: { async ping() {}, async checkSchema() {} },
    connectors: [{ async health() { return "UNAVAILABLE" as const; } }],
    modelProviders: [{ async health() { throw new Error("private provider failure"); } }],
    secretBroker: { async health() { return "UNAVAILABLE" as const; } },
    dataConnectors: [{ async health() { return "DEGRADED" as const; } }],
  });
  assert.equal(readiness.status, "ready");
  assert.deepEqual(readiness.checks.connectorRuntime,
    { status: "degraded", code: "CONNECTOR_RUNTIME_UNAVAILABLE" });
  assert.deepEqual(readiness.checks.modelRuntime,
    { status: "degraded", code: "MODEL_RUNTIME_UNAVAILABLE" });
  assert.deepEqual(readiness.checks.secretBroker,
    { status: "degraded", code: "SECRET_BROKER_UNAVAILABLE" });
  assert.deepEqual(readiness.checks.dataRuntime,
    { status: "degraded", code: "DATA_RUNTIME_DEGRADED" });
  assert.doesNotMatch(JSON.stringify(readiness), /private provider failure/);
});

test("required database or formal configuration failure keeps public traffic out", async () => {
  const readiness = await getOperationalReadiness({
    formalRequired: true,
    formalConfigured: false,
    database: { async ping() { throw new Error("private database failure"); }, async checkSchema() {} },
    connectors: [], modelProviders: [], secretBroker: null, dataConnectors: [],
  });
  assert.equal(readiness.status, "not_ready");
  assert.deepEqual(readiness.checks.configuration,
    { status: "fail", code: "FORMAL_CONFIGURATION_REQUIRED" });
  assert.deepEqual(readiness.checks.database,
    { status: "fail", code: "DATABASE_OR_SCHEMA_UNAVAILABLE" });
  assert.doesNotMatch(JSON.stringify(readiness), /private database failure/);
});
