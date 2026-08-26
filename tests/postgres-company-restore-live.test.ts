import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { authUsers } from "../adapters/persistence/postgres/auth-schema.ts";
import { createCompanyAccessDirectory } from "../adapters/persistence/postgres/company-access-directory.ts";
import { createCompanyDatabase } from "../adapters/persistence/postgres/company-database.ts";
import { PostgresCompanyRestoreStore } from "../adapters/persistence/postgres/postgres-company-restore-store.ts";
import { createPostgresCompanyAccessStore } from "../adapters/persistence/postgres/postgres-company-access-store.ts";
import { PostgresEventStore } from "../adapters/persistence/postgres/postgres-event-store.ts";
import { OWNER_DEFAULT_PERMISSION_KEYS } from "../core/company-access.ts";
import type { CompanyStructure } from "../core/company-structure.ts";
import { createIsolatedPostgresTestDatabase } from "./support/isolated-postgres-test-database.ts";

const connectionString = process.env.COMPANY_OS_TEST_DATABASE_URL?.trim();

test("live PostgreSQL restores a formal company backup into a clean directory atomically", {
  skip: connectionString ? false : "COMPANY_OS_TEST_DATABASE_URL is not configured",
}, async () => {
  const sourceFixture = await createIsolatedPostgresTestDatabase(connectionString as string, "restore_source");
  const targetFixture = await createIsolatedPostgresTestDatabase(connectionString as string, "restore_target");
  const source = createCompanyDatabase(sourceFixture.connectionString);
  const target = createCompanyDatabase(targetFixture.connectionString);
  try {
    await Promise.all([source.migrate(), target.migrate()]);
    const suffix = randomUUID();
    const companyId = `company-${suffix}`;
    const userId = `human-${suffix}`;
    const now = new Date();
    const user = {
      id: userId, name: "Restore owner", email: `${suffix}@restore.invalid`, emailVerified: true,
      image: null, createdAt: now, updatedAt: now,
    };
    await Promise.all([source.db.insert(authUsers).values(user), target.db.insert(authUsers).values(user)]);
    const sourceAccess = createPostgresCompanyAccessStore(source.db);
    const targetAccess = createPostgresCompanyAccessStore(target.db);
    await sourceAccess.claimFirstInstanceAdmin({ roleId: `source-admin-${suffix}`, userId });
    await targetAccess.claimFirstInstanceAdmin({ roleId: `target-admin-${suffix}`, userId });
    await sourceAccess.createOwnedCompany({
      companyId, membershipId: `source-membership-${suffix}`, permissionGrants: [], ownerUserId: userId,
      name: "Restorable company", purpose: "Prove atomic portability", locale: "en-US",
    });
    const structure: CompanyStructure = {
      organization: {
        company: { id: companyId, name: "Restorable company", purpose: "Prove atomic portability", locale: "en-US" },
        departments: [{ id: "operations", name: "Operations", mandate: "Operate safely" }],
        humans: [{ id: userId, name: "Restore owner", title: "Owner", departmentId: "operations", avatarId: "human-default" }],
        agents: [],
      },
      projects: [],
      workspaces: [{ id: "operations-workspace", name: "Operations", projectId: null, departmentId: "operations" }],
      positions: [{ id: "owner-position", title: "Owner", departmentId: "operations", principalId: userId, accountableHumanId: userId }],
      reportingLines: [],
    };
    const sourceEvents = new PostgresEventStore(source.db);
    await sourceEvents.append({
      id: `organization-${suffix}`, companyId, type: "organization.registered", occurredAt: now.toISOString(),
      actorId: userId, payload: { structure }, provenance: "PRODUCTION",
    }, 0);
    const backup = await sourceEvents.exportBackup(companyId);
    const restore = new PostgresCompanyRestoreStore(target.db);
    const inspection = await restore.inspectOwnedCompanyRestore({ source: backup, actorUserId: userId });
    assert.equal(inspection.identityBinding, "EXACT");
    assert.equal(inspection.companyId, companyId);
    assert.equal(inspection.eventCount, 1);
    assert.equal((await createCompanyAccessDirectory(target.db).listForUser(userId)).companies.length, 0);
    const restored = await restore.restoreOwnedCompany({
      source: backup, actorUserId: userId, membershipId: `target-membership-${suffix}`,
      permissionGrants: OWNER_DEFAULT_PERMISSION_KEYS.map((permissionKey, index) => ({
        id: `target-grant-${index}-${suffix}`, permissionKey,
      })),
    });

    assert.equal(restored.companyId, companyId);
    assert.equal(restored.ownerUserId, userId);
    assert.equal(restored.permissionGrantIds.length, OWNER_DEFAULT_PERMISSION_KEYS.length);
    assert.equal((await createCompanyAccessDirectory(target.db).listForUser(userId)).companies[0]?.id, companyId);
    assert.deepEqual(await new PostgresEventStore(target.db).read(companyId), await sourceEvents.read(companyId));
    await assert.rejects(restore.restoreOwnedCompany({
      source: backup, actorUserId: userId, membershipId: `duplicate-membership-${suffix}`,
      permissionGrants: [],
    }), /RESTORE_COMPANY_ALREADY_EXISTS/);
  } finally {
    await Promise.all([source.close(), target.close()]);
    await Promise.all([sourceFixture.dispose(), targetFixture.dispose()]);
  }
});
