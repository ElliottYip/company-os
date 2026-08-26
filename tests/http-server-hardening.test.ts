import assert from "node:assert/strict";
import test from "node:test";
import { createCompanyOsHttpService } from "../adapters/http/company-os-http-service.ts";

test("HTTP server has bounded request, header, connection, and keep-alive lifetimes", () => {
  const server = createCompanyOsHttpService({
    runtime: {
      async snapshot() { return {} as never; },
      async assignTask() { return {} as never; },
      async advance() { return {} as never; },
      async decide() { return {} as never; },
      async reset() { return {} as never; },
    },
    deploymentProfile: "self-hosted",
  });
  try {
    assert.equal(server.requestTimeout, 15_000);
    assert.equal(server.headersTimeout, 10_000);
    assert.equal(server.keepAliveTimeout, 5_000);
    assert.equal(server.maxHeadersCount, 100);
    assert.equal(server.maxRequestsPerSocket, 100);
    assert.equal(server.maxConnections, 1_024);
  } finally {
    server.close();
  }
});
