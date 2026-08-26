import { validateCompanyStructure, type CompanyStructure } from "../core/company-structure.ts";
import { permissionKeysForHumanRole, type HumanCompanyRole } from "../core/company-access.ts";
import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";
import { humanInviteState, normalizeInviteEmail, type HumanInvite } from "../core/human-invite.ts";
import type { ResponsibilityContract } from "../core/responsibility.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { HumanInviteStorePort } from "../ports/human-invite-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

interface CreateHumanInviteDependencies {
  readonly identity: IdentityPort;
  readonly events: EventDataStorePort;
  readonly store: HumanInviteStorePort;
  readonly now: () => string;
  readonly nextId: () => Identifier;
  readonly issueToken: () => string;
  readonly hashToken: (token: string) => string;
}

interface AcceptHumanInviteDependencies {
  readonly events: EventDataStorePort;
  readonly store: HumanInviteStorePort;
  readonly now: () => string;
  readonly nextId: () => Identifier;
  readonly hashToken: (token: string) => string;
}

export class CreateHumanInvite {
  readonly #dependencies: CreateHumanInviteDependencies;

  constructor(dependencies: CreateHumanInviteDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(input: {
    readonly companyId: Identifier;
    readonly email: string;
    readonly departmentId: Identifier;
    readonly title: string;
    readonly role: HumanCompanyRole;
  }): Promise<{ readonly invite: HumanInvite; readonly token: string }> {
    const identity = await this.#dependencies.identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== input.companyId) throw new Error("TENANT_MISMATCH");
    const structure = latestStructure(await this.#dependencies.events.read(input.companyId));
    if (!structure.organization.departments.some(({ id }) => id === input.departmentId)) {
      throw new Error("DEPARTMENT_NOT_FOUND");
    }
    const title = input.title.trim();
    if (!title || [...title].length > 120) throw new Error("HUMAN_TITLE_INVALID");
    const receipt = await this.#dependencies.identity.authorize({
      companyId: input.companyId,
      action: "users:invite",
      resourceId: input.companyId,
      reason: "Invite an enterprise human to the company",
    });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    const token = this.#dependencies.issueToken();
    if (token.length < 32) throw new Error("HUMAN_INVITE_TOKEN_INVALID");
    const now = this.#dependencies.now();
    const invite: HumanInvite = {
      id: this.#dependencies.nextId(), companyId: input.companyId,
      expectedEmail: normalizeInviteEmail(input.email), departmentId: input.departmentId,
      title, membershipRole: input.role, invitedByUserId: identity.actorId,
      expiresAt: new Date(Date.parse(now) + 7 * 24 * 60 * 60 * 1000).toISOString(),
      acceptedAt: null, revokedAt: null,
    };
    return {
      invite: await this.#dependencies.store.create({
        invite,
        tokenHash: this.#dependencies.hashToken(token),
      }),
      token,
    };
  }
}

export class AcceptHumanInvite {
  readonly #dependencies: AcceptHumanInviteDependencies;

  constructor(dependencies: AcceptHumanInviteDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(input: {
    readonly token: string;
    readonly user: { readonly id: Identifier; readonly name: string; readonly email: string };
  }): Promise<HumanInvite> {
    const now = this.#dependencies.now();
    const tokenHash = this.#dependencies.hashToken(input.token);
    const invite = await this.#dependencies.store.findPendingByTokenHash(tokenHash, now);
    if (!invite || humanInviteState(invite, now) !== "PENDING") throw new Error("HUMAN_INVITE_NOT_FOUND");
    const email = normalizeInviteEmail(input.user.email);
    if (email !== invite.expectedEmail) throw new Error("HUMAN_INVITE_IDENTITY_MISMATCH");
    const events = await this.#dependencies.events.read(invite.companyId);
    const current = latestStructure(events);
    if (current.organization.humans.some(({ id }) => id === input.user.id)) {
      throw new Error("HUMAN_ALREADY_IN_ORGANIZATION");
    }
    const structure = validateCompanyStructure({
      ...current,
      organization: {
        ...current.organization,
        humans: [...current.organization.humans, {
          id: input.user.id, name: input.user.name, title: invite.title,
          departmentId: invite.departmentId, avatarId: "human-default",
        }],
      },
      positions: [...current.positions, {
        id: this.#dependencies.nextId(), title: invite.title, departmentId: invite.departmentId,
        principalId: input.user.id, accountableHumanId: input.user.id,
      }],
    });
    const event: CompanyDomainEvent = {
      id: this.#dependencies.nextId(), companyId: invite.companyId, type: "organization.revised",
      occurredAt: now, actorId: input.user.id,
      payload: {
        structure,
        responsibilitySnapshot: latestResponsibility(events),
        source: "human_invite_accept",
      },
      provenance: "PRODUCTION",
    };
    return this.#dependencies.store.acceptAtomically({
      inviteId: invite.id, tokenHash, userId: input.user.id, normalizedEmail: email,
      membershipId: this.#dependencies.nextId(), role: invite.membershipRole,
      grants: permissionKeysForHumanRole(invite.membershipRole).map((permissionKey) => ({
        id: this.#dependencies.nextId(), permissionKey,
      })),
      event, expectedEventSequence: events.length, acceptedAt: now,
    });
  }
}

function latestStructure(events: readonly CompanyDomainEvent[]): CompanyStructure {
  const event = events.filter(({ type }) =>
    type === "organization.registered" || type === "organization.revised").at(-1);
  const structure = event && (event.payload as { structure?: CompanyStructure }).structure;
  if (!structure) throw new Error("ORGANIZATION_NOT_FOUND");
  return validateCompanyStructure(structure);
}

function latestResponsibility(events: readonly CompanyDomainEvent[]): {
  readonly revision: number;
  readonly contracts: readonly ResponsibilityContract[];
} {
  for (const event of [...events].reverse()) {
    const value = event.type === "organization.revised"
      ? (event.payload as { responsibilitySnapshot?: { revision?: number; contracts?: ResponsibilityContract[] } }).responsibilitySnapshot
      : event.type === "responsibility.contracts.replaced"
        ? event.payload as { revision?: number; contracts?: ResponsibilityContract[] }
        : null;
    if (value && Number.isInteger(value.revision) && Array.isArray(value.contracts)) {
      return { revision: value.revision as number, contracts: structuredClone(value.contracts) };
    }
  }
  return { revision: 0, contracts: [] };
}
