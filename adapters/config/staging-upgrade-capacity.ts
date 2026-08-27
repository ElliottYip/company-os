import { parseSiteRuntimeManifest } from "./site-runtime-contract.ts";
import { parseStagingUpgradeRuntimeContract } from "./staging-upgrade-runtime-contract.ts";

const MINIMUM_HOST_PID_RESERVE = 128;

export interface StagingUpgradeHostCapacitySnapshot {
  readonly schemaVersion: 1;
  readonly capturedAt: string;
  readonly logicalCpuCount: number;
  readonly totalMemoryBytes: number;
  readonly availableMemoryBytes: number;
  readonly pidMaximum: number;
}

export interface StagingUpgradeCapacityAdmission {
  readonly schemaVersion: 1;
  readonly product: "company-os";
  readonly status: "READY_FOR_CANDIDATE_CREATION" | "NOT_READY";
  readonly operationId: string;
  readonly siteId: string;
  readonly capturedAt: string;
  readonly requirements: {
    readonly totalMemoryBytes: number;
    readonly availableMemoryBytes: number;
    readonly logicalCpuCount: number;
    readonly pidMaximum: number;
  };
  readonly observed: {
    readonly totalMemoryBytes: number;
    readonly availableMemoryBytes: number;
    readonly logicalCpuCount: number;
    readonly pidMaximum: number;
  };
  readonly findings: readonly { readonly code: string; readonly subject: string }[];
  readonly swapAdmitted: false;
  readonly runtimeObjectsCreated: false;
}

export function evaluateStagingUpgradeCapacity(
  runtimeContractValue: unknown,
  activeSiteManifestValue: unknown,
  snapshotValue: unknown,
): StagingUpgradeCapacityAdmission {
  const runtime = parseStagingUpgradeRuntimeContract(runtimeContractValue);
  const site = parseSiteRuntimeManifest(activeSiteManifestValue);
  const snapshot = parseSnapshot(snapshotValue);
  assertActiveBinding(runtime, site);

  const active = site.site.resourceBudget;
  const candidate = runtime.candidate.resourceBudget;
  const reserve = Math.max(active.requiredHeadroomBytes, candidate.requiredHostHeadroomBytes);
  const requirements = {
    totalMemoryBytes: active.maximumDeclaredMemoryBytes + candidate.maximumMemoryBytes + reserve,
    availableMemoryBytes: candidate.maximumMemoryBytes + reserve,
    logicalCpuCount: active.maximumCpu + candidate.maximumCpu,
    pidMaximum: active.maximumPids + candidate.maximumPids + MINIMUM_HOST_PID_RESERVE,
  };
  if (![requirements.totalMemoryBytes, requirements.availableMemoryBytes,
    requirements.pidMaximum].every(Number.isSafeInteger) || !Number.isFinite(requirements.logicalCpuCount)) {
    invalid();
  }

  const findings: Array<{ code: string; subject: string }> = [];
  if (snapshot.totalMemoryBytes < requirements.totalMemoryBytes) {
    findings.push({ code: "UPGRADE_TOTAL_MEMORY_INSUFFICIENT", subject: "host-memory" });
  }
  if (snapshot.availableMemoryBytes < requirements.availableMemoryBytes) {
    findings.push({ code: "UPGRADE_AVAILABLE_MEMORY_INSUFFICIENT", subject: "available-memory" });
  }
  if (snapshot.logicalCpuCount < requirements.logicalCpuCount) {
    findings.push({ code: "UPGRADE_CPU_CAPACITY_INSUFFICIENT", subject: "host-cpu" });
  }
  if (snapshot.pidMaximum < requirements.pidMaximum) {
    findings.push({ code: "UPGRADE_PID_CAPACITY_INSUFFICIENT", subject: "host-pids" });
  }
  return {
    schemaVersion: 1,
    product: "company-os",
    status: findings.length ? "NOT_READY" : "READY_FOR_CANDIDATE_CREATION",
    operationId: runtime.operationId,
    siteId: runtime.siteId,
    capturedAt: snapshot.capturedAt,
    requirements,
    observed: {
      totalMemoryBytes: snapshot.totalMemoryBytes,
      availableMemoryBytes: snapshot.availableMemoryBytes,
      logicalCpuCount: snapshot.logicalCpuCount,
      pidMaximum: snapshot.pidMaximum,
    },
    findings,
    swapAdmitted: false,
    runtimeObjectsCreated: false,
  };
}

function assertActiveBinding(runtime: ReturnType<typeof parseStagingUpgradeRuntimeContract>,
  site: ReturnType<typeof parseSiteRuntimeManifest>) {
  const active = runtime.active;
  if (runtime.siteId !== site.site.id || active.releaseId !== site.product.releaseId ||
      active.composeProject !== site.site.composeProject || active.productNetwork !== site.site.productNetwork ||
      active.ports.api !== site.site.ports.api || active.ports.web !== site.site.ports.web ||
      active.ports.referenceDataNode !== site.site.ports.referenceDataNode) {
    throw new Error("STAGING_UPGRADE_CAPACITY_ACTIVE_BINDING_MISMATCH");
  }
}

function parseSnapshot(value: unknown): StagingUpgradeHostCapacitySnapshot {
  const record = exact(value, ["schemaVersion", "capturedAt", "logicalCpuCount", "totalMemoryBytes",
    "availableMemoryBytes", "pidMaximum"]);
  if (record.schemaVersion !== 1 || !isoInstant(record.capturedAt) ||
      !integer(record.logicalCpuCount, 1, 1024) ||
      !integer(record.totalMemoryBytes, 1_073_741_824, Number.MAX_SAFE_INTEGER) ||
      !integer(record.availableMemoryBytes, 0, Number(record.totalMemoryBytes)) ||
      !integer(record.pidMaximum, 256, 10_000_000)) invalid();
  return record as unknown as StagingUpgradeHostCapacitySnapshot;
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) invalid();
  return record;
}
function isoInstant(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value));
}
function integer(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}
function invalid(): never { throw new Error("STAGING_UPGRADE_CAPACITY_SNAPSHOT_INVALID"); }
