const RELEASE_ID = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?-[a-f0-9]{12}$/;
const REVISION = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const OPERATION_ID = /^upgrade-[a-z0-9][a-z0-9-]{2,87}$/;
const SITE_ID = /^[a-z0-9][a-z0-9-]{2,95}$/;
const CUTOVER_ID = /^cutover-[a-f0-9]{24}$/;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,255}$/;

export interface StagingUpgradeAuthorization {
  readonly schemaVersion: 1;
  readonly product: "company-os";
  readonly environment: "STAGING";
  readonly operation: {
    readonly id: string;
    readonly siteId: string;
    readonly accountableOperatorReference: string;
    readonly expiresAt: string;
  };
  readonly active: UpgradeReleaseAuthority & { readonly startupStateDigest: string };
  readonly candidate: UpgradeReleaseAuthority & {
    readonly siteContractDigest: string;
    readonly runtimeContractDigest: string;
  };
  readonly cutover: { readonly planId: string; readonly planDigest: string };
  readonly authorization: {
    readonly preparation: string;
    readonly trafficCutover: string;
    readonly rollback: string;
  };
}

interface UpgradeReleaseAuthority {
  readonly releaseId: string;
  readonly sourceRevision: string;
  readonly releaseManifestDigest: string;
}

export function parseStagingUpgradeAuthorization(value: unknown): StagingUpgradeAuthorization {
  const root = exactRecord(value, ["schemaVersion", "product", "environment", "operation", "active",
    "candidate", "cutover", "authorization"]);
  if (root.schemaVersion !== 1 || root.product !== "company-os" || root.environment !== "STAGING") invalid();
  const operation = exactRecord(root.operation,
    ["id", "siteId", "accountableOperatorReference", "expiresAt"]);
  if (!text(operation.id, OPERATION_ID) || !text(operation.siteId, SITE_ID) ||
      !text(operation.accountableOperatorReference, REFERENCE) ||
      !isoTimestamp(operation.expiresAt)) invalid();
  const active = releaseAuthority(root.active, ["startupStateDigest"]);
  const candidate = releaseAuthority(root.candidate, ["siteContractDigest", "runtimeContractDigest"]);
  if (active.releaseId === candidate.releaseId || active.sourceRevision === candidate.sourceRevision) invalid();
  const cutover = exactRecord(root.cutover, ["planId", "planDigest"]);
  if (!text(cutover.planId, CUTOVER_ID) || !text(cutover.planDigest, DIGEST)) invalid();
  const authorization = exactRecord(root.authorization, ["preparation", "trafficCutover", "rollback"]);
  const authorities = [authorization.preparation, authorization.trafficCutover, authorization.rollback];
  if (!authorities.every((item) => text(item, REFERENCE)) || new Set(authorities).size !== authorities.length) {
    invalid();
  }
  assertCoordinateFree(root);
  return structuredClone(root) as unknown as StagingUpgradeAuthorization;
}

function releaseAuthority(value: unknown,
  extraDigests: readonly ("startupStateDigest" | "siteContractDigest" | "runtimeContractDigest")[]) {
  const record = exactRecord(value,
    ["releaseId", "sourceRevision", "releaseManifestDigest", ...extraDigests]);
  if (!text(record.releaseId, RELEASE_ID) || !text(record.sourceRevision, REVISION) ||
      !text(record.releaseManifestDigest, DIGEST) ||
      !extraDigests.every((key) => text(record[key], DIGEST))) invalid();
  return record as Record<string, string>;
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) invalid();
  return record;
}

function text(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.test(value);
}

function isoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return false;
  try { return new Date(value).toISOString() === value; } catch { return false; }
}

function assertCoordinateFree(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const child of Object.values(value)) {
    if (typeof child === "string" && (child.includes("://") || child.includes("@"))) invalid();
    assertCoordinateFree(child);
  }
}

function invalid(): never { throw new Error("STAGING_UPGRADE_AUTHORIZATION_INVALID"); }
