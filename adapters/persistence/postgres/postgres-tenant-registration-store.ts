import { and, eq, sql } from "drizzle-orm";
import type { TenantRegistrationRecord } from "../../../core/tenant-registration.ts";
import type { TenantRegistrationStorePort } from "../../../ports/tenant-registration-store-port.ts";
import type { createCompanyDatabase } from "./company-database.ts";
import { tenantRegistrations } from "./tenant-registration-schema.ts";

type CompanyDatabase = ReturnType<typeof createCompanyDatabase>["db"];

function values(record: TenantRegistrationRecord) {
  return {
    id: record.id,
    mode: record.mode,
    slug: record.slug,
    companyName: record.companyName,
    requestedBy: record.requestedBy,
    identityBindingId: record.identityBindingId ?? null,
    status: record.status,
    revision: record.revision,
    createdAt: new Date(record.createdAt),
    expiresAt: new Date(record.expiresAt),
    verifiedAt: record.verifiedAt ? new Date(record.verifiedAt) : null,
    verifiedHumanId: record.verifiedHumanId ?? null,
    externalTenantDigest: record.externalTenantDigest ?? null,
    completedAt: record.completedAt ? new Date(record.completedAt) : null,
    companyId: record.companyId ?? null,
  };
}

function record(row: typeof tenantRegistrations.$inferSelect): TenantRegistrationRecord {
  return {
    schemaVersion: 1,
    id: row.id,
    mode: row.mode as TenantRegistrationRecord["mode"],
    slug: row.slug,
    companyName: row.companyName,
    requestedBy: row.requestedBy,
    ...(row.identityBindingId ? { identityBindingId: row.identityBindingId } : {}),
    status: row.status as TenantRegistrationRecord["status"],
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    ...(row.verifiedAt ? { verifiedAt: row.verifiedAt.toISOString() } : {}),
    ...(row.verifiedHumanId ? { verifiedHumanId: row.verifiedHumanId } : {}),
    ...(row.externalTenantDigest ? { externalTenantDigest: row.externalTenantDigest } : {}),
    ...(row.completedAt ? { completedAt: row.completedAt.toISOString() } : {}),
    ...(row.companyId ? { companyId: row.companyId } : {}),
  };
}

export class PostgresTenantRegistrationStore implements TenantRegistrationStorePort {
  readonly #database: CompanyDatabase;

  constructor(database: CompanyDatabase) {
    this.#database = database;
  }

  async create(input: TenantRegistrationRecord): Promise<"CREATED" | "SLUG_TAKEN"> {
    const inserted = await this.#database.insert(tenantRegistrations).values(values(input))
      .onConflictDoNothing({
        target: tenantRegistrations.slug,
        where: sql`${tenantRegistrations.status} <> 'EXPIRED'`,
      })
      .returning({ id: tenantRegistrations.id });
    return inserted.length === 1 ? "CREATED" : "SLUG_TAKEN";
  }

  async findById(id: string): Promise<TenantRegistrationRecord | null> {
    return this.#database.select().from(tenantRegistrations)
      .where(eq(tenantRegistrations.id, id)).limit(1)
      .then((rows) => rows[0] ? record(rows[0]) : null);
  }

  async replace(input: {
    readonly expectedRevision: number;
    readonly record: TenantRegistrationRecord;
  }): Promise<"UPDATED" | "CONFLICT"> {
    const next = values(input.record);
    const updated = await this.#database.update(tenantRegistrations).set({
      status: next.status,
      revision: next.revision,
      verifiedAt: next.verifiedAt,
      verifiedHumanId: next.verifiedHumanId,
      externalTenantDigest: next.externalTenantDigest,
      completedAt: next.completedAt,
      companyId: next.companyId,
    }).where(and(
      eq(tenantRegistrations.id, input.record.id),
      eq(tenantRegistrations.revision, input.expectedRevision),
    )).returning({ id: tenantRegistrations.id });
    return updated.length === 1 ? "UPDATED" : "CONFLICT";
  }
}
