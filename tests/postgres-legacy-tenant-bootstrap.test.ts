import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";

import { createCompanyDatabase } from "../adapters/persistence/postgres/company-database.ts";
import { createCompanyAccessDirectory } from
  "../adapters/persistence/postgres/company-access-directory.ts";
import { PostgresLegacyTenantBootstrapStore } from
  "../adapters/persistence/postgres/postgres-legacy-tenant-bootstrap-store.ts";
import { authAccounts, authUsers } from "../adapters/persistence/postgres/auth-schema.ts";
import { companies, companyMemberships } from
  "../adapters/persistence/postgres/company-access-schema.ts";
import { BootstrapLegacyTenantRoute } from "../application/bootstrap-legacy-tenant-route.ts";
import { createTenantSecretEnvelope } from "../adapters/security/tenant-secret-envelope.ts";
import { createIsolatedPostgresTestDatabase } from "./support/isolated-postgres-test-database.ts";

const connectionString = process.env.COMPANY_OS_TEST_DATABASE_URL?.trim();

function fixtureMaterial(label: string): string {
  return `${label}-fixture-material-`.padEnd(32, "x");
}

test("PostgreSQL legacy bootstrap requires the existing owner and is atomic and idempotent", {
  skip: connectionString ? false : "COMPANY_OS_TEST_DATABASE_URL is not configured",
}, async () => {
  const isolated = await createIsolatedPostgresTestDatabase(connectionString as string, "legacy_tenant_route");
  const database = createCompanyDatabase(isolated.connectionString);
  try {
    await database.migrate();
    const suffix = randomUUID();
    const ownerUserId = `owner-${suffix}`;
    const companyId = `company-${suffix}`;
    const now = new Date("2026-09-03T09:00:00.000Z");
    await database.db.insert(authUsers).values({
      id: ownerUserId, name: "Legacy owner", email: `${suffix}@example.test`, emailVerified: true,
      createdAt: now, updatedAt: now,
    });
    await database.db.insert(authAccounts).values({
      id: `account-${suffix}`, accountId: `union-${suffix}`, providerId: "feishu", userId: ownerUserId,
      createdAt: now, updatedAt: now,
    });
    await database.db.insert(companies).values({
      id: companyId, name: "Legacy company", purpose: "Existing production tenant", locale: "zh-CN",
      defaultResponsibleUserId: ownerUserId,
    });
    await database.db.insert(companyMemberships).values({
      id: `membership-${suffix}`, companyId, principalType: "user", principalId: ownerUserId,
      status: "active", membershipRole: "owner",
    });
    let sequence = 0;
    const store = new PostgresLegacyTenantBootstrapStore(database.db);
    const service = new BootstrapLegacyTenantRoute({
      verify: { async verify({ clientId }) { return {
        providerFamily: "OAUTH2", providerKey: "feishu", clientId,
        externalTenantDigest: `sha256:${"c".repeat(64)}`, tenantDisplayName: "Legacy company",
      }; } },
      envelope: createTenantSecretEnvelope({
        activeKeyVersion: "key-one", keys: new Map([["key-one", Buffer.alloc(32, 1)]]),
      }),
      store,
      nextId: () => `legacy-${++sequence}-${suffix}`,
      now: () => now.toISOString(),
    });
    const input = { companyId, ownerUserId, slug: `legacy-${suffix}`, appId: `cli_${suffix}`,
      appSecret: fixtureMaterial("legacy-feishu") };
    assert.equal((await service.preflight(input)).status, "READY");
    assert.equal(await store.inspect({
      companyId, ownerUserId: `wrong-${suffix}`, slug: input.slug, appId: input.appId,
      externalTenantDigest: `sha256:${"c".repeat(64)}`,
    }), "CONFLICT");
    const secondOwnerId = `second-owner-${suffix}`;
    const secondMembershipId = `second-membership-${suffix}`;
    await database.db.insert(authUsers).values({
      id: secondOwnerId, name: "Second owner", email: `second-${suffix}@example.test`,
      emailVerified: true, createdAt: now, updatedAt: now,
    });
    await database.db.insert(companyMemberships).values({
      id: secondMembershipId, companyId, principalType: "user", principalId: secondOwnerId,
      status: "active", membershipRole: "owner",
    });
    await assert.rejects(service.preflight(input), /LEGACY_TENANT_BOOTSTRAP_CONFLICT/);
    await database.db.delete(companyMemberships).where(eq(companyMemberships.id, secondMembershipId));
    assert.equal((await service.bootstrap(input)).status, "CREATED");
    assert.equal((await service.preflight(input)).status, "ALREADY_PRESENT");
    assert.equal((await service.bootstrap(input)).status, "ALREADY_PRESENT");
    assert.deepEqual(await createCompanyAccessDirectory(database.db).listRoutableForUser(ownerUserId), {
      schemaVersion: 1,
      companies: [{ id: companyId, name: "Legacy company", slug: input.slug, membershipRole: "owner" }],
      isInstanceAdmin: false,
    });

    await assert.rejects(service.bootstrap({ ...input, slug: `other-${suffix}` }),
      /LEGACY_TENANT_BOOTSTRAP_CONFLICT/);
  } finally {
    await database.close();
    await isolated.dispose();
  }
});
