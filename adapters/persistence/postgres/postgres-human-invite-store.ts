import { createHash } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { CompanyDomainEvent } from "../../../core/control-plane.ts";
import type { HumanInvite } from "../../../core/human-invite.ts";
import type { HumanInviteStorePort } from "../../../ports/human-invite-store-port.ts";
import type { createCompanyDatabase } from "./company-database.ts";
import {
  companies,
  companyMemberships,
  domainEvents,
  humanInvites,
  principalPermissionGrants,
} from "./company-access-schema.ts";
import { authAccounts } from "./auth-schema.ts";
import { externalIdentities, identityBindings } from "./tenant-registration-schema.ts";

type CompanyDatabase = ReturnType<typeof createCompanyDatabase>["db"];

export class PostgresHumanInviteStore implements HumanInviteStorePort {
  readonly #database: CompanyDatabase;

  constructor(database: CompanyDatabase) { this.#database = database; }

  async create(input: Parameters<HumanInviteStorePort["create"]>[0]): Promise<HumanInvite> {
    const row = await this.#database.insert(humanInvites).values({
      id: input.invite.id,
      companyId: input.invite.companyId,
      tokenHash: input.tokenHash,
      expectedEmail: input.invite.expectedEmail,
      expectedEmailHmac: input.invite.expectedEmailHmac ?? null,
      departmentId: input.invite.departmentId,
      title: input.invite.title,
      membershipRole: input.invite.membershipRole,
      invitedByUserId: input.invite.invitedByUserId,
      expiresAt: new Date(input.invite.expiresAt),
    }).returning().then((rows) => rows[0]);
    if (!row) throw new Error("HUMAN_INVITE_CREATE_FAILED");
    return toInvite(row);
  }

  async findPendingByTokenHash(tokenHash: string, now: string): Promise<HumanInvite | null> {
    const row = await this.#database.select().from(humanInvites).where(and(
      eq(humanInvites.tokenHash, tokenHash),
      isNull(humanInvites.acceptedAt),
      isNull(humanInvites.revokedAt),
      gt(humanInvites.expiresAt, new Date(now)),
    )).then((rows) => rows[0] ?? null);
    return row ? toInvite(row) : null;
  }

  async acceptAtomically(
    input: Parameters<HumanInviteStorePort["acceptAtomically"]>[0],
  ): Promise<HumanInvite> {
    return this.#database.transaction(async (transaction) => {
      const invite = await transaction.select().from(humanInvites).where(and(
        eq(humanInvites.id, input.inviteId),
        eq(humanInvites.tokenHash, input.tokenHash),
      )).for("update").then((rows) => rows[0] ?? null);
      const acceptedAt = new Date(input.acceptedAt);
      if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= acceptedAt) {
        throw new Error("HUMAN_INVITE_NOT_FOUND");
      }
      const identityMatches = invite.expectedEmailHmac
        ? invite.expectedEmailHmac === input.assertedEmailHmac
        : invite.expectedEmail === input.normalizedEmail;
      if (!identityMatches) {
        throw new Error("HUMAN_INVITE_IDENTITY_MISMATCH");
      }
      if (invite.membershipRole !== input.role) throw new Error("HUMAN_INVITE_ROLE_MISMATCH");
      const existingMembership = await transaction.select({ id: companyMemberships.id })
        .from(companyMemberships).where(and(
          eq(companyMemberships.companyId, invite.companyId),
          eq(companyMemberships.principalType, "user"),
          eq(companyMemberships.principalId, input.userId),
        )).then((rows) => rows[0] ?? null);
      if (existingMembership) throw new Error("HUMAN_ALREADY_IN_COMPANY");

      const tenantBindings = await transaction.select({
        id: identityBindings.id,
        providerId: identityBindings.publicProviderId,
        externalTenantDigest: identityBindings.externalTenantDigest,
      }).from(identityBindings).where(and(
        eq(identityBindings.companyId, invite.companyId),
        eq(identityBindings.status, "active"),
      )).limit(2);
      if (tenantBindings.length > 1) throw new Error("TENANT_IDENTITY_BINDING_AMBIGUOUS");
      const tenantBinding = tenantBindings[0] ?? null;
      const externalAccount = tenantBinding
        ? await transaction.select({ accountId: authAccounts.accountId })
          .from(authAccounts).where(and(
            eq(authAccounts.userId, input.userId),
            eq(authAccounts.providerId, tenantBinding.providerId),
          )).limit(2).then((rows) => rows.length === 1 ? rows[0]! : null)
        : null;
      if (tenantBinding && !externalAccount) {
        throw new Error("TENANT_INVITE_IDENTITY_BINDING_MISMATCH");
      }

      await transaction.select({ id: companies.id }).from(companies)
        .where(eq(companies.id, invite.companyId)).for("update");
      const tail = await transaction.select({ sequence: domainEvents.sequence }).from(domainEvents)
        .where(eq(domainEvents.companyId, invite.companyId))
        .orderBy(desc(domainEvents.sequence)).limit(1)
        .then((rows) => rows[0]?.sequence ?? 0);
      if (tail !== input.expectedEventSequence) throw new Error("EVENT_SEQUENCE_CONFLICT");

      await transaction.insert(companyMemberships).values({
        id: input.membershipId, companyId: invite.companyId, principalType: "user",
        principalId: input.userId, status: "active", membershipRole: input.role,
      });
      if (input.grants.length) await transaction.insert(principalPermissionGrants).values(
        input.grants.map((grant) => ({
          id: grant.id, companyId: invite.companyId, principalType: "user",
          principalId: input.userId, permissionKey: grant.permissionKey, scope: null,
          grantedByUserId: invite.invitedByUserId,
        })),
      );
      if (tenantBinding && externalAccount) {
        await transaction.insert(externalIdentities).values({
          id: input.externalIdentityId,
          bindingId: tenantBinding.id,
          userId: input.userId,
          externalSubjectDigest: `sha256:${createHash("sha256")
            .update(externalAccount.accountId).digest("hex")}`,
          externalTenantDigest: tenantBinding.externalTenantDigest,
          assertedEmailHmac: input.assertedEmailHmac ?? null,
          verifiedAt: acceptedAt,
        });
      }
      await transaction.insert(domainEvents).values(eventRow(input.event, tail + 1));
      const accepted = await transaction.update(humanInvites).set({
        acceptedAt, acceptedByUserId: input.userId, updatedAt: acceptedAt,
      }).where(and(
        eq(humanInvites.id, invite.id), isNull(humanInvites.acceptedAt), isNull(humanInvites.revokedAt),
      )).returning().then((rows) => rows[0]);
      if (!accepted) throw new Error("HUMAN_INVITE_NOT_FOUND");
      return toInvite(accepted);
    });
  }
}

function eventRow(event: CompanyDomainEvent, sequence: number) {
  return {
    id: event.id, companyId: event.companyId, sequence, type: event.type,
    occurredAt: event.occurredAt, actorId: event.actorId, payload: event.payload,
    correlationId: event.correlationId, causationId: event.causationId,
    provenance: event.provenance,
  };
}

function toInvite(row: typeof humanInvites.$inferSelect): HumanInvite {
  return {
    id: row.id, companyId: row.companyId, expectedEmail: row.expectedEmail,
    expectedEmailHmac: row.expectedEmailHmac,
    departmentId: row.departmentId, title: row.title,
    membershipRole: row.membershipRole as HumanInvite["membershipRole"],
    invitedByUserId: row.invitedByUserId, expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

export function createPostgresHumanInviteStore(database: CompanyDatabase): HumanInviteStorePort {
  return new PostgresHumanInviteStore(database);
}
