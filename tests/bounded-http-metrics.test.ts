import assert from "node:assert/strict";
import test from "node:test";
import { BoundedHttpMetrics } from "../adapters/http/bounded-http-metrics.ts";

test("HTTP metrics use bounded operational labels and never retain request identifiers", () => {
  const metrics = new BoundedHttpMetrics();
  metrics.begin("GET", "/api/v1/companies/company-secret/work/work-secret", 100)(200, 112);
  metrics.begin("DELETE", "/api/v1/companies/another-company", 200)(404, 5_500);
  metrics.begin("GET", "/health", 300)(200, 301);
  const output = metrics.render();
  assert.match(output, /route="formal_api",method="GET",status_class="2xx"} 1/);
  assert.match(output, /route="formal_api",method="OTHER",status_class="4xx"} 1/);
  assert.match(output, /route="health",method="GET",status_class="2xx"} 1/);
  assert.match(output, /company_os_http_request_duration_milliseconds_count 3/);
  assert.doesNotMatch(output, /company-secret|work-secret|another-company/);
  assert.doesNotMatch(output, /\/api\/v1\//);
});

test("HTTP metrics finish callbacks are idempotent", () => {
  const metrics = new BoundedHttpMetrics();
  const finish = metrics.begin("POST", "/api/v1/work", 0);
  finish(201, 10);
  finish(500, 20);
  const output = metrics.render();
  assert.match(output, /status_class="2xx"} 1/);
  assert.doesNotMatch(output, /status_class="5xx"/);
  assert.match(output, /company_os_http_requests_in_flight 0/);
});

test("dependency gauges accept only fixed operational categories and states", () => {
  const metrics = new BoundedHttpMetrics();
  metrics.setDependencyHealth({
    database: { status: "pass" }, connectorRuntime: { status: "degraded" },
    dataRuntime: { status: "fail" },
    customerChosenName: { status: "fail" },
  });
  const output = metrics.render();
  assert.match(output, /company_os_dependency_health\{dependency="database",status="pass"\} 1/);
  assert.match(output, /company_os_dependency_health\{dependency="connector",status="degraded"\} 1/);
  assert.match(output, /company_os_dependency_health\{dependency="data_node",status="fail"\} 1/);
  assert.doesNotMatch(output, /customerChosenName/);
});

test("execution metrics expose only bounded delivery and revocation outcomes", () => {
  const metrics = new BoundedHttpMetrics();
  metrics.recordConnectorDeliveries([
    { status: "DELIVERED", publicationId: "customer-work-secret" },
    { status: "RETRY_PENDING", code: "provider-private-secret" },
  ]);
  metrics.recordSecretLeaseRevocations([
    { status: "REVOKED", leaseId: "customer-lease-secret" },
    { status: "RETRY_PENDING", code: "vault-private-secret" },
  ]);
  const output = metrics.render();
  assert.match(output, /company_os_connector_command_outcomes_total\{status="delivered"\} 1/);
  assert.match(output, /company_os_connector_command_outcomes_total\{status="retry_pending"\} 1/);
  assert.match(output, /company_os_secret_lease_revocation_outcomes_total\{status="revoked"\} 1/);
  assert.match(output, /company_os_secret_lease_revocation_outcomes_total\{status="retry_pending"\} 1/);
  assert.doesNotMatch(output, /customer-work-secret|provider-private-secret|customer-lease-secret|vault-private-secret/);
});
