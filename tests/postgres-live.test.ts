import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { authUsers } from "../adapters/persistence/postgres/auth-schema.ts";
import { companies, companyMemberships } from "../adapters/persistence/postgres/company-access-schema.ts";
import { eq } from "drizzle-orm";
import { createCompanyAccessDirectory } from "../adapters/persistence/postgres/company-access-directory.ts";
import { createCompanyDatabase } from "../adapters/persistence/postgres/company-database.ts";
import { createPostgresCompanyAccessStore } from "../adapters/persistence/postgres/postgres-company-access-store.ts";
import { PostgresEventStore } from "../adapters/persistence/postgres/postgres-event-store.ts";
import type { CompanyDomainEvent } from "../core/control-plane.ts";
import { createIsolatedPostgresTestDatabase } from "./support/isolated-postgres-test-database.ts";

const connectionString = process.env.COMPANY_OS_TEST_DATABASE_URL?.trim();

function event(
  companyId: string,
  actorId: string,
  provenance: CompanyDomainEvent["provenance"],
): CompanyDomainEvent {
  return {
    id: `event-${randomUUID()}`,
    companyId,
    type: "company.integration.recorded",
    occurredAt: new Date().toISOString(),
    actorId,
    payload: { schemaVersion: 1, purpose: "live-postgres-admission" },
    provenance,
  };
}

test("live PostgreSQL migrates idempotently and preserves tenant data across adapter restart", {
  skip: connectionString ? false : "COMPANY_OS_TEST_DATABASE_URL is not configured",
}, async () => {
  const isolatedDatabase = await createIsolatedPostgresTestDatabase(
    connectionString as string,
    "postgres_live",
  );
  const source = isolatedDatabase.connectionString;
  let database = createCompanyDatabase(source);
  try {
    const competingMigrator = createCompanyDatabase(source);
    try {
      await Promise.all([database.migrate(), competingMigrator.migrate()]);
    } finally {
      await competingMigrator.close();
    }
    await database.migrate();
    await database.ping();
    await database.checkSchema();

    const suffix = randomUUID();
    const userId = `user-${suffix}`;
    const firstCompanyId = `company-a-${suffix}`;
    const secondCompanyId = `company-b-${suffix}`;
    const restoreCompanyId = `company-c-${suffix}`;
    const now = new Date();
    await database.db.insert(authUsers).values({
      id: userId,
      name: "PostgreSQL admission owner",
      email: `${suffix}@integration.invalid`,
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    });
    const outsiderId = `outsider-${suffix}`;
    await database.db.insert(authUsers).values({
      id: outsiderId,
      name: "Tenant outsider",
      email: `outsider-${suffix}@integration.invalid`,
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    });

    const access = createPostgresCompanyAccessStore(database.db);
    assert.deepEqual(await access.claimFirstInstanceAdmin({
      roleId: `role-${suffix}`,
      userId,
    }), { status: "CLAIMED", userId });
    for (const [companyId, label] of [
      [firstCompanyId, "Source"],
      [secondCompanyId, "Tenant isolation"],
      [restoreCompanyId, "Restore"],
    ] as const) {
      await access.createOwnedCompany({
        companyId,
        membershipId: `membership-${label.toLocaleLowerCase().replaceAll(" ", "-")}-${suffix}`,
        permissionGrants: [],
        ownerUserId: userId,
        name: `${label} company`,
        purpose: "Live PostgreSQL admission",
        locale: "en-US",
      });
    }
    const directory = createCompanyAccessDirectory(database.db);
    assert.equal((await directory.listForUser(userId)).companies.length, 3);
    assert.deepEqual(await directory.listForUser(outsiderId), {
      schemaVersion: 1,
      companies: [],
      isInstanceAdmin: false,
    });
    assert.equal(await directory.getForUser(outsiderId, firstCompanyId), null);
    assert.deepEqual((await access.listCompanyHumanMembers(firstCompanyId)).map((member) => ({
      userId: member.userId,
      displayName: member.displayName,
      email: member.email,
      role: member.role,
      status: member.status,
    })), [{
      userId,
      displayName: "PostgreSQL admission owner",
      email: `${suffix}@integration.invalid`,
      role: "owner",
      status: "active",
    }]);

    const store = new PostgresEventStore(database.db);
    const productionEvent = event(firstCompanyId, userId, "PRODUCTION");
    await store.append(productionEvent, 0);
    assert.equal((await store.read(secondCompanyId)).length, 0);
    const blockedMembershipEvent = event(firstCompanyId, userId, "PRODUCTION");
    await assert.rejects(access.updateCompanyHumanMembership({
      companyId: firstCompanyId, userId, expectedRole: "owner", expectedStatus: "active",
      role: "admin", status: "active", permissionGrants: [], grantedByUserId: userId,
      changedAt: new Date().toISOString(), event: blockedMembershipEvent, expectedEventSequence: 1,
    }), /LAST_ACTIVE_OWNER_REQUIRED/);
    await database.db.insert(companyMemberships).values({
      id: `membership-second-owner-${suffix}`, companyId: firstCompanyId,
      principalType: "user", principalId: outsiderId, status: "active", membershipRole: "owner",
    });
    const membershipEvent = event(firstCompanyId, userId, "PRODUCTION");
    const changedMember = await access.updateCompanyHumanMembership({
      companyId: firstCompanyId, userId, expectedRole: "owner", expectedStatus: "active",
      role: "admin", status: "active", permissionGrants: [], grantedByUserId: outsiderId,
      changedAt: new Date().toISOString(), event: membershipEvent, expectedEventSequence: 1,
    });
    assert.equal(changedMember.role, "admin");
    assert.deepEqual(await store.read(firstCompanyId), [productionEvent, membershipEvent]);

    const profileEvent = { ...event(firstCompanyId, userId, "PRODUCTION"),
      type: "organization.revised", payload: { schemaVersion: 1, source: "company_profile" } };
    await access.updateCompanyProfileAtomically({ companyId: firstCompanyId,
      expected: { name: "Source company", purpose: "Live PostgreSQL admission", locale: "en-US" },
      next: { name: "Source company renamed", purpose: "Live PostgreSQL admission", locale: "en-US" },
      event: profileEvent, expectedEventSequence: 2,
    });
    assert.equal((await directory.listForUser(userId)).companies
      .find(({ id }) => id === firstCompanyId)?.name, "Source company renamed");
    assert.deepEqual(await store.read(firstCompanyId), [productionEvent, membershipEvent, profileEvent]);
    await assert.rejects(access.updateCompanyProfileAtomically({ companyId: firstCompanyId,
      expected: { name: "Source company", purpose: "Live PostgreSQL admission", locale: "en-US" },
      next: { name: "Stale overwrite", purpose: "Live PostgreSQL admission", locale: "en-US" },
      event: event(firstCompanyId, userId, "PRODUCTION"), expectedEventSequence: 3,
    }), /COMPANY_PROFILE_REVISION_CONFLICT/);

    const restorableEvent = event(restoreCompanyId, userId, "DEMO_FIXTURE");
    await store.append(restorableEvent, 0);
    const backup = await store.exportBackup(restoreCompanyId);
    await store.resetFixture(restoreCompanyId);
    assert.equal((await store.read(restoreCompanyId)).length, 0);
    await store.restoreBackup(restoreCompanyId, backup);
    assert.deepEqual(await store.read(restoreCompanyId), [restorableEvent]);

    const closureBackup = JSON.parse(await store.exportBackup(secondCompanyId)) as { digest: string };
    const archivedAt = new Date().toISOString();
    const closureEvent: CompanyDomainEvent = {
      id: `event-close-${suffix}`, companyId: secondCompanyId, type: "company.lifecycle.archived",
      occurredAt: archivedAt, actorId: userId, provenance: "PRODUCTION",
      payload: { exportDigest: closureBackup.digest, retentionPolicyId: "standard-retention" },
    };
    await access.archiveCompanyAtomically({ companyId: secondCompanyId, actorUserId: userId,
      expectedStatus: "active", exportDigest: closureBackup.digest,
      retentionPolicyId: "standard-retention", archivedAt,
      event: closureEvent, expectedEventSequence: 0 });
    assert.equal((await directory.listForUser(userId)).companies.some(({ id }) => id === secondCompanyId), false);
    assert.equal((await database.db.select({ status: companies.status }).from(companies)
      .where(eq(companies.id, secondCompanyId)))[0]?.status, "archived");
    assert.equal((await database.db.select({ status: companyMemberships.status }).from(companyMemberships)
      .where(eq(companyMemberships.companyId, secondCompanyId)))[0]?.status, "archived");
    assert.deepEqual(await store.read(secondCompanyId), [closureEvent]);

    await database.close();
    database = createCompanyDatabase(source);
    await database.ping();
    await database.checkSchema();
    assert.deepEqual(await new PostgresEventStore(database.db).read(firstCompanyId),
      [productionEvent, membershipEvent, profileEvent]);
  } finally {
    await database.close();
    await isolatedDatabase.dispose();
  }
});
