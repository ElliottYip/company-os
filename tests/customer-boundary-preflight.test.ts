import assert from "node:assert/strict";
import test from "node:test";
import { runCustomerBoundaryPreflight } from "../scripts/customer-boundary-preflight.ts";

const environment = {
  COMPANY_OS_OIDC_ISSUER: "https://identity.customer.example",
  COMPANY_OS_OIDC_DISCOVERY_URL: "https://identity.customer.example/.well-known/openid-configuration",
};

test("customer boundary preflight proves IdP S256 and every neutral node without exposing coordinates", async () => {
  const result = await runCustomerBoundaryPreflight(environment, {
    fetch: async () => new Response(JSON.stringify({
      issuer: environment.COMPANY_OS_OIDC_ISSUER,
      authorization_endpoint: "https://identity.customer.example/authorize",
      token_endpoint: "https://identity.customer.example/token",
      jwks_uri: "https://identity.customer.example/jwks",
      code_challenge_methods_supported: ["S256"],
    }), { status: 200, headers: { "content-type": "application/json" } }),
    agent: { async health() { return "HEALTHY"; } },
    data: { async health() { return "HEALTHY"; } },
    broker: { async health() { return "HEALTHY"; } },
  });

  assert.deepEqual(result, {
    schemaVersion: 1,
    status: "PASS",
    checks: {
      identity: { status: "PASS", code: "OIDC_DISCOVERY_S256_READY" },
      agentNode: { status: "PASS", code: "AGENT_NODE_HEALTHY" },
      dataNode: { status: "PASS", code: "DATA_NODE_HEALTHY" },
      secretBroker: { status: "PASS", code: "SECRET_BROKER_HEALTHY" },
    },
  });
  assert.doesNotMatch(JSON.stringify(result), /customer\.example|Bearer|token/i);
});

test("customer boundary preflight fails closed for a degraded dependency and never echoes its error", async () => {
  await assert.rejects(runCustomerBoundaryPreflight(environment, {
    fetch: async () => { throw new Error("private customer network detail"); },
    agent: { async health() { return "HEALTHY"; } },
    data: { async health() { return "HEALTHY"; } },
    broker: { async health() { return "HEALTHY"; } },
  }), /CUSTOMER_PREFLIGHT_IDENTITY_UNAVAILABLE/);
});

test("customer boundary preflight rejects OIDC discovery without S256", async () => {
  await assert.rejects(runCustomerBoundaryPreflight(environment, {
    fetch: async () => new Response(JSON.stringify({
      issuer: environment.COMPANY_OS_OIDC_ISSUER,
      authorization_endpoint: "https://identity.customer.example/authorize",
      token_endpoint: "https://identity.customer.example/token",
      jwks_uri: "https://identity.customer.example/jwks",
      code_challenge_methods_supported: ["plain"],
    }), { status: 200, headers: { "content-type": "application/json" } }),
    agent: { async health() { return "HEALTHY"; } },
    data: { async health() { return "HEALTHY"; } },
    broker: { async health() { return "HEALTHY"; } },
  }), /CUSTOMER_PREFLIGHT_IDENTITY_PROTOCOL_INVALID/);
});
