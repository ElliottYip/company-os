export type TenantDeploymentMode = "SHARED_SAAS" | "INDEPENDENT";
export type TenantRegistrationStatus =
  | "PENDING_IDENTITY"
  | "IDENTITY_VERIFIED"
  | "HANDOFF_READY"
  | "COMPLETED"
  | "EXPIRED";

export interface TenantRegistrationRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly mode: TenantDeploymentMode;
  readonly slug: string;
  readonly companyName: string;
  readonly requestedBy: string;
  readonly identityBindingId?: string;
  readonly status: TenantRegistrationStatus;
  readonly revision: number;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly verifiedAt?: string;
  readonly verifiedHumanId?: string;
  readonly externalTenantDigest?: string;
  readonly completedAt?: string;
  readonly companyId?: string;
}
const PORTABLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TENANT_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;
const REGISTRATION_TTL_MILLISECONDS = 15 * 60 * 1_000;

function portableId(value: string | undefined, code: string): string {
  const normalized = value?.trim() ?? "";
  if (!PORTABLE_ID.test(normalized)) throw new Error(code);
  return normalized;
}

function exactIsoInstant(value: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new Error("TENANT_REGISTRATION_CLOCK_INVALID");
  }
  return value;
}

function live(record: TenantRegistrationRecord, now: string): void {
  if (Date.parse(now) >= Date.parse(record.expiresAt)) throw new Error("TENANT_REGISTRATION_EXPIRED");
}

export function createTenantRegistration(input: {
  readonly id: string;
  readonly mode: TenantDeploymentMode;
  readonly slug: string;
  readonly companyName: string;
  readonly requestedBy: string;
  readonly identityBindingId?: string;
  readonly now: string;
}): TenantRegistrationRecord {
  const id = portableId(input.id, "TENANT_REGISTRATION_ID_INVALID");
  const requestedBy = portableId(input.requestedBy, "TENANT_REGISTRATION_REQUESTER_INVALID");
  const slug = input.slug.trim().toLocaleLowerCase("en-US");
  if (!TENANT_SLUG.test(slug)) throw new Error("TENANT_SLUG_INVALID");
  const companyName = input.companyName.trim();
  if (!companyName || [...companyName].length > 160) throw new Error("TENANT_COMPANY_NAME_INVALID");
  const createdAt = exactIsoInstant(input.now);
  if (input.mode !== "SHARED_SAAS" && input.mode !== "INDEPENDENT") {
    throw new Error("TENANT_DEPLOYMENT_MODE_INVALID");
  }
  if (input.mode === "SHARED_SAAS" && !input.identityBindingId?.trim()) {
    throw new Error("IDENTITY_BINDING_ID_REQUIRED");
  }
  if (input.mode === "INDEPENDENT" && input.identityBindingId !== undefined) {
    throw new Error("IDENTITY_BINDING_NOT_ALLOWED");
  }
  const identityBindingId = input.mode === "SHARED_SAAS"
    ? portableId(input.identityBindingId, "IDENTITY_BINDING_ID_INVALID")
    : undefined;
  return {
    schemaVersion: 1,
    id,
    mode: input.mode,
    slug,
    companyName,
    requestedBy,
    ...(identityBindingId ? { identityBindingId } : {}),
    status: input.mode === "SHARED_SAAS" ? "PENDING_IDENTITY" : "HANDOFF_READY",
    revision: 1,
    createdAt,
    expiresAt: new Date(Date.parse(createdAt) + REGISTRATION_TTL_MILLISECONDS).toISOString(),
  };
}

export function verifyTenantRegistrationIdentity(
  record: TenantRegistrationRecord,
  input: {
    readonly identityBindingId: string;
    readonly verifiedHumanId: string;
    readonly externalTenantDigest: string;
    readonly now: string;
  },
): TenantRegistrationRecord {
  if (record.status === "COMPLETED") throw new Error("TENANT_REGISTRATION_ALREADY_COMPLETED");
  if (record.mode !== "SHARED_SAAS" || record.status !== "PENDING_IDENTITY") {
    throw new Error("TENANT_REGISTRATION_STATE_INVALID");
  }
  const now = exactIsoInstant(input.now);
  live(record, now);
  const identityBindingId = portableId(input.identityBindingId, "IDENTITY_BINDING_ID_INVALID");
  const verifiedHumanId = portableId(input.verifiedHumanId, "VERIFIED_HUMAN_ID_INVALID");
  if (!SHA256_DIGEST.test(input.externalTenantDigest)) throw new Error("EXTERNAL_TENANT_DIGEST_INVALID");
  if (identityBindingId !== record.identityBindingId) throw new Error("TENANT_IDENTITY_BINDING_MISMATCH");
  return {
    ...record,
    status: "IDENTITY_VERIFIED",
    revision: record.revision + 1,
    verifiedAt: now,
    verifiedHumanId,
    externalTenantDigest: input.externalTenantDigest,
  };
}

export function completeTenantRegistration(
  record: TenantRegistrationRecord,
  input: { readonly verifiedHumanId: string; readonly companyId: string; readonly now: string },
): TenantRegistrationRecord {
  if (record.status === "COMPLETED") throw new Error("TENANT_REGISTRATION_ALREADY_COMPLETED");
  if (record.mode !== "SHARED_SAAS" || record.status !== "IDENTITY_VERIFIED") {
    throw new Error("TENANT_REGISTRATION_STATE_INVALID");
  }
  const now = exactIsoInstant(input.now);
  live(record, now);
  const verifiedHumanId = portableId(input.verifiedHumanId, "VERIFIED_HUMAN_ID_INVALID");
  const companyId = portableId(input.companyId, "TENANT_COMPANY_ID_INVALID");
  if (verifiedHumanId !== record.verifiedHumanId) throw new Error("TENANT_VERIFIED_HUMAN_MISMATCH");
  return {
    ...record,
    status: "COMPLETED",
    revision: record.revision + 1,
    completedAt: now,
    companyId,
  };
}
