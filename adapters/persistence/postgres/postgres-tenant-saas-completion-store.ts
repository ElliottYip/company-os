import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type {
  CompleteTenantSaasRegistrationCommand,
  CompletedTenantSaasRegistration,
  TenantSaasCompletionStorePort,
} from "../../../ports/tenant-saas-completion-store-port.ts";
import type { createCompanyDatabase } from "./company-database.ts";
import { authAccounts, authUsers } from "./auth-schema.ts";
import {
  companies,
  companyMemberships,
  domainEvents,
  principalPermissionGrants,
} from "./company-access-schema.ts";
import {
  externalIdentities,
  identityBindings,
  tenantRegistrations,
} from "./tenant-registration-schema.ts";

type CompanyDatabase = ReturnType<typeof createCompanyDatabase>["db"];

function subjectDigest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export class PostgresTenantSaasCompletionStore implements TenantSaasCompletionStorePort {
  readonly #database: CompanyDatabase;

  constructor(database: CompanyDatabase) {
    this.#database = database;
  }

  async findRegistrationIdBySlug(slug: string): Promise<string | null> {
    return this.#database.select({ id: tenantRegistrations.id }).from(tenantRegistrations)
      .where(eq(tenantRegistrations.slug, slug)).limit(2)
      .then((rows) => rows.length === 1 ? rows[0]!.id : null);
  }

  complete(command: CompleteTenantSaasRegistrationCommand): Promise<CompletedTenantSaasRegistration> {
    return this.#database.transaction(async (transaction) => {
      const registration = await transaction.select().from(tenantRegistrations)
        .where(eq(tenantRegistrations.id, command.registrationId)).for("update")
        .then((rows) => rows[0] ?? null);
      if (!registration) throw new Error("TENANT_REGISTRATION_NOT_FOUND");
      if (registration.mode !== "SHARED_SAAS" || !registration.identityBindingId) {
        throw new Error("TENANT_REGISTRATION_STATE_INVALID");
      }
      const binding = await transaction.select().from(identityBindings).where(and(
        eq(identityBindings.id, registration.identityBindingId),
        eq(identityBindings.registrationId, registration.id),
      )).for("update").then((rows) => rows[0] ?? null);
      const pendingBinding = registration.status === "PENDING_IDENTITY" &&
        binding?.status === "pending" && binding.companyId === null;
      const completedBinding = registration.status === "COMPLETED" && Boolean(registration.companyId) &&
        binding?.status === "active" && binding.companyId === registration.companyId;
      if (!binding || (!pendingBinding && !completedBinding) ||
          binding.providerFamily !== "OAUTH2" || binding.providerKey !== "feishu") {
        throw new Error("TENANT_IDENTITY_BINDING_MISMATCH");
      }
      const account = await transaction.select({
        accountId: authAccounts.accountId,
        assertedEmailHmac: authUsers.assertedEmailHmac,
      }).from(authAccounts).innerJoin(authUsers, eq(authUsers.id, authAccounts.userId)).where(and(
          eq(authAccounts.providerId, binding.publicProviderId),
          eq(authAccounts.userId, command.verifiedUserId),
        )).limit(2).then((rows) => rows.length === 1 ? rows[0]! : null);
      if (!account) throw new Error("TENANT_VERIFIED_IDENTITY_REQUIRED");
      if (registration.status === "COMPLETED") {
        if (!registration.companyId || !registration.verifiedHumanId) {
          throw new Error("TENANT_REGISTRATION_STATE_INVALID");
        }
        if (registration.verifiedHumanId !== command.verifiedUserId) {
          const membership = await transaction.select({ id: companyMemberships.id })
            .from(companyMemberships).where(and(
              eq(companyMemberships.companyId, registration.companyId),
              eq(companyMemberships.principalType, "user"),
              eq(companyMemberships.principalId, command.verifiedUserId),
              eq(companyMemberships.status, "active"),
            )).limit(2).then((rows) => rows.length === 1 ? rows[0] : null);
          if (!membership) throw new Error("TENANT_MEMBERSHIP_REQUIRED");
        }
        return {
          status: "ALREADY_COMPLETED",
          registrationId: registration.id,
          companyId: registration.companyId,
          ownerUserId: registration.verifiedHumanId,
          slug: registration.slug,
        };
      }
      const completedAt = new Date(command.completedAt);
      if (completedAt >= registration.expiresAt) throw new Error("TENANT_REGISTRATION_STATE_INVALID");

      await transaction.insert(companies).values({
        id: command.companyId,
        name: registration.companyName,
        purpose: command.purpose,
        locale: command.locale,
        defaultResponsibleUserId: command.verifiedUserId,
        status: "active",
      });
      await transaction.insert(companyMemberships).values({
        id: command.membershipId,
        companyId: command.companyId,
        principalType: "user",
        principalId: command.verifiedUserId,
        status: "active",
        membershipRole: "owner",
      });
      await transaction.insert(principalPermissionGrants).values(command.permissionGrants.map((grant) => ({
        id: grant.id,
        companyId: command.companyId,
        principalType: "user",
        principalId: command.verifiedUserId,
        permissionKey: grant.permissionKey,
        scope: null,
        grantedByUserId: command.verifiedUserId,
      })));
      await transaction.insert(externalIdentities).values({
        id: command.externalIdentityId,
        bindingId: binding.id,
        userId: command.verifiedUserId,
        externalSubjectDigest: subjectDigest(account.accountId),
        externalTenantDigest: binding.externalTenantDigest,
        assertedEmailHmac: account.assertedEmailHmac,
        verifiedAt: completedAt,
      });
      await transaction.insert(domainEvents).values({
        id: command.eventId,
        companyId: command.companyId,
        sequence: 1,
        type: "tenant.company_registered",
        occurredAt: command.completedAt,
        actorId: command.verifiedUserId,
        payload: {
          schemaVersion: 1,
          registrationId: registration.id,
          identityBindingId: binding.id,
          slug: registration.slug,
        },
        correlationId: registration.id,
        causationId: null,
        provenance: "PRODUCTION",
      });
      const bindingUpdated = await transaction.update(identityBindings).set({
        companyId: command.companyId,
        status: "active",
        revision: binding.revision + 1,
        updatedAt: completedAt,
      }).where(and(eq(identityBindings.id, binding.id), eq(identityBindings.revision, binding.revision)))
        .returning({ id: identityBindings.id });
      if (bindingUpdated.length !== 1) throw new Error("TENANT_IDENTITY_BINDING_CONFLICT");
      const registrationUpdated = await transaction.update(tenantRegistrations).set({
        status: "COMPLETED",
        revision: registration.revision + 2,
        verifiedAt: completedAt,
        verifiedHumanId: command.verifiedUserId,
        externalTenantDigest: binding.externalTenantDigest,
        completedAt,
        companyId: command.companyId,
      }).where(and(eq(tenantRegistrations.id, registration.id),
        eq(tenantRegistrations.revision, registration.revision)))
        .returning({ id: tenantRegistrations.id });
      if (registrationUpdated.length !== 1) throw new Error("TENANT_REGISTRATION_CONFLICT");
      return {
        status: "COMPLETED",
        registrationId: registration.id,
        companyId: command.companyId,
        ownerUserId: command.verifiedUserId,
        slug: registration.slug,
      };
    });
  }
}
