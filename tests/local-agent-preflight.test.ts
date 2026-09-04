import assert from "node:assert/strict";
import test from "node:test";
import { runLocalAgentPreflight } from "../scripts/local-agent-preflight.mjs";

const baseEnvironment = {
  COMPANY_OS_CONNECTOR_PACKAGES: "@company-os/http-agent-node-connector",
  COMPANY_OS_CODEX_BINARY: "/usr/local/bin/codex",
  COMPANY_OS_HTTP_AGENT_NODE_BASE_URL: "https://agent.example.test",
  COMPANY_OS_HTTP_AGENT_NODE_BEARER_TOKEN_FILE: "/run/secrets/agent-node-token",
};

test("local Agent preflight returns a bounded READY record without credential material", async () => {
  const record = await runLocalAgentPreflight({
    environment: baseEnvironment,
    runVersion: async () => "codex-cli 1.2.3",
    createConnector: () => ({
      async capabilities() { return { connectorId: "http-agent-node", displayName: "Codex node", protocolVersion: "1.0" }; },
      async health() { return "HEALTHY"; },
    }),
    now: () => "2026-09-04T08:00:00.000Z",
  });
  assert.equal(record.status, "READY");
  assert.equal(record.runtime?.health, "HEALTHY");
  assert.equal(record.checks.length, 4);
  const serialized = JSON.stringify(record);
  assert.doesNotMatch(serialized, /agent-node-token|opaque-value/);
  assert.match(serialized, /HTTP_AGENT_AUTHENTICATION_FILE/);
});

test("local Agent preflight reports every actionable blocker and redacts arbitrary errors", async () => {
  const record = await runLocalAgentPreflight({
    environment: {
      COMPANY_OS_CONNECTOR_PACKAGES: "../unsafe-package",
      COMPANY_OS_CODEX_BINARY: "relative/codex",
    },
    runVersion: async () => { throw new Error("credential opaque-value"); },
    createConnector: () => { throw new Error("password opaque-value"); },
    now: () => "2026-09-04T08:00:00.000Z",
  });
  assert.equal(record.status, "BLOCKED");
  assert.deepEqual(record.checks.map(({ id, status }) => [id, status]), [
    ["connector-package", "BLOCKED"],
    ["authentication-source", "BLOCKED"],
    ["codex-cli", "BLOCKED"],
    ["agent-node", "BLOCKED"],
  ]);
  assert.doesNotMatch(JSON.stringify(record), /opaque-value|password|credential/i);
});

test("local Agent preflight keeps an unhealthy runtime blocked", async () => {
  const record = await runLocalAgentPreflight({
    environment: { ...baseEnvironment, COMPANY_OS_HTTP_AGENT_NODE_BEARER_TOKEN_FILE: undefined,
      COMPANY_OS_HTTP_AGENT_NODE_BEARER_TOKEN: "opaque-value" },
    runVersion: async () => "codex-cli 1.2.3",
    createConnector: () => ({
      async capabilities() { return { connectorId: "http-agent-node", displayName: "Codex node", protocolVersion: "1.0" }; },
      async health() { return "UNAVAILABLE"; },
    }),
    now: () => "2026-09-04T08:00:00.000Z",
  });
  assert.equal(record.status, "BLOCKED");
  assert.equal(record.checks.find(({ id }) => id === "agent-node")?.code, "HTTP_AGENT_NODE_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(record), /opaque-value/);
});
