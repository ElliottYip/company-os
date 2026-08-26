import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { executionPlaneOpenApi, synchronizeExecutionPlaneOpenApi } from
  "../scripts/generate-execution-plane-openapi.mjs";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const expectedRoutes = {
  agentNode: [
    "/v1/health", "/v1/deployments", "/v1/work",
    "/v1/work/{workId}/observations", "/v1/work/{workId}/commands",
  ],
  dataNode: ["/v1/health", "/v1/data-access"],
  secretBroker: [
    "/v1/health", "/v1/companies/{companyId}/references/{referenceId}", "/v1/leases",
    "/v1/companies/{companyId}/leases/{leaseId}/revocations", "/v1/reference-management-sessions",
    "/v1/companies/{companyId}/reference-management-sessions/{sessionId}",
  ],
} as const;

test("execution-plane packages ship current OpenAPI 3.1 contracts", async () => {
  await synchronizeExecutionPlaneOpenApi("check");
  for (const [name, specification] of Object.entries(executionPlaneOpenApi)) {
    assert.equal(specification.openapi, "3.1.0", name);
    assert.equal(specification.info.version, "1.0.0", name);
    assert.deepEqual(Object.keys(specification.paths), [...expectedRoutes[name as keyof typeof expectedRoutes]], name);
    assert.deepEqual(specification.security, [{ bearerAuth: [] }], name);
    const operationIds = Object.values(specification.paths).flatMap((path) =>
      Object.values(path).map((operation) => operation.operationId));
    assert.equal(new Set(operationIds).size, operationIds.length, `${name} operation IDs must be unique`);
    for (const path of Object.values(specification.paths)) {
      for (const operation of Object.values(path)) {
        assert.ok(operation.parameters.some((parameter) => parameter.$ref === "#/components/parameters/ProtocolVersion"));
        assert.ok(operation.responses["401"] && operation.responses["429"] && operation.responses["500"]);
      }
    }
  }
});

test("OpenAPI route inventory matches every maintained execution-plane client route", async () => {
  const [agent, data, broker] = await Promise.all([
    read("connectors/http-agent-node/index.mjs"),
    read("connectors/http-data-node/index.mjs"),
    read("brokers/http-secret-broker/index.mjs"),
  ]);
  const routes = (source: string, replacements: Readonly<Record<string, string>>) => {
    const found = [...source.matchAll(/(?:["'`])(\/v1\/[^"'`]*)(?:["'`])/g)].map((match) => match[1]);
    return [...new Set(found.map((route) => Object.entries(replacements)
      .reduce((normalized, [template, parameter]) => normalized.replaceAll(template, parameter), route)))];
  };
  assert.deepEqual(routes(agent, { "${encodeURIComponent(id)}": "{workId}" }), [...expectedRoutes.agentNode]);
  assert.deepEqual(routes(data, {}), [...expectedRoutes.dataNode]);
  assert.deepEqual(routes(broker, {
    "${encodeURIComponent(company)}": "{companyId}",
    "${encodeURIComponent(referenceKey)}": "{referenceId}",
    "${encodeURIComponent(lease)}": "{leaseId}",
    "${encodeURIComponent(session)}": "{sessionId}",
  }), [...expectedRoutes.secretBroker]);
});

test("execution-plane OpenAPI never defines credential material fields", () => {
  const forbidden = /"(?:password|secretValue|credentialValue|accessToken|refreshToken|privateKey|externalSession|privateReasoning|chainOfThought)"\s*:/i;
  for (const [name, specification] of Object.entries(executionPlaneOpenApi)) {
    assert.doesNotMatch(JSON.stringify(specification), forbidden, name);
  }
});
