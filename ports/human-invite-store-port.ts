import type { CompanyPermissionKey, HumanCompanyRole } from "../core/company-access.ts";
import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";
import type { HumanInvite } from "../core/human-invite.ts";

export interface HumanInviteStorePort {
  create(input: { readonly invite: HumanInvite; readonly tokenHash: string }): Promise<HumanInvite>;
  findPendingByTokenHash(tokenHash: string, now: string): Promise<HumanInvite | null>;
  acceptAtomically(input: {
    readonly inviteId: Identifier;
    readonly tokenHash: string;
    readonly userId: Identifier;
    readonly normalizedEmail: string;
    readonly assertedEmailHmac?: string | null;
    readonly membershipId: Identifier;
    readonly externalIdentityId: Identifier;
    readonly role: HumanCompanyRole;
    readonly grants: readonly { readonly id: Identifier; readonly permissionKey: CompanyPermissionKey }[];
    readonly event: CompanyDomainEvent;
    readonly expectedEventSequence: number;
    readonly acceptedAt: string;
  }): Promise<HumanInvite>;
}
