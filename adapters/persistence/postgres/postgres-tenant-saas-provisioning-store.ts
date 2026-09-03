import type { TenantSaasProvisioningStorePort } from
  "../../../ports/tenant-saas-provisioning-store-port.ts";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { createCompanyDatabase } from "./company-database.ts";
import {
  encryptedTenantSecrets,
  identityBindings,
  redeemedTenantSignupInvites,
  tenantRegistrations,
} from "./tenant-registration-schema.ts";

type CompanyDatabase = ReturnType<typeof createCompanyDatabase>["db"];
const CONFLICT = "TENANT_PROVISION_CONFLICT";

export class PostgresTenantSaasProvisioningStore implements TenantSaasProvisioningStorePort {
  readonly #database: CompanyDatabase;

  constructor(database: CompanyDatabase) {
    this.#database = database;
  }

  async provision(input: Parameters<TenantSaasProvisioningStorePort["provision"]>[0]):
  Promise<"CREATED" | "CONFLICT" | "INVITE_USED"> {
    try {
      await this.#database.transaction(async (transaction) => {
        const registration = input.registration;
        const expired = await transaction.select({
          registrationId: tenantRegistrations.id,
          bindingId: identityBindings.id,
          secretId: identityBindings.secretId,
        }).from(tenantRegistrations).innerJoin(identityBindings,
          eq(identityBindings.registrationId, tenantRegistrations.id)).where(and(
            eq(tenantRegistrations.status, "PENDING_IDENTITY"),
            eq(identityBindings.status, "pending"),
            lte(tenantRegistrations.expiresAt, new Date(registration.createdAt)),
          )).limit(100).for("update");
        if (expired.length) {
          const registrationIds = expired.map(({ registrationId }) => registrationId);
          await transaction.update(tenantRegistrations).set({
            status: "EXPIRED",
            revision: sql`${tenantRegistrations.revision} + 1`,
          }).where(inArray(tenantRegistrations.id, registrationIds));
          await transaction.delete(identityBindings).where(inArray(
            identityBindings.id, expired.map(({ bindingId }) => bindingId),
          ));
          await transaction.delete(encryptedTenantSecrets).where(inArray(
            encryptedTenantSecrets.id, expired.map(({ secretId }) => secretId),
          ));
        }
        const insertedRegistration = await transaction.insert(tenantRegistrations).values({
          id: registration.id,
          mode: registration.mode,
          slug: registration.slug,
          companyName: registration.companyName,
          requestedBy: registration.requestedBy,
          identityBindingId: registration.identityBindingId ?? null,
          status: registration.status,
          revision: registration.revision,
          createdAt: new Date(registration.createdAt),
          expiresAt: new Date(registration.expiresAt),
        }).onConflictDoNothing().returning({ id: tenantRegistrations.id });
        if (insertedRegistration.length !== 1) throw new Error(CONFLICT);

        if (input.signupInviteDigest) {
          const redeemed = await transaction.insert(redeemedTenantSignupInvites).values({
            inviteDigest: input.signupInviteDigest,
            registrationId: registration.id,
            redeemedAt: new Date(registration.createdAt),
          }).onConflictDoNothing().returning({ inviteDigest: redeemedTenantSignupInvites.inviteDigest });
          if (redeemed.length !== 1) throw new Error("TENANT_SIGNUP_INVITE_USED");
        }

        const secret = input.secret;
        const insertedSecret = await transaction.insert(encryptedTenantSecrets).values({
          id: secret.id,
          ownerReference: secret.ownerReference,
          purpose: secret.purpose,
          algorithm: secret.algorithm,
          keyVersion: secret.keyVersion,
          nonce: secret.nonce,
          ciphertext: secret.ciphertext,
          authenticationTag: secret.authenticationTag,
          createdAt: new Date(secret.createdAt),
        }).onConflictDoNothing().returning({ id: encryptedTenantSecrets.id });
        if (insertedSecret.length !== 1) throw new Error(CONFLICT);

        const binding = input.binding;
        const insertedBinding = await transaction.insert(identityBindings).values({
          id: binding.id,
          registrationId: binding.registrationId,
          companyId: null,
          providerFamily: binding.providerFamily,
          providerKey: binding.providerKey,
          publicProviderId: binding.publicProviderId,
          externalTenantDigest: binding.externalTenantDigest,
          appId: binding.appId,
          secretId: binding.secretId,
          status: "pending",
          revision: 1,
          createdAt: new Date(binding.createdAt),
          updatedAt: new Date(binding.createdAt),
        }).onConflictDoNothing().returning({ id: identityBindings.id });
        if (insertedBinding.length !== 1) throw new Error(CONFLICT);
      });
      return "CREATED";
    } catch (error) {
      if (error instanceof Error && error.message === "TENANT_SIGNUP_INVITE_USED") return "INVITE_USED";
      if (error instanceof Error && error.message === CONFLICT) return "CONFLICT";
      throw error;
    }
  }
}
