import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

import type { StagingUpgradeRuntimeContract } from "./staging-upgrade-runtime-contract.ts";

const PORTABLE = /^[a-z0-9][a-z0-9-]{2,95}$/;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,255}$/;
const IMAGE = /^[a-z0-9][a-z0-9./_-]*@sha256:[a-f0-9]{64}$/;

export interface StagingIngressRouteContract {
  readonly schemaVersion: 1;
  readonly product: "company-os";
  readonly environment: "STAGING";
  readonly siteId: string;
  readonly routeReference: string;
  readonly observation: {
    readonly sampleCount: number;
    readonly intervalMilliseconds: number;
    readonly maximumP95Milliseconds: number;
    readonly maximumFailures: number;
  };
  readonly router: {
    readonly image: string;
    readonly composeProject: string;
    readonly containerId: string;
    readonly network: string;
    readonly stablePorts: { readonly web: number; readonly api: number };
    readonly internalPorts: { readonly web: number; readonly api: number; readonly admin: number };
    readonly hostGatewayAlias: "host.docker.internal";
    readonly resourceBudget: {
      readonly maximumMemoryBytes: number;
      readonly maximumCpu: number;
      readonly maximumPids: number;
    };
  };
}

export function parseStagingIngressRouteContract(value: unknown,
  runtime: StagingUpgradeRuntimeContract): StagingIngressRouteContract {
  const root = exact(value, ["schemaVersion", "product", "environment", "siteId",
    "routeReference", "observation", "router"]);
  if (root.schemaVersion !== 1 || root.product !== "company-os" || root.environment !== "STAGING" ||
      root.siteId !== runtime.siteId || !text(root.siteId, PORTABLE) ||
      root.routeReference !== runtime.candidate.ingressRouteReference ||
      !text(root.routeReference, REFERENCE)) invalid();
  const observation = exact(root.observation, ["sampleCount", "intervalMilliseconds",
    "maximumP95Milliseconds", "maximumFailures"]);
  if (!integer(observation.sampleCount, 3, 120) ||
      !integer(observation.intervalMilliseconds, 0, 60_000) ||
      !integer(observation.maximumP95Milliseconds, 1, 30_000) ||
      !integer(observation.maximumFailures, 0, Number(observation.sampleCount) * 2 - 1)) invalid();
  const router = exact(root.router, ["image", "composeProject", "containerId", "network",
    "stablePorts", "internalPorts", "hostGatewayAlias", "resourceBudget"]);
  if (!text(router.image, IMAGE) || !text(router.composeProject, PORTABLE) ||
      !text(router.containerId, PORTABLE) || !text(router.network, PORTABLE) ||
      router.hostGatewayAlias !== "host.docker.internal" ||
      [runtime.active.composeProject, runtime.candidate.composeProject].includes(router.composeProject) ||
      [runtime.active.productNetwork, runtime.candidate.productNetwork].includes(router.network)) invalid();
  const stablePorts = ports(router.stablePorts, ["web", "api"]);
  const internalPorts = ports(router.internalPorts, ["web", "api", "admin"]);
  const allPorts = [...Object.values(stablePorts), ...Object.values(internalPorts),
    ...Object.values(runtime.active.ports), ...Object.values(runtime.candidate.ports)];
  if (new Set(allPorts).size !== allPorts.length) invalid();
  const budget = exact(router.resourceBudget, ["maximumMemoryBytes", "maximumCpu", "maximumPids"]);
  if (!integer(budget.maximumMemoryBytes, 33_554_432, 536_870_912) ||
      typeof budget.maximumCpu !== "number" || !Number.isFinite(budget.maximumCpu) ||
      budget.maximumCpu < 0.05 || budget.maximumCpu > 1 ||
      !integer(budget.maximumPids, 16, 256)) invalid();
  return structuredClone(root) as unknown as StagingIngressRouteContract;
}

export function renderStagingIngressRouteGeneration(contract: StagingIngressRouteContract,
  runtime: StagingUpgradeRuntimeContract, target: "active" | "candidate") {
  const parsed = parseStagingIngressRouteContract(contract, runtime);
  const selected = runtime[target];
  const host = parsed.router.hostGatewayAlias;
  const web = parsed.router.internalPorts.web;
  const api = parsed.router.internalPorts.api;
  const admin = parsed.router.internalPorts.admin;
  return {
    releaseId: selected.releaseId,
    caddyfile: `{\n\tadmin 127.0.0.1:${admin}\n\tauto_https off\n}\n\n` +
      `:${web} {\n\treverse_proxy ${host}:${selected.ports.web}\n}\n\n` +
      `:${api} {\n\treverse_proxy ${host}:${selected.ports.api}\n}\n`,
  } as const;
}

export function renderStagingIngressRouterEnvironment(contract: StagingIngressRouteContract,
  runtime: StagingUpgradeRuntimeContract, routeDirectoryValue: string) {
  const parsed = parseStagingIngressRouteContract(contract, runtime);
  if (!isAbsolute(routeDirectoryValue)) invalid();
  const routeDirectory = resolve(routeDirectoryValue);
  if (routeDirectory === "/" || routeDirectory === resolve(homedir())) invalid();
  const values = {
    COMPANY_OS_INGRESS_ROUTER_IMAGE: parsed.router.image,
    COMPANY_OS_INGRESS_ROUTER_PROJECT: parsed.router.composeProject,
    COMPANY_OS_INGRESS_ROUTER_CONTAINER: parsed.router.containerId,
    COMPANY_OS_INGRESS_ROUTER_NETWORK: parsed.router.network,
    COMPANY_OS_INGRESS_ROUTER_ROUTE_DIRECTORY: routeDirectory,
    COMPANY_OS_INGRESS_ROUTER_WEB_PORT: String(parsed.router.stablePorts.web),
    COMPANY_OS_INGRESS_ROUTER_API_PORT: String(parsed.router.stablePorts.api),
    COMPANY_OS_INGRESS_ROUTER_MEMORY_BYTES: String(parsed.router.resourceBudget.maximumMemoryBytes),
    COMPANY_OS_INGRESS_ROUTER_CPU: String(parsed.router.resourceBudget.maximumCpu),
    COMPANY_OS_INGRESS_ROUTER_PIDS: String(parsed.router.resourceBudget.maximumPids),
  };
  return `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`;
}

function ports(value: unknown, keys: readonly string[]) {
  const record = exact(value, keys);
  if (!Object.values(record).every((item) => integer(item, 1024, 65535)) ||
      new Set(Object.values(record)).size !== keys.length) invalid();
  return record as Record<string, number>;
}
function exact(value: unknown, keys: readonly string[]): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || Object.keys(record).some((key) => !keys.includes(key))) invalid();
  return record;
}
function text(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.test(value);
}
function integer(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}
function invalid(): never { throw new Error("STAGING_INGRESS_ROUTE_CONTRACT_INVALID"); }
