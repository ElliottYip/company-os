import { and, eq } from "drizzle-orm";
import type { createCompanyDatabase } from "./company-database.ts";
import { companies, companyMemberships, instanceUserRoles } from "./company-access-schema.ts";
import { tenantRegistrations } from "./tenant-registration-schema.ts";

type CompanyDatabase = ReturnType<typeof createCompanyDatabase>["db"];

export function createCompanyAccessDirectory(database: CompanyDatabase) {
  return {
    async listForUser(userId: string) {
      const [memberships, admin] = await Promise.all([
        database
          .select({
            companyId: companyMemberships.companyId,
            membershipRole: companyMemberships.membershipRole,
            status: companyMemberships.status,
            name: companies.name,
          })
          .from(companyMemberships)
          .innerJoin(companies, eq(companies.id, companyMemberships.companyId))
          .where(and(
            eq(companyMemberships.principalType, "user"),
            eq(companyMemberships.principalId, userId),
            eq(companyMemberships.status, "active"),
            eq(companies.status, "active"),
          )),
        database
          .select({ id: instanceUserRoles.id })
          .from(instanceUserRoles)
          .where(and(eq(instanceUserRoles.userId, userId), eq(instanceUserRoles.role, "instance_admin")))
          .then((rows) => rows[0] ?? null),
      ]);
      return {
        schemaVersion: 1 as const,
        companies: memberships.map((membership) => ({
          id: membership.companyId,
          name: membership.name,
          membershipRole: membership.membershipRole,
        })),
        isInstanceAdmin: admin !== null,
      };
    },
    async listRoutableForUser(userId: string) {
      const [memberships, admin] = await Promise.all([
        database
          .select({
            companyId: companyMemberships.companyId,
            membershipRole: companyMemberships.membershipRole,
            name: companies.name,
            slug: tenantRegistrations.slug,
          })
          .from(companyMemberships)
          .innerJoin(companies, eq(companies.id, companyMemberships.companyId))
          .innerJoin(tenantRegistrations, and(
            eq(tenantRegistrations.companyId, companyMemberships.companyId),
            eq(tenantRegistrations.status, "COMPLETED"),
          ))
          .where(and(
            eq(companyMemberships.principalType, "user"),
            eq(companyMemberships.principalId, userId),
            eq(companyMemberships.status, "active"),
            eq(companies.status, "active"),
          )),
        database
          .select({ id: instanceUserRoles.id })
          .from(instanceUserRoles)
          .where(and(eq(instanceUserRoles.userId, userId), eq(instanceUserRoles.role, "instance_admin")))
          .then((rows) => rows[0] ?? null),
      ]);
      const companyIds = new Set<string>();
      const slugs = new Set<string>();
      for (const { companyId, slug } of memberships) {
        if (companyIds.has(companyId) || slugs.has(slug)) {
          throw new Error("TENANT_ROUTE_PROJECTION_AMBIGUOUS");
        }
        companyIds.add(companyId);
        slugs.add(slug);
      }
      return {
        schemaVersion: 1 as const,
        companies: memberships.map((membership) => ({
          id: membership.companyId,
          name: membership.name,
          slug: membership.slug,
          membershipRole: membership.membershipRole,
        })),
        isInstanceAdmin: admin !== null,
      };
    },
    async getForUser(userId: string, companyId: string) {
      return database
        .select({
          id: companies.id,
          name: companies.name,
          purpose: companies.purpose,
          locale: companies.locale,
          membershipRole: companyMemberships.membershipRole,
        })
        .from(companyMemberships)
        .innerJoin(companies, eq(companies.id, companyMemberships.companyId))
        .where(and(
          eq(companyMemberships.companyId, companyId),
          eq(companyMemberships.principalType, "user"),
          eq(companyMemberships.principalId, userId),
          eq(companyMemberships.status, "active"),
          eq(companies.status, "active"),
        ))
        .then((rows) => rows[0] ?? null);
    },
  };
}
