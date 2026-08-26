import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getTableName } from "drizzle-orm";
import {
  companies,
  companyMemberships,
  connectorOutbox,
  domainEvents,
  humanInvites,
  instanceUserRoles,
  instanceMaintenance,
  instanceMaintenanceEvents,
  principalPermissionGrants,
  projectionCheckpoints,
} from "../adapters/persistence/postgres/company-access-schema.ts";

test("durable company access tables are Company OS-owned and Paperclip-independent", () => {
  assert.deepEqual([
    companies,
    companyMemberships,
    instanceUserRoles,
    instanceMaintenance,
    instanceMaintenanceEvents,
    principalPermissionGrants,
    humanInvites,
    domainEvents,
    connectorOutbox,
    projectionCheckpoints,
  ].map(getTableName), [
    "company_os_company",
    "company_os_company_membership",
    "company_os_instance_user_role",
    "company_os_instance_maintenance",
    "company_os_instance_maintenance_event",
    "company_os_principal_permission_grant",
    "company_os_human_invite",
    "company_os_domain_event",
    "company_os_connector_outbox",
    "company_os_projection_checkpoint",
  ]);
});

test("instance maintenance migration is additive, revisioned, and append-audited", async () => {
  const sql = await readFile(new URL(
    "../adapters/persistence/postgres/migrations/0006_instance_maintenance.sql",
    import.meta.url,
  ), "utf8");
  assert.match(sql, /company_os_instance_maintenance_singleton_ck/);
  assert.match(sql, /company_os_instance_maintenance_event_revision_uq/);
  assert.match(sql, /DISPATCH_FROZEN/);
  assert.match(sql, /authorization_reference/);
  assert.doesNotMatch(sql, /^\s*(?:DROP|TRUNCATE|DELETE\s+FROM)\b/im);
});

test("durable outbox migration preserves atomic delivery and replay contracts", async () => {
  const sql = await readFile(new URL(
    "../adapters/persistence/postgres/migrations/0005_durable_control_plane.sql",
    import.meta.url,
  ), "utf8");
  assert.match(sql, /company_os_connector_outbox_company_sequence_uq/);
  assert.match(sql, /company_os_connector_outbox_status_ck/);
  assert.match(sql, /company_os_connector_outbox_delivery_ck/);
  assert.match(sql, /company_os_projection_checkpoint_sequence_ck/);
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE)\b/i);
});

test("human invite migration stores only a token hash and constrains terminal states", async () => {
  const sql = await readFile(new URL(
    "../adapters/persistence/postgres/migrations/0004_human_invites.sql",
    import.meta.url,
  ), "utf8");
  assert.match(sql, /token_hash/);
  assert.doesNotMatch(sql, /"token"\s/);
  assert.match(sql, /human_invite_acceptance_ck/);
  assert.match(sql, /human_invite_terminal_ck/);
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE)\b/i);
});

test("domain event migration is append-only, tenant-sequenced, and production-reset safe by contract", async () => {
  const sql = await readFile(new URL(
    "../adapters/persistence/postgres/migrations/0003_domain_events.sql",
    import.meta.url,
  ), "utf8");
  assert.match(sql, /company_os_domain_event_company_sequence_uq/);
  assert.match(sql, /PRODUCTION/);
  assert.match(sql, /DEMO_FIXTURE/);
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE)\b/i);
});

test("company access migration constrains membership vocabulary and contains no destructive operation", async () => {
  const sql = await readFile(new URL(
    "../adapters/persistence/postgres/migrations/0002_company_access.sql",
    import.meta.url,
  ), "utf8");
  for (const value of ["pending", "active", "suspended", "archived", "owner", "admin", "operator", "viewer", "member"]) {
    assert.match(sql, new RegExp(`'${value}'`));
  }
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE)\b/i);
});
