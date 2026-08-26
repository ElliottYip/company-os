import { and, eq } from "drizzle-orm";
import type { createCompanyDatabase } from "./company-database.ts";
import { companies, companyMemberships, instanceUserRoles } from "./company-access-schema.ts";

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
