import type { HumanCompanyRole } from "./company-access.ts";
import type { Identifier } from "./control-plane.ts";

export interface HumanInvite {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly expectedEmail: string;
  readonly departmentId: Identifier;
  readonly title: string;
  readonly membershipRole: HumanCompanyRole;
  readonly invitedByUserId: Identifier;
  readonly expiresAt: string;
  readonly acceptedAt: string | null;
  readonly revokedAt: string | null;
}

export type HumanInviteState = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export function humanInviteState(invite: HumanInvite, now: string): HumanInviteState {
  if (invite.revokedAt) return "REVOKED";
  if (invite.acceptedAt) return "ACCEPTED";
  if (Date.parse(invite.expiresAt) <= Date.parse(now)) return "EXPIRED";
  return "PENDING";
}

export function normalizeInviteEmail(value: string): string {
  const email = value.trim().toLocaleLowerCase("en-US");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("HUMAN_INVITE_EMAIL_INVALID");
  }
  return email;
}
