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
    "routeReference", "router"]);
  if (root.schemaVersion !== 1 || root.product !== "company-os" || root.environment !== "STAGING" ||
      root.siteId !== runtime.siteId || !text(root.siteId, PORTABLE) ||
      root.routeReference !== runtime.candidate.ingressRouteReference ||
      !text(root.routeReference, REFERENCE)) invalid();
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
