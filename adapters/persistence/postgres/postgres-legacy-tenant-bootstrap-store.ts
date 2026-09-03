import { and, eq, ne, or } from "drizzle-orm";
import type { LegacyTenantBootstrapStorePort } from
  "../../../ports/legacy-tenant-bootstrap-store-port.ts";
import type { createCompanyDatabase } from "./company-database.ts";
import { authAccounts } from "./auth-schema.ts";
import { companies, companyMemberships } from "./company-access-schema.ts";
import { encryptedTenantSecrets, identityBindings, tenantRegistrations } from
  "./tenant-registration-schema.ts";

type CompanyDatabase = ReturnType<typeof createCompanyDatabase>["db"];

export class PostgresLegacyTenantBootstrapStore implements LegacyTenantBootstrapStorePort {
  readonly #database: CompanyDatabase;

  constructor(database: CompanyDatabase) {
    this.#database = database;
  }

  async inspect(input: Parameters<LegacyTenantBootstrapStorePort["inspect"]>[0]):
  Promise<"READY" | "ALREADY_PRESENT" | "CONFLICT"> {
    try {
      const company = await this.#database.select({ id: companies.id }).from(companies)
        .where(and(eq(companies.id, input.companyId), eq(companies.status, "active")))
        .limit(2).then((rows) => rows.length === 1 ? rows[0]! : null);
      if (!company) return "CONFLICT";
      const [owners, legacyAccounts, registrations] = await Promise.all([
        this.#database.select({ principalId: companyMemberships.principalId }).from(companyMemberships).where(and(
          eq(companyMemberships.companyId, company.id),
          eq(companyMemberships.principalType, "user"),
          eq(companyMemberships.membershipRole, "owner"),
          eq(companyMemberships.status, "active"),
        )).limit(2),
        this.#database.select({ id: authAccounts.id }).from(authAccounts).where(and(
          eq(authAccounts.userId, input.ownerUserId), eq(authAccounts.providerId, "feishu"),
        )).limit(2),
        this.#database.select().from(tenantRegistrations).where(and(
          ne(tenantRegistrations.status, "EXPIRED"),
          or(eq(tenantRegistrations.companyId, company.id), eq(tenantRegistrations.slug, input.slug)),
        )).limit(3),
      ]);
      if (owners.length !== 1 || owners[0]!.principalId !== input.ownerUserId ||
          legacyAccounts.length !== 1) return "CONFLICT";
      if (registrations.length) {
        if (registrations.length !== 1) return "CONFLICT";
        const existing = registrations[0]!;
        const existingBinding = await this.#database.select().from(identityBindings).where(and(
          eq(identityBindings.id, existing.identityBindingId!),
          eq(identityBindings.registrationId, existing.id),
        )).limit(2).then((rows) => rows.length === 1 ? rows[0]! : null);
        const existingSecret = existingBinding
          ? await this.#database.select({ id: encryptedTenantSecrets.id }).from(encryptedTenantSecrets)
              .where(and(
                eq(encryptedTenantSecrets.id, existingBinding.secretId),
                eq(encryptedTenantSecrets.ownerReference, existingBinding.id),
                eq(encryptedTenantSecrets.purpose, "IDENTITY_PROVIDER_CLIENT_SECRET"),
              )).limit(2).then((rows) => rows.length === 1 ? rows[0]! : null)
          : null;
        const exact = existing.status === "COMPLETED" && existing.companyId === company.id &&
          existing.slug === input.slug && existing.verifiedHumanId === input.ownerUserId &&
          existing.externalTenantDigest === input.externalTenantDigest &&
          existingBinding?.status === "active" && existingBinding.companyId === company.id &&
          existingBinding.providerFamily === "OAUTH2" && existingBinding.providerKey === "feishu" &&
          existingBinding.appId === input.appId &&
          existingBinding.externalTenantDigest === input.externalTenantDigest && existingSecret !== null;
        return exact ? "ALREADY_PRESENT" : "CONFLICT";
      }
      const conflicts = await this.#database.select({ id: identityBindings.id }).from(identityBindings)
        .where(or(
          eq(identityBindings.appId, input.appId),
          eq(identityBindings.externalTenantDigest, input.externalTenantDigest),
        )).limit(1);
      return conflicts.length ? "CONFLICT" : "READY";
    } catch {
      throw new Error("LEGACY_TENANT_PREFLIGHT_OPERATION_FAILED");
    }
  }

  async bootstrap(input: Parameters<LegacyTenantBootstrapStorePort["bootstrap"]>[0]):
  Promise<"CREATED" | "ALREADY_PRESENT" | "CONFLICT"> {
    try {
      return await this.#database.transaction(async (transaction) => {
      const { registration, binding, secret } = input;
      const company = await transaction.select({ id: companies.id, name: companies.name })
        .from(companies).where(and(eq(companies.id, registration.companyId!), eq(companies.status, "active")))
        .for("update").then((rows) => rows.length === 1 ? rows[0]! : null);
      if (!company) return "CONFLICT";
      const owners = await transaction.select({ principalId: companyMemberships.principalId })
        .from(companyMemberships)
        .where(and(
          eq(companyMemberships.companyId, company.id),
          eq(companyMemberships.principalType, "user"),
          eq(companyMemberships.membershipRole, "owner"),
          eq(companyMemberships.status, "active"),
        )).limit(2);
      const legacyAccount = await transaction.select({ id: authAccounts.id }).from(authAccounts)
        .where(and(eq(authAccounts.userId, registration.verifiedHumanId!), eq(authAccounts.providerId, "feishu")))
        .limit(2).then((rows) => rows.length === 1 ? rows[0]! : null);
      if (owners.length !== 1 || owners[0]!.principalId !== registration.verifiedHumanId ||
          !legacyAccount) return "CONFLICT";

      const registrations = await transaction.select().from(tenantRegistrations).where(and(
        ne(tenantRegistrations.status, "EXPIRED"),
        or(eq(tenantRegistrations.companyId, company.id), eq(tenantRegistrations.slug, registration.slug)),
      )).limit(3).for("update");
      if (registrations.length) {
        if (registrations.length !== 1) return "CONFLICT";
        const existing = registrations[0]!;
        const existingBinding = await transaction.select().from(identityBindings).where(and(
          eq(identityBindings.id, existing.identityBindingId!),
          eq(identityBindings.registrationId, existing.id),
        )).limit(2).then((rows) => rows.length === 1 ? rows[0]! : null);
        const existingSecret = existingBinding
          ? await transaction.select({ id: encryptedTenantSecrets.id }).from(encryptedTenantSecrets).where(and(
              eq(encryptedTenantSecrets.id, existingBinding.secretId),
              eq(encryptedTenantSecrets.ownerReference, existingBinding.id),
              eq(encryptedTenantSecrets.purpose, "IDENTITY_PROVIDER_CLIENT_SECRET"),
            )).limit(2).then((rows) => rows.length === 1 ? rows[0]! : null)
          : null;
        const exact = existing.status === "COMPLETED" && existing.companyId === company.id &&
          existing.slug === registration.slug && existing.verifiedHumanId === registration.verifiedHumanId &&
          existing.externalTenantDigest === registration.externalTenantDigest &&
          existingBinding?.status === "active" && existingBinding.companyId === company.id &&
          existingBinding.providerFamily === "OAUTH2" && existingBinding.providerKey === "feishu" &&
          existingBinding.appId === binding.appId &&
          existingBinding.externalTenantDigest === binding.externalTenantDigest && existingSecret !== null;
        return exact ? "ALREADY_PRESENT" : "CONFLICT";
      }

      const conflicts = await transaction.select({ id: identityBindings.id }).from(identityBindings).where(or(
        eq(identityBindings.publicProviderId, binding.publicProviderId),
        eq(identityBindings.appId, binding.appId),
        eq(identityBindings.externalTenantDigest, binding.externalTenantDigest),
      )).limit(1);
      if (conflicts.length) return "CONFLICT";

      await transaction.insert(tenantRegistrations).values({
        id: registration.id,
        mode: registration.mode,
        slug: registration.slug,
        companyName: company.name,
        requestedBy: registration.requestedBy,
        identityBindingId: registration.identityBindingId!,
        status: registration.status,
        revision: registration.revision,
        createdAt: new Date(registration.createdAt),
        expiresAt: new Date(registration.expiresAt),
        verifiedAt: new Date(registration.verifiedAt!),
        verifiedHumanId: registration.verifiedHumanId!,
        externalTenantDigest: registration.externalTenantDigest!,
        completedAt: new Date(registration.completedAt!),
        companyId: company.id,
      });
      await transaction.insert(encryptedTenantSecrets).values({
        id: secret.id,
        ownerReference: secret.ownerReference,
        purpose: secret.purpose,
        algorithm: secret.algorithm,
        keyVersion: secret.keyVersion,
        nonce: secret.nonce,
        ciphertext: secret.ciphertext,
        authenticationTag: secret.authenticationTag,
        createdAt: new Date(secret.createdAt),
      });
      await transaction.insert(identityBindings).values({
        id: binding.id,
        registrationId: binding.registrationId,
        companyId: company.id,
        providerFamily: binding.providerFamily,
        providerKey: binding.providerKey,
        publicProviderId: binding.publicProviderId,
        externalTenantDigest: binding.externalTenantDigest,
        appId: binding.appId,
        secretId: binding.secretId,
        status: binding.status,
        revision: 1,
        createdAt: new Date(binding.createdAt),
        updatedAt: new Date(binding.createdAt),
      });
        return "CREATED";
      });
    } catch {
      try {
        const reconciled = await this.inspect({
          companyId: input.binding.companyId,
          ownerUserId: input.registration.verifiedHumanId!,
          slug: input.registration.slug,
          appId: input.binding.appId,
          externalTenantDigest: input.binding.externalTenantDigest,
        });
        if (reconciled === "ALREADY_PRESENT") return "ALREADY_PRESENT";
        if (reconciled === "CONFLICT") return "CONFLICT";
      } catch {
        // Collapse infrastructure details into the stable operator-facing failure below.
      }
      throw new Error("LEGACY_TENANT_BOOTSTRAP_OPERATION_FAILED");
    }
  }
}
