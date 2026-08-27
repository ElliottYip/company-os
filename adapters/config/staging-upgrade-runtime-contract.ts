const RELEASE_ID = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?-[a-f0-9]{12}$/;
const PORTABLE = /^[a-z0-9][a-z0-9-]{2,95}$/;
const OPERATION_ID = /^upgrade-[a-z0-9][a-z0-9-]{2,87}$/;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,255}$/;
const IMAGE = /^[a-z0-9][a-z0-9./_-]*@sha256:[a-f0-9]{64}$/;
const IMAGE_KEYS = ["api", "web", "ops", "codexAgentNode", "vaultSecretBroker", "referenceDataNode"] as const;
const SERVICE_KEYS = ["api", "web", "secretBroker", "agentNode", "dataNode"] as const;

export interface StagingUpgradeRuntimeContract {
  readonly schemaVersion: 1;
  readonly product: "company-os";
  readonly environment: "STAGING";
  readonly operationId: string;
  readonly siteId: string;
  readonly active: RuntimeIdentity;
  readonly candidate: RuntimeIdentity & {
    readonly serviceIds: Readonly<Record<(typeof SERVICE_KEYS)[number], string>>;
    readonly parallelDatabaseReference: string;
    readonly secretProjectionReference: string;
    readonly ingressRouteReference: string;
    readonly resourceBudget: {
      readonly maximumMemoryBytes: number;
      readonly maximumCpu: number;
      readonly maximumPids: number;
      readonly requiredHostHeadroomBytes: number;
    };
    readonly images: Readonly<Record<(typeof IMAGE_KEYS)[number], string>>;
  };
}

interface RuntimeIdentity {
  readonly releaseId: string;
  readonly composeProject: string;
  readonly productNetwork: string;
  readonly ports: { readonly api: number; readonly web: number; readonly referenceDataNode: number };
}

export function parseStagingUpgradeRuntimeContract(value: unknown): StagingUpgradeRuntimeContract {
  const root = exact(value, ["schemaVersion", "product", "environment", "operationId", "siteId",
    "active", "candidate"]);
  if (root.schemaVersion !== 1 || root.product !== "company-os" || root.environment !== "STAGING" ||
      !text(root.operationId, OPERATION_ID) || !text(root.siteId, PORTABLE)) invalid();
  const active = runtime(root.active, []);
  const candidate = runtime(root.candidate, ["serviceIds", "parallelDatabaseReference",
    "secretProjectionReference", "ingressRouteReference", "resourceBudget", "images"]);
  if (active.releaseId === candidate.identity.releaseId ||
      active.composeProject === candidate.identity.composeProject ||
      active.productNetwork === candidate.identity.productNetwork) invalid();
  const allPorts = [...Object.values(active.ports), ...Object.values(candidate.identity.ports)];
  if (new Set(allPorts).size !== allPorts.length) invalid();
  const serviceIds = exact(candidate.extra.serviceIds, SERVICE_KEYS);
  if (!SERVICE_KEYS.every((key) => text(serviceIds[key], PORTABLE)) ||
      new Set(Object.values(serviceIds)).size !== SERVICE_KEYS.length) invalid();
  for (const key of ["parallelDatabaseReference", "secretProjectionReference", "ingressRouteReference"] as const) {
    if (!text(candidate.extra[key], REFERENCE)) invalid();
  }
  const resourceBudget = exact(candidate.extra.resourceBudget,
    ["maximumMemoryBytes", "maximumCpu", "maximumPids", "requiredHostHeadroomBytes"]);
  if (!safeInteger(resourceBudget.maximumMemoryBytes, 64 * 1024 * 1024, 68_719_476_736) ||
      typeof resourceBudget.maximumCpu !== "number" || !Number.isFinite(resourceBudget.maximumCpu) ||
      resourceBudget.maximumCpu < 0.1 || resourceBudget.maximumCpu > 64 ||
      !safeInteger(resourceBudget.maximumPids, 16, 100_000) ||
      !safeInteger(resourceBudget.requiredHostHeadroomBytes, 256 * 1024 * 1024, 68_719_476_736) ||
      Number(resourceBudget.maximumMemoryBytes) + Number(resourceBudget.requiredHostHeadroomBytes) >
        Number.MAX_SAFE_INTEGER) invalid();
  const images = exact(candidate.extra.images, IMAGE_KEYS);
  if (!IMAGE_KEYS.every((key) => text(images[key], IMAGE))) invalid();
  assertCoordinateFree(root);
  return structuredClone(root) as unknown as StagingUpgradeRuntimeContract;
}

function runtime(value: unknown, extras: readonly string[]) {
  const record = exact(value, ["releaseId", "composeProject", "productNetwork", "ports", ...extras]);
  if (!text(record.releaseId, RELEASE_ID) || !text(record.composeProject, PORTABLE) ||
      !text(record.productNetwork, PORTABLE)) invalid();
  const ports = exact(record.ports, ["api", "web", "referenceDataNode"]);
  if (!Object.values(ports).every((port) => safeInteger(port, 1024, 65535)) ||
      new Set(Object.values(ports)).size !== 3) invalid();
  return { releaseId: String(record.releaseId), composeProject: String(record.composeProject),
    productNetwork: String(record.productNetwork), ports: ports as Record<string, number>,
    identity: { releaseId: String(record.releaseId), composeProject: String(record.composeProject),
      productNetwork: String(record.productNetwork), ports },
    extra: Object.fromEntries(extras.map((key) => [key, record[key]])) as Record<string, any> };
}

function exact(value: unknown, keys: readonly string[]): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const record = value as Record<string, unknown>; const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) invalid();
  return record;
}

function assertCoordinateFree(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const child of Object.values(value)) {
    if (typeof child === "string" && (child.includes("://") || child.includes("@") && !IMAGE.test(child))) invalid();
    assertCoordinateFree(child);
  }
}

function text(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.test(value);
}
function safeInteger(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}
function invalid(): never { throw new Error("STAGING_UPGRADE_RUNTIME_CONTRACT_INVALID"); }
