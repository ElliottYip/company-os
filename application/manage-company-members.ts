import {
  COMPANY_MEMBERSHIP_STATUSES,
  HUMAN_COMPANY_ROLES,
  permissionKeysForHumanRole,
  type CompanyMembershipStatus,
  type HumanCompanyRole,
} from "../core/company-access.ts";
import type { CompanyStructure } from "../core/company-structure.ts";
import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";
import type { CompanyAccessStorePort, CompanyHumanMember } from "../ports/company-access-store-port.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

export class ManageCompanyMembers {
  readonly #identity: IdentityPort;
  readonly #events: EventDataStorePort;
  readonly #store: CompanyAccessStorePort;
  readonly #now: () => string;
  readonly #nextId: () => Identifier;

  constructor(dependencies: {
    readonly identity: IdentityPort;
    readonly events: EventDataStorePort;
    readonly store: CompanyAccessStorePort;
    readonly now: () => string;
    readonly nextId: () => Identifier;
  }) {
    this.#identity = dependencies.identity;
    this.#events = dependencies.events;
    this.#store = dependencies.store;
    this.#now = dependencies.now;
    this.#nextId = dependencies.nextId;
  }

  async update(input: {
    readonly companyId: Identifier;
    readonly userId: Identifier;
    readonly expectedRole: HumanCompanyRole;
    readonly expectedStatus: CompanyMembershipStatus;
    readonly role: HumanCompanyRole;
    readonly status: CompanyMembershipStatus;
  }): Promise<CompanyHumanMember> {
    if (!HUMAN_COMPANY_ROLES.includes(input.role) || !HUMAN_COMPANY_ROLES.includes(input.expectedRole) ||
        !COMPANY_MEMBERSHIP_STATUSES.includes(input.status) ||
        !COMPANY_MEMBERSHIP_STATUSES.includes(input.expectedStatus)) {
      throw new Error("COMPANY_MEMBERSHIP_COMMAND_INVALID");
    }
    if (input.status === "pending" || input.status === "archived") {
      throw new Error("COMPANY_MEMBERSHIP_STATUS_TRANSITION_INVALID");
    }
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== input.companyId) throw new Error("TENANT_MISMATCH");
    const receipt = await this.#identity.authorize({
      companyId: input.companyId,
      action: "users:manage_permissions",
      resourceId: input.userId,
      reason: "Change a company human membership role or access status",
    });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");

    const events = await this.#events.read(input.companyId);
    if (input.status === "suspended" && accountableAgentIds(events, input.userId).length) {
      throw new Error("ACCOUNTABLE_HUMAN_TRANSFER_REQUIRED");
    }
    const changedAt = this.#now();
    const event: CompanyDomainEvent = {
      id: this.#nextId(), companyId: input.companyId, type: "access.human-membership.changed",
      occurredAt: changedAt, actorId: identity.actorId, provenance: "PRODUCTION",
      payload: {
        userId: input.userId,
        previous: { role: input.expectedRole, status: input.expectedStatus },
        next: { role: input.role, status: input.status },
      },
    };
    return this.#store.updateCompanyHumanMembership({
      ...input,
      permissionGrants: permissionKeysForHumanRole(input.role).map((permissionKey) => ({
        id: this.#nextId(), permissionKey,
      })),
      grantedByUserId: identity.actorId,
      changedAt,
      event,
      expectedEventSequence: events.length,
    });
  }
}

function accountableAgentIds(events: readonly CompanyDomainEvent[], humanId: Identifier): readonly Identifier[] {
  const organizationEvent = events.filter(({ type }) =>
    type === "organization.registered" || type === "organization.revised").at(-1);
  const structure = (organizationEvent?.payload as { structure?: CompanyStructure } | undefined)?.structure;
  if (!structure) return [];
  return structure.organization.agents
    .filter(({ accountableHumanId }) => accountableHumanId === humanId)
    .map(({ id }) => id);
}
