import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import { createCompanyDatabase } from "../adapters/persistence/postgres/company-database.ts";
import { createCompanyAccessDirectory } from
  "../adapters/persistence/postgres/company-access-directory.ts";
import { authAccounts, authUsers } from "../adapters/persistence/postgres/auth-schema.ts";
import { companyMemberships, companies, instanceUserRoles } from
  "../adapters/persistence/postgres/company-access-schema.ts";
import {
  encryptedTenantSecrets,
  externalIdentities,
  identityBindings,
  redeemedTenantSignupInvites,
  tenantRegistrations,
} from "../adapters/persistence/postgres/tenant-registration-schema.ts";
import { PostgresTenantRegistrationStore } from
  "../adapters/persistence/postgres/postgres-tenant-registration-store.ts";
import { PostgresTenantAuthBindingSource } from
  "../adapters/persistence/postgres/postgres-tenant-auth-binding-source.ts";
import { PostgresTenantSaasCompletionStore } from
  "../adapters/persistence/postgres/postgres-tenant-saas-completion-store.ts";
import { PostgresTenantInviteIdentity } from
  "../adapters/persistence/postgres/postgres-tenant-invite-identity.ts";
import { createPostgresHumanInviteStore } from
  "../adapters/persistence/postgres/postgres-human-invite-store.ts";
import { CompleteTenantSaasRegistration } from
  "../application/complete-tenant-saas-registration.ts";
import { BeginTenantSaasRegistration } from "../application/begin-tenant-saas-registration.ts";
import { PostgresTenantSaasProvisioningStore } from
  "../adapters/persistence/postgres/postgres-tenant-saas-provisioning-store.ts";
import { createTenantSecretEnvelope } from "../adapters/security/tenant-secret-envelope.ts";
import { createTenantRegistration } from "../core/tenant-registration.ts";
import { createIsolatedPostgresTestDatabase } from "./support/isolated-postgres-test-database.ts";

test("multi-tenant registration migration is additive and constrains isolation-critical fields", async () => {
  const migration = await readFile(
    "adapters/persistence/postgres/migrations/0008_multi_tenant_registration.sql",
    "utf8",
  );
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE)\b/im);
  for (const table of [
    "company_os_tenant_registration",
    "company_os_encrypted_secret",
    "company_os_identity_binding",
    "company_os_external_identity",
  ]) assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  assert.match(migration, /company_os_tenant_registration_slug_uq/);
  assert.match(migration, /company_os_tenant_registration" \("slug"\) WHERE "status" <> 'EXPIRED'/);
  assert.match(migration, /company_os_identity_binding_provider_id_uq/);
  assert.match(migration, /company_os_identity_binding_app_id_uq/);
  assert.match(migration, /company_os_identity_binding_external_tenant_uq/);
  assert.match(migration, /company_os_external_identity_binding_subject_uq/);
  assert.match(migration, /company_os_auth_user_asserted_email_hmac_ck/);
  assert.match(migration, /company_os_human_invite_email_hmac_ck/);
  assert.match(migration, /AES-256-GCM/);
  assert.doesNotMatch(migration, /"(?:plaintext|client_secret)"/i);
});

test("tenant signup invite migration stores only one-use HMAC redemptions", async () => {
  const migration = await readFile(
    "adapters/persistence/postgres/migrations/0009_tenant_signup_invites.sql",
    "utf8",
  );
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE)\b/im);
  assert.match(migration, /CREATE TABLE "company_os_tenant_signup_invite_redemption"/);
  assert.match(migration, /"invite_digest" text PRIMARY KEY/);
  assert.match(migration, /hmac-sha256/);
  assert.doesNotMatch(migration, /invite_code|plaintext/i);
});

const connectionString = process.env.COMPANY_OS_TEST_DATABASE_URL?.trim();

function fixtureMaterial(label: string): string {
  return `${label}-fixture-material-`.padEnd(32, "x");
}

test("PostgreSQL atomically persists registration revisions and tenant-isolated identity records", {
  skip: connectionString ? false : "COMPANY_OS_TEST_DATABASE_URL is not configured",
}, async () => {
  const isolated = await createIsolatedPostgresTestDatabase(
    connectionString as string,
    "tenant_registration",
  );
  const database = createCompanyDatabase(isolated.connectionString);
  try {
    await database.migrate();
    await database.checkSchema();
    const suffix = randomUUID();
    let provisionSequence = 0;
    let provisionNow = "2026-09-03T05:00:00.000Z";
    const provisionEnvelope = createTenantSecretEnvelope({
      activeKeyVersion: "key-one", keys: new Map([["key-one", Buffer.alloc(32, 8)]]),
    });
    const provision = new BeginTenantSaasRegistration({
      verify: { async verify({ clientId }) { return {
        providerFamily: "OAUTH2", providerKey: "feishu", clientId,
        externalTenantDigest: `sha256:${"e".repeat(64)}`, tenantDisplayName: "Provisioned tenant",
      }; } },
      envelope: provisionEnvelope,
      store: new PostgresTenantSaasProvisioningStore(database.db),
      nextId: () => `provision-${++provisionSequence}-${suffix}`,
      now: () => provisionNow,
    });
    const provisionSecret = fixtureMaterial("postgres-feishu");
    const provisioned = await provision.begin({
      slug: `provisioned-${suffix}`, companyName: "Provisioned tenant",
      appId: `cli-provisioned-${suffix}`, appSecret: provisionSecret,
      signupInviteDigest: `hmac-sha256:${"1".repeat(64)}`,
    });
    assert.equal((await database.db.select().from(redeemedTenantSignupInvites)).length, 1);
    await assert.rejects(provision.begin({
      slug: `invite-reuse-${suffix.slice(0, 8)}`, companyName: "Invite reuse",
      appId: `cli-invite-reuse-${suffix}`, appSecret: provisionSecret,
      signupInviteDigest: `hmac-sha256:${"1".repeat(64)}`,
    }), /TENANT_SIGNUP_NOT_ALLOWED/);
    assert.equal((await database.db.select().from(redeemedTenantSignupInvites)).length, 1);
    const provisionedMaterial = await new PostgresTenantAuthBindingSource(database.db)
      .findBySlug(provisioned.slug);
    assert.equal(provisionedMaterial?.providerId, provisioned.providerId);
    assert.equal(provisionEnvelope.open(provisionedMaterial!.secret, {
      ownerReference: provisionedMaterial!.bindingId,
      purpose: "IDENTITY_PROVIDER_CLIENT_SECRET",
    }), provisionSecret);
    await assert.rejects(provision.begin({
      slug: provisioned.slug, companyName: "Duplicate tenant",
      appId: `cli-duplicate-${suffix}`, appSecret: provisionSecret,
    }), /TENANT_REGISTRATION_CONFLICT/);
    provisionNow = "2026-09-03T05:16:00.000Z";
    const reprovisioned = await provision.begin({
      slug: provisioned.slug, companyName: "Provisioned tenant retry",
      appId: `cli-provisioned-${suffix}`, appSecret: provisionSecret,
    });
    assert.notEqual(reprovisioned.id, provisioned.id);
    const expiredRegistration = await database.db.select({ status: tenantRegistrations.status })
      .from(tenantRegistrations).where(eq(tenantRegistrations.id, provisioned.id));
    assert.equal(expiredRegistration[0]?.status, "EXPIRED");
    assert.equal((await database.db.select().from(identityBindings)).length, 1);
    assert.equal((await database.db.select().from(encryptedTenantSecrets)).length, 1);
    assert.equal((await new PostgresTenantAuthBindingSource(database.db)
      .findBySlug(reprovisioned.slug))?.providerId, reprovisioned.providerId);
    const registrationId = `registration-${suffix}`;
    const bindingId = `binding-${suffix}`;
    const secretId = `secret-${suffix}`;
    const store = new PostgresTenantRegistrationStore(database.db);
    const pending = createTenantRegistration({
      id: registrationId,
      mode: "SHARED_SAAS",
      slug: `tenant-${suffix}`,
      companyName: "Tenant fixture",
      requestedBy: `signup-${suffix}`,
      identityBindingId: bindingId,
      now: "2026-09-03T05:00:00.000Z",
    });
    assert.equal(await store.create(pending), "CREATED");
    assert.equal(await store.create({ ...pending, id: `duplicate-${suffix}` }), "SLUG_TAKEN");
    assert.deepEqual(await store.findById(registrationId), pending);
    assert.equal(await store.replace({ expectedRevision: 9, record: { ...pending, revision: 2 } }), "CONFLICT");
    assert.equal(await store.replace({ expectedRevision: 1, record: { ...pending, revision: 2 } }), "UPDATED");
    assert.equal((await store.findById(registrationId))?.revision, 2);

    await database.db.insert(encryptedTenantSecrets).values({
      id: secretId,
      ownerReference: bindingId,
      purpose: "IDENTITY_PROVIDER_CLIENT_SECRET",
      algorithm: "AES-256-GCM",
      keyVersion: "key-one",
      nonce: "AQEBAQEBAQEBAQEB",
      ciphertext: "AgICAgICAgICAgIC",
      authenticationTag: "AwMDAwMDAwMDAwMDAwMDAw",
      createdAt: new Date("2026-09-03T05:00:00.000Z"),
    });
    await database.db.insert(identityBindings).values({
      id: bindingId,
      registrationId,
      companyId: null,
      providerFamily: "OAUTH2",
      providerKey: "feishu",
      publicProviderId: `feishu-${suffix}`,
      externalTenantDigest: `sha256:${"a".repeat(64)}`,
      appId: `cli-${suffix}`,
      secretId,
      status: "pending",
      revision: 1,
      createdAt: new Date("2026-09-03T05:00:00.000Z"),
      updatedAt: new Date("2026-09-03T05:00:00.000Z"),
    });
    const authBindingSource = new PostgresTenantAuthBindingSource(database.db);
    const bySlug = await authBindingSource.findBySlug(pending.slug);
    const byProvider = await authBindingSource.findByProviderId(`feishu-${suffix}`);
    assert.equal(bySlug?.bindingId, bindingId);
    assert.deepEqual(byProvider, bySlug);
    assert.equal(bySlug?.secret.ownerReference, bindingId);
    assert.doesNotMatch(JSON.stringify(bySlug), /plaintext/i);
    const userId = `user-${suffix}`;
    await database.db.insert(authUsers).values({
      id: userId,
      name: "Tenant fixture user",
      email: `${suffix}@identity.invalid`,
      emailVerified: true,
      assertedEmailHmac: `hmac-sha256:${"e".repeat(64)}`,
      image: null,
      createdAt: new Date("2026-09-03T05:00:00.000Z"),
      updatedAt: new Date("2026-09-03T05:00:00.000Z"),
    });
    await database.db.insert(authAccounts).values({
      id: `account-${suffix}`,
      accountId: `union-${suffix}`,
      providerId: `feishu-${suffix}`,
      userId,
      createdAt: new Date("2026-09-03T05:00:00.000Z"),
      updatedAt: new Date("2026-09-03T05:00:00.000Z"),
    });
    let completionSequence = 0;
    const completion = new CompleteTenantSaasRegistration({
      store: new PostgresTenantSaasCompletionStore(database.db),
      nextId: () => `completion-${++completionSequence}-${suffix}`,
      now: () => "2026-09-03T05:05:00.000Z",
    });
    const concurrent = await Promise.all([
      completion.complete({ registrationId, verifiedUserId: userId }),
      completion.complete({ registrationId, verifiedUserId: userId }),
    ]);
    assert.deepEqual(concurrent.map(({ status }) => status).sort(),
      ["ALREADY_COMPLETED", "COMPLETED"]);
    assert.equal((await database.db.select().from(companies)).length, 1);
    assert.equal((await database.db.select().from(companyMemberships))[0]?.membershipRole, "owner");
    assert.deepEqual(await createCompanyAccessDirectory(database.db).listRoutableForUser(userId), {
      schemaVersion: 1,
      companies: [{
        id: concurrent[0]!.companyId,
        name: "Tenant fixture",
        slug: pending.slug,
        membershipRole: "owner",
      }],
      isInstanceAdmin: false,
    });
    const identities = await database.db.select().from(externalIdentities);
    assert.equal(identities.length, 1);
    assert.equal(identities[0]?.assertedEmailHmac, `hmac-sha256:${"e".repeat(64)}`);
    const inviteIdentity = new PostgresTenantInviteIdentity(database.db, Buffer.alloc(32, 8));
    assert.match(await inviteIdentity.expectedEmailHmac(
      concurrent[0]!.companyId, "tenant-human@example.test",
    ) ?? "", /^hmac-sha256:[a-f0-9]{64}$/);
    assert.equal(await inviteIdentity.assertedEmailHmac(userId), `hmac-sha256:${"e".repeat(64)}`);
    const memberUserId = `member-${suffix}`;
    await database.db.insert(authUsers).values({
      id: memberUserId, name: "Tenant member", email: `member-${suffix}@identity.invalid`,
      emailVerified: true, assertedEmailHmac: `hmac-sha256:${"f".repeat(64)}`, image: null,
      createdAt: new Date("2026-09-03T05:06:00.000Z"),
      updatedAt: new Date("2026-09-03T05:06:00.000Z"),
    });
    await database.db.insert(authAccounts).values({
      id: `member-account-${suffix}`, accountId: `member-union-${suffix}`,
      providerId: `feishu-${suffix}`, userId: memberUserId,
      createdAt: new Date("2026-09-03T05:06:00.000Z"),
      updatedAt: new Date("2026-09-03T05:06:00.000Z"),
    });
    await assert.rejects(completion.complete({ registrationId, verifiedUserId: memberUserId }),
      /TENANT_MEMBERSHIP_REQUIRED/);
    const inviteStore = createPostgresHumanInviteStore(database.db);
    const inviteId = `invite-${suffix}`;
    const tokenHash = `sha256:${"9".repeat(64)}`;
    await inviteStore.create({
      tokenHash,
      invite: {
        id: inviteId,
        companyId: concurrent[0]!.companyId,
        expectedEmail: "tenant-member@example.test",
        expectedEmailHmac: `hmac-sha256:${"f".repeat(64)}`,
        departmentId: `department-${suffix}`,
        title: "Tenant operator",
        membershipRole: "operator",
        invitedByUserId: userId,
        expiresAt: "2026-09-10T05:06:00.000Z",
        acceptedAt: null,
        revokedAt: null,
      },
    });
    await inviteStore.acceptAtomically({
      inviteId,
      tokenHash,
      userId: memberUserId,
      normalizedEmail: "tenant-member@example.test",
      assertedEmailHmac: `hmac-sha256:${"f".repeat(64)}`,
      membershipId: `member-membership-${suffix}`,
      externalIdentityId: `member-external-identity-${suffix}`,
      role: "operator",
      grants: [],
      event: {
        id: `member-event-${suffix}`,
        companyId: concurrent[0]!.companyId,
        type: "organization.revised",
        occurredAt: "2026-09-03T05:07:00.000Z",
        actorId: memberUserId,
        payload: { source: "tenant_invite_test" },
        provenance: "PRODUCTION",
      },
      expectedEventSequence: 1,
      acceptedAt: "2026-09-03T05:07:00.000Z",
    });
    const invitedIdentities = await database.db.select().from(externalIdentities);
    assert.equal(invitedIdentities.length, 2);
    assert.equal(invitedIdentities.find(({ userId: identityUserId }) =>
      identityUserId === memberUserId)?.bindingId, bindingId);
    assert.equal(invitedIdentities.find(({ userId: identityUserId }) =>
      identityUserId === memberUserId)?.assertedEmailHmac, `hmac-sha256:${"f".repeat(64)}`);
    assert.equal((await completion.complete({ registrationId, verifiedUserId: memberUserId })).status,
      "ALREADY_COMPLETED");
    const otherTenantUserId = `other-tenant-user-${suffix}`;
    await database.db.insert(authUsers).values({
      id: otherTenantUserId, name: "Other tenant user",
      email: `other-${suffix}@identity.invalid`, emailVerified: true,
      assertedEmailHmac: `hmac-sha256:${"b".repeat(64)}`, image: null,
      createdAt: new Date("2026-09-03T05:08:00.000Z"),
      updatedAt: new Date("2026-09-03T05:08:00.000Z"),
    });
    await database.db.insert(authAccounts).values({
      id: `other-tenant-account-${suffix}`, accountId: `other-union-${suffix}`,
      providerId: `feishu-other-${suffix}`, userId: otherTenantUserId,
      createdAt: new Date("2026-09-03T05:08:00.000Z"),
      updatedAt: new Date("2026-09-03T05:08:00.000Z"),
    });
    const crossTenantInviteId = `cross-tenant-invite-${suffix}`;
    const crossTenantTokenHash = `sha256:${"8".repeat(64)}`;
    await inviteStore.create({
      tokenHash: crossTenantTokenHash,
      invite: {
        id: crossTenantInviteId,
        companyId: concurrent[0]!.companyId,
        expectedEmail: "other-tenant@example.test",
        expectedEmailHmac: `hmac-sha256:${"b".repeat(64)}`,
        departmentId: `department-${suffix}`,
        title: "Cross-tenant attacker",
        membershipRole: "viewer",
        invitedByUserId: userId,
        expiresAt: "2026-09-10T05:08:00.000Z",
        acceptedAt: null,
        revokedAt: null,
      },
    });
    await assert.rejects(inviteStore.acceptAtomically({
      inviteId: crossTenantInviteId,
      tokenHash: crossTenantTokenHash,
      userId: otherTenantUserId,
      normalizedEmail: "other-tenant@example.test",
      assertedEmailHmac: `hmac-sha256:${"b".repeat(64)}`,
      membershipId: `cross-tenant-membership-${suffix}`,
      externalIdentityId: `cross-tenant-external-identity-${suffix}`,
      role: "viewer",
      grants: [],
      event: {
        id: `cross-tenant-event-${suffix}`,
        companyId: concurrent[0]!.companyId,
        type: "organization.revised",
        occurredAt: "2026-09-03T05:09:00.000Z",
        actorId: otherTenantUserId,
        payload: { source: "cross_tenant_invite_test" },
        provenance: "PRODUCTION",
      },
      expectedEventSequence: 2,
      acceptedAt: "2026-09-03T05:09:00.000Z",
    }), /TENANT_INVITE_IDENTITY_BINDING_MISMATCH/);
    assert.equal((await database.db.select().from(companyMemberships)).length, 2);
    assert.equal((await database.db.select().from(externalIdentities)).length, 2);
    assert.equal((await database.db.select().from(instanceUserRoles)).length, 0);
    await assert.rejects(database.db.insert(identityBindings).values({
      id: `binding-duplicate-${suffix}`,
      registrationId,
      companyId: null,
      providerFamily: "OAUTH2",
      providerKey: "feishu",
      publicProviderId: `feishu-other-${suffix}`,
      externalTenantDigest: `sha256:${"d".repeat(64)}`,
      appId: `cli-${suffix}`,
      secretId,
      status: "pending",
      revision: 1,
      createdAt: new Date("2026-09-03T05:00:00.000Z"),
      updatedAt: new Date("2026-09-03T05:00:00.000Z"),
    }));
  } finally {
    await database.close();
    await isolated.dispose();
  }
});
