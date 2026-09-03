import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-schema.ts";
import { companies } from "./company-access-schema.ts";

export const tenantRegistrations = pgTable("company_os_tenant_registration", {
  id: text("id").primaryKey(),
  mode: text("mode").notNull(),
  slug: text("slug").notNull(),
  companyName: text("company_name").notNull(),
  requestedBy: text("requested_by").notNull(),
  identityBindingId: text("identity_binding_id"),
  status: text("status").notNull(),
  revision: integer("revision").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedHumanId: text("verified_human_id").references(() => authUsers.id, { onDelete: "restrict" }),
  externalTenantDigest: text("external_tenant_digest"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  companyId: text("company_id").references(() => companies.id, { onDelete: "restrict" }),
}, (table) => [
  uniqueIndex("company_os_tenant_registration_slug_uq").on(table.slug)
    .where(sql`${table.status} <> 'EXPIRED'`),
  uniqueIndex("company_os_tenant_registration_binding_uq").on(table.identityBindingId),
  index("company_os_tenant_registration_status_expiry_idx").on(table.status, table.expiresAt),
]);

export const redeemedTenantSignupInvites = pgTable("company_os_tenant_signup_invite_redemption", {
  inviteDigest: text("invite_digest").primaryKey(),
  registrationId: text("registration_id").notNull()
    .references(() => tenantRegistrations.id, { onDelete: "restrict" }),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("company_os_tenant_signup_invite_registration_uq").on(table.registrationId),
]);

export const encryptedTenantSecrets = pgTable("company_os_encrypted_secret", {
  id: text("id").primaryKey(),
  ownerReference: text("owner_reference").notNull(),
  purpose: text("purpose").notNull(),
  algorithm: text("algorithm").notNull(),
  keyVersion: text("key_version").notNull(),
  nonce: text("nonce").notNull(),
  ciphertext: text("ciphertext").notNull(),
  authenticationTag: text("authentication_tag").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  index("company_os_encrypted_secret_owner_purpose_idx").on(table.ownerReference, table.purpose),
]);

export const identityBindings = pgTable("company_os_identity_binding", {
  id: text("id").primaryKey(),
  registrationId: text("registration_id").notNull()
    .references(() => tenantRegistrations.id, { onDelete: "restrict" }),
  companyId: text("company_id").references(() => companies.id, { onDelete: "restrict" }),
  providerFamily: text("provider_family").notNull(),
  providerKey: text("provider_key").notNull(),
  publicProviderId: text("public_provider_id").notNull(),
  externalTenantDigest: text("external_tenant_digest").notNull(),
  appId: text("app_id").notNull(),
  secretId: text("secret_id").notNull()
    .references(() => encryptedTenantSecrets.id, { onDelete: "restrict" }),
  status: text("status").notNull(),
  revision: integer("revision").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("company_os_identity_binding_registration_uq").on(table.registrationId),
  uniqueIndex("company_os_identity_binding_provider_id_uq").on(table.publicProviderId),
  uniqueIndex("company_os_identity_binding_app_id_uq").on(table.providerKey, table.appId),
  uniqueIndex("company_os_identity_binding_external_tenant_uq")
    .on(table.providerKey, table.externalTenantDigest),
  uniqueIndex("company_os_identity_binding_secret_uq").on(table.secretId),
]);

export const externalIdentities = pgTable("company_os_external_identity", {
  id: text("id").primaryKey(),
  bindingId: text("binding_id").notNull().references(() => identityBindings.id, { onDelete: "restrict" }),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  externalSubjectDigest: text("external_subject_digest").notNull(),
  externalTenantDigest: text("external_tenant_digest").notNull(),
  assertedEmailHmac: text("asserted_email_hmac"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("company_os_external_identity_binding_subject_uq")
    .on(table.bindingId, table.externalSubjectDigest),
  uniqueIndex("company_os_external_identity_binding_user_uq").on(table.bindingId, table.userId),
]);
