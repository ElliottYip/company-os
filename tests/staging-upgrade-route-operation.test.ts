import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, readlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createStagingUpgradeRouteOperation } from "../scripts/staging-upgrade-route-operation.ts";

const release = (version: string, hash: string) => `${version}-${hash.repeat(12)}`;
const image = (name: string, value: string) => `ghcr.io/example/${name}@sha256:${value.repeat(64)}`;
function runtime() { return { schemaVersion: 1, product: "company-os", environment: "STAGING",
  operationId: "upgrade-rc4-to-rc5", siteId: "company-os-hong-kong",
  active: { releaseId: release("0.1.0-rc.4", "a"), composeProject: "company-os-hong-kong",
    productNetwork: "company-os-hong-kong-product", ports: { api: 4601, web: 4600, referenceDataNode: 4322 } },
  candidate: { releaseId: release("0.1.0-rc.5", "b"), composeProject: "company-os-candidate-rc5",
    productNetwork: "company-os-candidate-rc5", ports: { api: 14601, web: 14600, referenceDataNode: 14322 },
    serviceIds: { api: "api-candidate-rc5", web: "web-candidate-rc5", secretBroker: "broker-candidate-rc5",
      agentNode: "agent-candidate-rc5", dataNode: "data-candidate-rc5" },
    parallelDatabaseReference: "database:upgrade-rc5", secretProjectionReference: "secret:upgrade-rc5",
    ingressRouteReference: "route:company-os-hong-kong-active",
    resourceBudget: { maximumMemoryBytes: 2_684_354_560, maximumCpu: 2.5, maximumPids: 640,
      requiredHostHeadroomBytes: 1_073_741_824 }, images: { api: image("api", "1"), web: image("web", "2"),
      ops: image("ops", "3"), codexAgentNode: image("agent", "4"), vaultSecretBroker: image("broker", "5"),
      referenceDataNode: image("data", "6") } } } as const; }
function route() { return { schemaVersion: 1, product: "company-os", environment: "STAGING",
  siteId: "company-os-hong-kong", routeReference: "route:company-os-hong-kong-active",
  observation: { sampleCount: 5, intervalMilliseconds: 1_000,
    maximumP95Milliseconds: 500, maximumFailures: 0 },
  router: { image: image("router", "7"), composeProject: "company-os-ingress-router",
    containerId: "company-os-ingress-router", network: "company-os-ingress-router",
    stablePorts: { web: 4700, api: 4701 }, internalPorts: { web: 8080, api: 8081, admin: 2019 },
    hostGatewayAlias: "host.docker.internal", resourceBudget: { maximumMemoryBytes: 67_108_864,
      maximumCpu: 0.1, maximumPids: 32 } } } as const; }

test("route operation validates, atomically selects and verifies both stable release identities", async () => {
  const root = await mkdtemp(join(tmpdir(), "company-os-route-")); await chmod(root, 0o700);
  const candidate = join(root, "candidate"); const routes = join(root, "routes");
  await mkdir(candidate, { mode: 0o700 }); await mkdir(routes, { mode: 0o700 });
  const calls: string[] = []; const expected = runtime().candidate.releaseId;
  const operation = await createStagingUpgradeRouteOperation({ candidateDirectory: candidate,
    routeDirectory: routes, operationId: "upgrade-rc4-to-rc5", siteId: runtime().siteId,
    candidateReleaseId: expected, runtimeContract: runtime(), routeContract: route() }, {
    validateConfiguration: async (path) => { calls.push(`validate:${path}`); },
    reloadConfiguration: async (path) => { calls.push(`reload:${path}`); },
    fetch: async (_url) => new Response("ok", { status: 200,
      headers: { "x-company-os-release-id": expected } }),
    now: () => "2026-08-27T00:00:00.000Z",
  });
  const result = await operation();
  assert.match(result.evidenceDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(await readlink(join(routes, "current")), join("generations", expected));
  assert.match(await readFile(join(routes, "current", "Caddyfile"), "utf8"), /14600/);
  assert.equal(calls.length, 2); assert.match(calls[0] ?? "", /^validate:/);
  assert.match(calls[1] ?? "", /reload:.*current\/Caddyfile$/);
  const evidence = JSON.parse(await readFile(join(candidate, "step-evidence", "route-traffic.json"), "utf8"));
  assert.equal(evidence.previousReleaseId, null); assert.equal(evidence.verifiedStableEndpointCount, 2);
});

test("route operation stops when either stable endpoint does not prove candidate release", async () => {
  const root = await mkdtemp(join(tmpdir(), "company-os-route-")); await chmod(root, 0o700);
  const candidate = join(root, "candidate"); const routes = join(root, "routes");
  await mkdir(candidate, { mode: 0o700 }); await mkdir(routes, { mode: 0o700 });
  let probes = 0; const operation = await createStagingUpgradeRouteOperation({ candidateDirectory: candidate,
    routeDirectory: routes, operationId: "upgrade-rc4-to-rc5", siteId: runtime().siteId,
    candidateReleaseId: runtime().candidate.releaseId, runtimeContract: runtime(), routeContract: route() }, {
    validateConfiguration: async () => {}, reloadConfiguration: async () => {},
    fetch: async () => { probes += 1; return new Response("ok", { status: 200,
      headers: { "x-company-os-release-id": probes === 1 ? runtime().candidate.releaseId : runtime().active.releaseId } }); },
  });
  await assert.rejects(operation(), /STAGING_UPGRADE_ROUTE_RELEASE_ID_MISMATCH/);
  await assert.rejects(readFile(join(candidate, "step-evidence", "route-traffic.json")), /ENOENT/);
});
