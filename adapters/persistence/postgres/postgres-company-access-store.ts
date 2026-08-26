import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type {
  CompanyMembership,
  CompanyMembershipRole,
  CompanyMembershipStatus,
  CompanyPermissionKey,
} from "../../../core/company-access.ts";
import type {
  CompanyAccessStorePort,
  CompanyHumanMember,
  CreateOwnedCompanyRecord,
  FirstInstanceAdminClaim,
} from "../../../ports/company-access-store-port.ts";
import type { CompanyProfileStorePort } from "../../../ports/company-profile-store-port.ts";
import type {
  CompanyLifecycleStorePort,
  ArchivedCompanyRecord,
} from "../../../ports/company-lifecycle-store-port.ts";
import type { createCompanyDatabase } from "./company-database.ts";
import {
  companies,
  companyMemberships,
  connectorOutbox,
  domainEvents,
  humanInvites,
  instanceUserRoles,
  principalPermissionGrants,
} from "./company-access-schema.ts";
import { authUsers } from "./auth-schema.ts";

type CompanyDatabase = ReturnType<typeof createCompanyDatabase>["db"];

export class PostgresCompanyAccessStore implements CompanyAccessStorePort, CompanyProfileStorePort,
  CompanyLifecycleStorePort {
  readonly #database: CompanyDatabase;

  constructor(database: CompanyDatabase) {
    this.#database = database;
  }

  async listCompanyIds(): Promise<readonly string[]> {
    return this.#database.select({ id: companies.id }).from(companies)
      .then((rows) => rows.map(({ id }) => id));
  }

  async claimFirstInstanceAdmin(input: {
    readonly roleId: string;
    readonly userId: string;
  }): Promise<FirstInstanceAdminClaim> {
    return this.#database.transaction(async (transaction) => {
      await transaction.execute(sql`lock table ${instanceUserRoles} in share row exclusive mode`);
      const existing = await transaction
        .select({ userId: instanceUserRoles.userId })
        .from(instanceUserRoles)
        .where(eq(instanceUserRoles.role, "instance_admin"))
        .then((rows) => rows[0] ?? null);
      if (existing) return { status: "ALREADY_CLAIMED", existingUserId: existing.userId };
      await transaction.insert(instanceUserRoles).values({
        id: input.roleId,
        userId: input.userId,
        role: "instance_admin",
      });
      return { status: "CLAIMED", userId: input.userId };
    });
  }

  async createOwnedCompany(input: {
    readonly companyId: string;
    readonly membershipId: string;
    readonly permissionGrants: readonly { readonly id: string; readonly permissionKey: string }[];
    readonly ownerUserId: string;
    readonly name: string;
    readonly purpose: string;
    readonly locale: string;
  }): Promise<CreateOwnedCompanyRecord> {
    return this.#database.transaction(async (transaction) => {
      const admin = await transaction
        .select({ id: instanceUserRoles.id })
        .from(instanceUserRoles)
        .where(and(
          eq(instanceUserRoles.userId, input.ownerUserId),
          eq(instanceUserRoles.role, "instance_admin"),
        ))
        .then((rows) => rows[0] ?? null);
      if (!admin) throw new Error("INSTANCE_ADMIN_REQUIRED");

      await transaction.insert(companies).values({
        id: input.companyId,
        name: input.name,
        purpose: input.purpose,
        locale: input.locale,
        defaultResponsibleUserId: input.ownerUserId,
        status: "active",
      });
      await transaction.insert(companyMemberships).values({
        id: input.membershipId,
        companyId: input.companyId,
        principalType: "user",
        principalId: input.ownerUserId,
        status: "active",
        membershipRole: "owner",
      });
      if (input.permissionGrants.length) {
        await transaction.insert(principalPermissionGrants).values(input.permissionGrants.map((grant) => ({
          id: grant.id,
          companyId: input.companyId,
          principalType: "user",
          principalId: input.ownerUserId,
          permissionKey: grant.permissionKey,
          scope: null,
          grantedByUserId: input.ownerUserId,
        })));
      }
      return {
        companyId: input.companyId,
        membershipId: input.membershipId,
        permissionGrantIds: input.permissionGrants.map(({ id }) => id),
        ownerUserId: input.ownerUserId,
        name: input.name,
        purpose: input.purpose,
        locale: input.locale,
      };
    });
  }

  async updateCompanyProfileAtomically(
    input: Parameters<CompanyProfileStorePort["updateCompanyProfileAtomically"]>[0],
  ): Promise<void> {
    await this.#database.transaction(async (transaction) => {
      const company = await transaction.select().from(companies)
        .where(eq(companies.id, input.companyId)).for("update").then((rows) => rows[0] ?? null);
      if (!company) throw new Error("COMPANY_ACCESS_NOT_FOUND");
      if (company.name !== input.expected.name || company.purpose !== input.expected.purpose ||
          company.locale !== input.expected.locale) throw new Error("COMPANY_PROFILE_REVISION_CONFLICT");
      const tail = await transaction.select({ sequence: domainEvents.sequence }).from(domainEvents)
        .where(eq(domainEvents.companyId, input.companyId)).orderBy(desc(domainEvents.sequence)).limit(1)
        .then((rows) => rows[0]?.sequence ?? 0);
      if (tail !== input.expectedEventSequence) throw new Error("EVENT_SEQUENCE_CONFLICT");
      await transaction.update(companies).set({ name: input.next.name, purpose: input.next.purpose,
        locale: input.next.locale }).where(eq(companies.id, input.companyId));
      await transaction.insert(domainEvents).values({
        id: input.event.id, companyId: input.event.companyId, sequence: tail + 1,
        type: input.event.type, occurredAt: input.event.occurredAt, actorId: input.event.actorId,
        payload: input.event.payload, correlationId: input.event.correlationId,
        causationId: input.event.causationId, provenance: input.event.provenance,
      });
    });
  }

  async archiveCompanyAtomically(
    input: Parameters<CompanyLifecycleStorePort["archiveCompanyAtomically"]>[0],
  ): Promise<ArchivedCompanyRecord> {
    return this.#database.transaction(async (transaction) => {
      const company = await transaction.select({ status: companies.status }).from(companies)
        .where(eq(companies.id, input.companyId)).for("update").then((rows) => rows[0] ?? null);
      if (!company) throw new Error("COMPANY_ACCESS_NOT_FOUND");
      if (company.status !== input.expectedStatus) throw new Error("COMPANY_LIFECYCLE_REVISION_CONFLICT");
      const owner = await transaction.select({ id: companyMemberships.id }).from(companyMemberships)
        .where(and(
          eq(companyMemberships.companyId, input.companyId),
          eq(companyMemberships.principalType, "user"),
          eq(companyMemberships.principalId, input.actorUserId),
          eq(companyMemberships.membershipRole, "owner"),
          eq(companyMemberships.status, "active"),
        )).for("update").then((rows) => rows[0] ?? null);
      if (!owner) throw new Error("COMPANY_ARCHIVE_OWNER_REQUIRED");
      const pendingPublication = await transaction.select({ id: connectorOutbox.id }).from(connectorOutbox)
        .where(and(eq(connectorOutbox.companyId, input.companyId), eq(connectorOutbox.status, "PENDING")))
        .limit(1).then((rows) => rows[0] ?? null);
      if (pendingPublication) throw new Error("COMPANY_ARCHIVE_PENDING_OUTBOX");
      const tail = await transaction.select({ sequence: domainEvents.sequence }).from(domainEvents)
        .where(eq(domainEvents.companyId, input.companyId)).orderBy(desc(domainEvents.sequence)).limit(1)
        .then((rows) => rows[0]?.sequence ?? 0);
      if (tail !== input.expectedEventSequence) throw new Error("EVENT_SEQUENCE_CONFLICT");
      const archivedAt = new Date(input.archivedAt);
      if (!Number.isFinite(archivedAt.valueOf())) throw new Error("COMPANY_ARCHIVE_TIMESTAMP_INVALID");
      await transaction.update(companies).set({ status: "archived", updatedAt: archivedAt })
        .where(eq(companies.id, input.companyId));
      await transaction.update(companyMemberships).set({ status: "archived", updatedAt: archivedAt })
        .where(eq(companyMemberships.companyId, input.companyId));
      await transaction.update(humanInvites).set({ revokedAt: archivedAt, updatedAt: archivedAt })
        .where(and(eq(humanInvites.companyId, input.companyId), sql`${humanInvites.acceptedAt} is null`,
          sql`${humanInvites.revokedAt} is null`));
      await transaction.insert(domainEvents).values({
        id: input.event.id, companyId: input.event.companyId, sequence: tail + 1,
        type: input.event.type, occurredAt: input.event.occurredAt, actorId: input.event.actorId,
        payload: input.event.payload, correlationId: input.event.correlationId,
        causationId: input.event.causationId, provenance: input.event.provenance,
      });
      return { companyId: input.companyId, status: "archived", archivedAt: input.archivedAt,
        exportDigest: input.exportDigest, retentionPolicyId: input.retentionPolicyId };
    });
  }

  async listActiveHumanMemberships(userId: string): Promise<readonly CompanyMembership[]> {
    const rows = await this.#database
      .select({
        companyId: companyMemberships.companyId,
        principalId: companyMemberships.principalId,
        status: companyMemberships.status,
        role: companyMemberships.membershipRole,
      })
      .from(companyMemberships)
      .where(and(
        eq(companyMemberships.principalType, "user"),
        eq(companyMemberships.principalId, userId),
        eq(companyMemberships.status, "active"),
      ));
    return rows.map((row) => ({
      companyId: row.companyId,
      principalType: "user",
      principalId: row.principalId,
      status: row.status as CompanyMembershipStatus,
      role: row.role as CompanyMembershipRole,
    }));
  }

  async listCompanyHumanMembers(companyId: string): Promise<readonly CompanyHumanMember[]> {
    const rows = await this.#database.select({
      userId: companyMemberships.principalId,
      displayName: authUsers.name,
      email: authUsers.email,
      role: companyMemberships.membershipRole,
      status: companyMemberships.status,
      createdAt: companyMemberships.createdAt,
      updatedAt: companyMemberships.updatedAt,
    }).from(companyMemberships).innerJoin(
      authUsers,
      eq(authUsers.id, companyMemberships.principalId),
    ).where(and(
      eq(companyMemberships.companyId, companyId),
      eq(companyMemberships.principalType, "user"),
    ));
    return rows.map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      email: row.email,
      role: row.role as CompanyHumanMember["role"],
      status: row.status as CompanyHumanMember["status"],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async updateCompanyHumanMembership(
    input: Parameters<CompanyAccessStorePort["updateCompanyHumanMembership"]>[0],
  ): Promise<CompanyHumanMember> {
    return this.#database.transaction(async (transaction) => {
      const company = await transaction.select({ id: companies.id }).from(companies)
        .where(eq(companies.id, input.companyId)).for("update").then((rows) => rows[0] ?? null);
      if (!company) throw new Error("COMPANY_ACCESS_NOT_FOUND");
      const current = await transaction.select().from(companyMemberships).where(and(
        eq(companyMemberships.companyId, input.companyId),
        eq(companyMemberships.principalType, "user"),
        eq(companyMemberships.principalId, input.userId),
      )).for("update").then((rows) => rows[0] ?? null);
      if (!current) throw new Error("COMPANY_MEMBERSHIP_NOT_FOUND");
      if (current.membershipRole !== input.expectedRole || current.status !== input.expectedStatus) {
        throw new Error("COMPANY_MEMBERSHIP_REVISION_CONFLICT");
      }
      if (current.membershipRole === "owner" && current.status === "active" &&
          (input.role !== "owner" || input.status !== "active")) {
        const activeOwners = await transaction.select({ id: companyMemberships.id })
          .from(companyMemberships).where(and(
            eq(companyMemberships.companyId, input.companyId),
            eq(companyMemberships.principalType, "user"),
            eq(companyMemberships.membershipRole, "owner"),
            eq(companyMemberships.status, "active"),
          ));
        if (activeOwners.length <= 1) throw new Error("LAST_ACTIVE_OWNER_REQUIRED");
      }
      const tail = await transaction.select({ sequence: domainEvents.sequence }).from(domainEvents)
        .where(eq(domainEvents.companyId, input.companyId)).orderBy(desc(domainEvents.sequence)).limit(1)
        .then((rows) => rows[0]?.sequence ?? 0);
      if (tail !== input.expectedEventSequence) throw new Error("EVENT_SEQUENCE_CONFLICT");

      await transaction.delete(principalPermissionGrants).where(and(
        eq(principalPermissionGrants.companyId, input.companyId),
        eq(principalPermissionGrants.principalType, "user"),
        eq(principalPermissionGrants.principalId, input.userId),
      ));
      if (input.permissionGrants.length) {
        await transaction.insert(principalPermissionGrants).values(input.permissionGrants.map((grant) => ({
          id: grant.id, companyId: input.companyId, principalType: "user",
          principalId: input.userId, permissionKey: grant.permissionKey, scope: null,
          grantedByUserId: input.grantedByUserId,
        })));
      }
      const changedAt = new Date(input.changedAt);
      const updated = await transaction.update(companyMemberships).set({
        membershipRole: input.role,
        status: input.status,
        updatedAt: changedAt,
      }).where(eq(companyMemberships.id, current.id)).returning().then((rows) => rows[0]);
      if (!updated) throw new Error("COMPANY_MEMBERSHIP_UPDATE_FAILED");
      await transaction.insert(domainEvents).values({
        id: input.event.id, companyId: input.event.companyId, sequence: tail + 1,
        type: input.event.type, occurredAt: input.event.occurredAt, actorId: input.event.actorId,
        payload: input.event.payload, correlationId: input.event.correlationId,
        causationId: input.event.causationId, provenance: input.event.provenance,
      });
      const user = await transaction.select({ name: authUsers.name, email: authUsers.email })
        .from(authUsers).where(eq(authUsers.id, input.userId)).then((rows) => rows[0]);
      if (!user) throw new Error("COMPANY_MEMBER_IDENTITY_NOT_FOUND");
      return {
        userId: input.userId, displayName: user.name, email: user.email,
        role: input.role, status: input.status,
        createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString(),
      };
    });
  }

  async isInstanceAdmin(userId: string): Promise<boolean> {
    const row = await this.#database.select({ id: instanceUserRoles.id })
      .from(instanceUserRoles)
      .where(and(
        eq(instanceUserRoles.userId, userId),
        eq(instanceUserRoles.role, "instance_admin"),
      ))
      .then((rows) => rows[0] ?? null);
    return row !== null;
  }

  async listPermissionKeys(userId: string, companyId: string): Promise<readonly CompanyPermissionKey[]> {
    return this.#database.select({ permissionKey: principalPermissionGrants.permissionKey })
      .from(principalPermissionGrants)
      .where(and(
        eq(principalPermissionGrants.companyId, companyId),
        eq(principalPermissionGrants.principalType, "user"),
        eq(principalPermissionGrants.principalId, userId),
      ))
      .then((rows) => rows.map(({ permissionKey }) => permissionKey as CompanyPermissionKey));
  }
}

export function createPostgresCompanyAccessStore(
  database: CompanyDatabase,
): CompanyAccessStorePort & CompanyProfileStorePort & CompanyLifecycleStorePort {
  return new PostgresCompanyAccessStore(database);
}

export function nextPostgresRecordId(): string {
  return randomUUID();
}
