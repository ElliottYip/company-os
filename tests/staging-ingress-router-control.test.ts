import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createStagingIngressRouterControl } from "../scripts/staging-ingress-router-control.ts";

const image = (name: string, value: string) => `ghcr.io/example/${name}@sha256:${value.repeat(64)}`;
function runtime() { return { schemaVersion: 1, product: "company-os", environment: "STAGING",
  operationId: "upgrade-rc4-to-rc5", siteId: "company-os-hong-kong",
  active: { releaseId: `0.1.0-rc.4-${"a".repeat(12)}`, composeProject: "company-os-active",
    productNetwork: "company-os-active", ports: { api: 4601, web: 4600, referenceDataNode: 4322 } },
  candidate: { releaseId: `0.1.0-rc.5-${"b".repeat(12)}`, composeProject: "company-os-candidate",
    productNetwork: "company-os-candidate", ports: { api: 14601, web: 14600, referenceDataNode: 14322 },
    serviceIds: { api: "api-candidate", web: "web-candidate", secretBroker: "broker-candidate",
      agentNode: "agent-candidate", dataNode: "data-candidate" }, parallelDatabaseReference: "database:candidate",
    secretProjectionReference: "secret:candidate", ingressRouteReference: "route:active",
    resourceBudget: { maximumMemoryBytes: 2_684_354_560, maximumCpu: 2.5, maximumPids: 640,
      requiredHostHeadroomBytes: 1_073_741_824 }, images: { api: image("api", "1"), web: image("web", "2"),
      ops: image("ops", "3"), codexAgentNode: image("agent", "4"), vaultSecretBroker: image("broker", "5"),
      referenceDataNode: image("data", "6") } } } as const; }
function route() { return { schemaVersion: 1, product: "company-os", environment: "STAGING",
  siteId: "company-os-hong-kong", routeReference: "route:active",
  observation: { sampleCount: 5, intervalMilliseconds: 1_000,
    maximumP95Milliseconds: 500, maximumFailures: 0 },
  router: { image: image("caddy", "7"), composeProject: "company-os-router",
    containerId: "company-os-router", network: "company-os-router",
    stablePorts: { web: 4700, api: 4701 }, internalPorts: { web: 8080, api: 8081, admin: 2019 },
    hostGatewayAlias: "host.docker.internal", resourceBudget: { maximumMemoryBytes: 67_108_864,
      maximumCpu: 0.1, maximumPids: 32 } } } as const; }
function inspection(root: string) { return JSON.stringify([{ Config: { Image: route().router.image }, State: { Running: true },
  HostConfig: { ReadonlyRootfs: true, CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges:true"],
    ExtraHosts: ["host.docker.internal:host-gateway"], PortBindings: {
      "8080/tcp": [{ HostIp: "127.0.0.1", HostPort: "4700" }],
      "8081/tcp": [{ HostIp: "127.0.0.1", HostPort: "4701" }] } },
  NetworkSettings: { Networks: { "company-os-router": {} } },
  Mounts: [{ Type: "bind", Source: root, Destination: "/etc/company-os-route", RW: false }] }]); }

test("router control verifies the exact hardened container before validate and reload", async () => {
  const root = await mkdtemp(join(tmpdir(), "company-os-router-")); await chmod(root, 0o700);
  const generation = join(root, "generations", runtime().candidate.releaseId); await mkdir(generation, { recursive: true });
  const calls: readonly string[][] = []; const mutable = calls as string[][];
  const control = await createStagingIngressRouterControl({ routeDirectory: root,
    routeContract: route(), runtimeContract: runtime() }, { runCommand: async (argv) => {
      mutable.push([...argv]); return argv[1] === "inspect" ? { status: 0, stdout: inspection(root) } :
        { status: 0, stdout: "" }; } });
  await control.validateConfiguration(join(generation, "Caddyfile"));
  await control.reloadConfiguration(join(root, "current", "Caddyfile"));
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[1]?.slice(0, 5), ["docker", "exec", "company-os-router", "caddy", "validate"]);
  assert.match(calls[1]?.[6] ?? "", /\/etc\/company-os-route\/generations\//);
  assert.deepEqual(calls[3]?.slice(0, 5), ["docker", "exec", "company-os-router", "caddy", "reload"]);
});

test("router control rejects a writable or wrong-image container before mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "company-os-router-")); await chmod(root, 0o700);
  const bad = JSON.parse(inspection(root)); bad[0].HostConfig.ReadonlyRootfs = false;
  const control = await createStagingIngressRouterControl({ routeDirectory: root,
    routeContract: route(), runtimeContract: runtime() }, { runCommand: async () => ({ status: 0,
      stdout: JSON.stringify(bad) }) });
  await assert.rejects(control.validateConfiguration(join(root, "generation", "Caddyfile")),
    /STAGING_INGRESS_ROUTER_RUNTIME_INVALID/);
});
