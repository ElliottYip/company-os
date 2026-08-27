import assert from "node:assert/strict";
import test from "node:test";

import { parseStagingIngressRouteContract, renderStagingIngressRouteGeneration } from
  "../adapters/config/staging-ingress-route-contract.ts";
import { parseStagingUpgradeRuntimeContract } from
  "../adapters/config/staging-upgrade-runtime-contract.ts";

const image = (name: string, value: string) => `ghcr.io/example/${name}@sha256:${value.repeat(64)}`;
function runtimeValue() { return { schemaVersion: 1, product: "company-os", environment: "STAGING",
  operationId: "upgrade-rc4-to-rc5", siteId: "company-os-hong-kong",
  active: { releaseId: `0.1.0-rc.4-${"a".repeat(12)}`, composeProject: "company-os-hong-kong",
    productNetwork: "company-os-hong-kong-product",
    ports: { api: 4601, web: 4600, referenceDataNode: 4322 } },
  candidate: { releaseId: `0.1.0-rc.5-${"b".repeat(12)}`,
    composeProject: "company-os-hong-kong-candidate-rc5",
    productNetwork: "company-os-hong-kong-candidate-rc5",
    ports: { api: 14601, web: 14600, referenceDataNode: 14322 },
    serviceIds: { api: "api-candidate-rc5", web: "web-candidate-rc5",
      secretBroker: "broker-candidate-rc5", agentNode: "agent-candidate-rc5",
      dataNode: "data-candidate-rc5" }, parallelDatabaseReference: "database:upgrade-rc5-empty-target",
    secretProjectionReference: "secret-projection:upgrade-rc5",
    ingressRouteReference: "route:company-os-hong-kong-active",
    resourceBudget: { maximumMemoryBytes: 2_684_354_560, maximumCpu: 2.5,
      maximumPids: 640, requiredHostHeadroomBytes: 1_073_741_824 },
    images: { api: image("api", "1"), web: image("web", "2"), ops: image("ops", "3"),
      codexAgentNode: image("agent", "4"), vaultSecretBroker: image("broker", "5"),
      referenceDataNode: image("data", "6") } } } as const; }
function routeValue() { return { schemaVersion: 1, product: "company-os", environment: "STAGING",
  siteId: "company-os-hong-kong", routeReference: "route:company-os-hong-kong-active",
  router: { image: image("ingress-router", "7"), composeProject: "company-os-ingress-router",
    containerId: "company-os-ingress-router", network: "company-os-ingress-router",
    stablePorts: { web: 4700, api: 4701 }, internalPorts: { web: 8080, api: 8081, admin: 2019 },
    hostGatewayAlias: "host.docker.internal",
    resourceBudget: { maximumMemoryBytes: 67_108_864, maximumCpu: 0.1, maximumPids: 32 } } } as const; }

test("independent ingress router renders exact active and candidate upstream generations", () => {
  const runtime = parseStagingUpgradeRuntimeContract(runtimeValue());
  const contract = parseStagingIngressRouteContract(routeValue(), runtime);
  const active = renderStagingIngressRouteGeneration(contract, runtime, "active");
  const candidate = renderStagingIngressRouteGeneration(contract, runtime, "candidate");
  assert.match(active.caddyfile, /host\.docker\.internal:4600/);
  assert.match(active.caddyfile, /host\.docker\.internal:4601/);
  assert.match(candidate.caddyfile, /host\.docker\.internal:14600/);
  assert.match(candidate.caddyfile, /host\.docker\.internal:14601/);
  assert.doesNotMatch(candidate.caddyfile, /https?:\/\//);
  assert.notEqual(active.releaseId, candidate.releaseId);
});

test("ingress router rejects mutable images, topology collisions, port reuse and route drift", () => {
  const runtime = parseStagingUpgradeRuntimeContract(runtimeValue());
  for (const mutate of [
    (value: any) => { value.router.image = "caddy:latest"; },
    (value: any) => { value.router.network = runtime.candidate.productNetwork; },
    (value: any) => { value.router.stablePorts.api = runtime.active.ports.api; },
    (value: any) => { value.routeReference = "route:other"; },
    (value: any) => { value.router.hostGatewayAlias = "172.17.0.1"; },
  ]) { const value: any = structuredClone(routeValue()); mutate(value);
    assert.throws(() => parseStagingIngressRouteContract(value, runtime),
      /STAGING_INGRESS_ROUTE_CONTRACT_INVALID/); }
});
