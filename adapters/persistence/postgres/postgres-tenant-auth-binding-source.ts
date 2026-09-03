import { eq } from "drizzle-orm";
import type {
  TenantAuthBindingMaterial,
  TenantAuthBindingMaterialSource,
} from "../../identity/tenant-auth-runtime-resolver.ts";
import type { createCompanyDatabase } from "./company-database.ts";
import {
  encryptedTenantSecrets,
  identityBindings,
  tenantRegistrations,
} from "./tenant-registration-schema.ts";

type CompanyDatabase = ReturnType<typeof createCompanyDatabase>["db"];

export class PostgresTenantAuthBindingSource implements TenantAuthBindingMaterialSource {
  readonly #database: CompanyDatabase;

  constructor(database: CompanyDatabase) {
    this.#database = database;
  }

  async #findBy(column: typeof tenantRegistrations.slug | typeof identityBindings.publicProviderId,
    value: string): Promise<TenantAuthBindingMaterial | null> {
    const rows = await this.#database.select({
      bindingId: identityBindings.id,
      registrationId: tenantRegistrations.id,
      slug: tenantRegistrations.slug,
      registrationStatus: tenantRegistrations.status,
      expiresAt: tenantRegistrations.expiresAt,
      companyId: identityBindings.companyId,
      providerFamily: identityBindings.providerFamily,
      providerKey: identityBindings.providerKey,
      providerId: identityBindings.publicProviderId,
      tenantDigest: identityBindings.externalTenantDigest,
      appId: identityBindings.appId,
      bindingStatus: identityBindings.status,
      bindingRevision: identityBindings.revision,
      secretId: encryptedTenantSecrets.id,
      secretOwnerReference: encryptedTenantSecrets.ownerReference,
      secretPurpose: encryptedTenantSecrets.purpose,
      secretAlgorithm: encryptedTenantSecrets.algorithm,
      secretKeyVersion: encryptedTenantSecrets.keyVersion,
      secretNonce: encryptedTenantSecrets.nonce,
      secretCiphertext: encryptedTenantSecrets.ciphertext,
      secretAuthenticationTag: encryptedTenantSecrets.authenticationTag,
      secretCreatedAt: encryptedTenantSecrets.createdAt,
      secretRevokedAt: encryptedTenantSecrets.revokedAt,
    }).from(identityBindings)
      .innerJoin(tenantRegistrations, eq(identityBindings.registrationId, tenantRegistrations.id))
      .innerJoin(encryptedTenantSecrets, eq(identityBindings.secretId, encryptedTenantSecrets.id))
      .where(eq(column, value)).limit(2);
    if (rows.length !== 1) return null;
    const row = rows[0]!;
    return {
      bindingId: row.bindingId,
      registrationId: row.registrationId,
      slug: row.slug,
      registrationStatus: row.registrationStatus,
      expiresAt: row.expiresAt.toISOString(),
      companyId: row.companyId,
      providerFamily: row.providerFamily,
      providerKey: row.providerKey,
      providerId: row.providerId,
      tenantDigest: row.tenantDigest,
      appId: row.appId,
      bindingStatus: row.bindingStatus,
      bindingRevision: row.bindingRevision,
      secretRevokedAt: row.secretRevokedAt?.toISOString() ?? null,
      secret: {
        schemaVersion: 1,
        id: row.secretId,
        ownerReference: row.secretOwnerReference,
        purpose: row.secretPurpose as "IDENTITY_PROVIDER_CLIENT_SECRET" | "IDENTITY_PROVIDER_REFRESH_SECRET",
        algorithm: row.secretAlgorithm as "AES-256-GCM",
        keyVersion: row.secretKeyVersion,
        nonce: row.secretNonce,
        ciphertext: row.secretCiphertext,
        authenticationTag: row.secretAuthenticationTag,
        createdAt: row.secretCreatedAt.toISOString(),
      },
    };
  }

  findBySlug(slug: string): Promise<TenantAuthBindingMaterial | null> {
    return this.#findBy(tenantRegistrations.slug, slug);
  }

  findByProviderId(providerId: string): Promise<TenantAuthBindingMaterial | null> {
    return this.#findBy(identityBindings.publicProviderId, providerId);
  }
}
