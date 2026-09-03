import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-schema.ts";
import type { InstanceAcceptanceBinding } from "../../../core/instance-maintenance.ts";

export const companies = pgTable("company_os_company", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  purpose: text("purpose").notNull(),
  locale: text("locale").notNull(),
  defaultResponsibleUserId: text("default_responsible_user_id").notNull()
    .references(() => authUsers.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companyMemberships = pgTable("company_os_company_membership", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  principalType: text("principal_type").notNull(),
  principalId: text("principal_id").notNull(),
  status: text("status").notNull().default("active"),
  membershipRole: text("membership_role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("company_os_membership_company_principal_uq")
    .on(table.companyId, table.principalType, table.principalId),
  index("company_os_membership_principal_status_idx")
    .on(table.principalType, table.principalId, table.status),
  index("company_os_membership_company_status_idx").on(table.companyId, table.status),
]);

export const instanceUserRoles = pgTable("company_os_instance_user_role", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("instance_admin"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("company_os_instance_user_role_uq").on(table.userId, table.role),
  index("company_os_instance_user_role_role_idx").on(table.role),
]);

export const instanceMaintenance = pgTable("company_os_instance_maintenance", {
  id: text("id").primaryKey(),
  mode: text("mode").notNull(),
  revision: integer("revision").notNull(),
  operationId: text("operation_id").notNull(),
  authorizationReference: text("authorization_reference").notNull(),
  acceptanceBinding: jsonb("acceptance_binding").$type<InstanceAcceptanceBinding | null>(),
  changedByUserId: text("changed_by_user_id").notNull()
    .references(() => authUsers.id, { onDelete: "restrict" }),
  changedAt: text("changed_at").notNull(),
});

export const instanceMaintenanceEvents = pgTable("company_os_instance_maintenance_event", {
  id: text("id").primaryKey(),
  revision: integer("revision").notNull(),
  mode: text("mode").notNull(),
  operationId: text("operation_id").notNull(),
  authorizationReference: text("authorization_reference").notNull(),
  acceptanceBinding: jsonb("acceptance_binding").$type<InstanceAcceptanceBinding | null>(),
  changedByUserId: text("changed_by_user_id").notNull()
    .references(() => authUsers.id, { onDelete: "restrict" }),
  changedAt: text("changed_at").notNull(),
}, (table) => [
  uniqueIndex("company_os_instance_maintenance_event_revision_uq").on(table.revision),
]);

export const principalPermissionGrants = pgTable("company_os_principal_permission_grant", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  principalType: text("principal_type").notNull(),
  principalId: text("principal_id").notNull(),
  permissionKey: text("permission_key").notNull(),
  scope: jsonb("scope").$type<Record<string, unknown> | null>(),
  grantedByUserId: text("granted_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("company_os_principal_permission_uq")
    .on(table.companyId, table.principalType, table.principalId, table.permissionKey),
  index("company_os_principal_permission_company_key_idx")
    .on(table.companyId, table.permissionKey),
]);

export const humanInvites = pgTable("company_os_human_invite", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expectedEmail: text("expected_email").notNull(),
  expectedEmailHmac: text("expected_email_hmac"),
  departmentId: text("department_id").notNull(),
  title: text("title").notNull(),
  membershipRole: text("membership_role").notNull(),
  invitedByUserId: text("invited_by_user_id").notNull().references(() => authUsers.id, { onDelete: "restrict" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptedByUserId: text("accepted_by_user_id").references(() => authUsers.id, { onDelete: "restrict" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("company_os_human_invite_token_hash_uq").on(table.tokenHash),
  index("company_os_human_invite_company_state_idx")
    .on(table.companyId, table.acceptedAt, table.revokedAt, table.expiresAt),
]);

export const domainEvents = pgTable("company_os_domain_event", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  type: text("type").notNull(),
  occurredAt: text("occurred_at").notNull(),
  storedAt: timestamp("stored_at", { withTimezone: true }).notNull().defaultNow(),
  actorId: text("actor_id").notNull(),
  payload: jsonb("payload").notNull(),
  correlationId: text("correlation_id"),
  causationId: text("causation_id"),
  provenance: text("provenance").notNull(),
}, (table) => [
  uniqueIndex("company_os_domain_event_company_sequence_uq").on(table.companyId, table.sequence),
  index("company_os_domain_event_company_type_sequence_idx").on(table.companyId, table.type, table.sequence),
]);

export const connectorOutbox = pgTable("company_os_connector_outbox", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  topic: text("topic").notNull(),
  partitionKey: text("partition_key").notNull(),
  payload: jsonb("payload").notNull(),
  occurredAt: text("occurred_at").notNull(),
  status: text("status").notNull().default("PENDING"),
  deliveredAt: text("delivered_at"),
}, (table) => [
  uniqueIndex("company_os_connector_outbox_company_sequence_uq").on(table.companyId, table.sequence),
  index("company_os_connector_outbox_pending_idx").on(table.companyId, table.status, table.sequence),
]);

export const projectionCheckpoints = pgTable("company_os_projection_checkpoint", {
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  projectionName: text("projection_name").notNull(),
  eventSequence: integer("event_sequence").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ name: "company_os_projection_checkpoint_pk", columns: [table.companyId, table.projectionName] }),
]);
