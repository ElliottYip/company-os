import type { Identifier } from "./control-plane.ts";

export const COMPANY_MEMBERSHIP_STATUSES = ["pending", "active", "suspended", "archived"] as const;
export type CompanyMembershipStatus = typeof COMPANY_MEMBERSHIP_STATUSES[number];

export const HUMAN_COMPANY_ROLES = ["owner", "admin", "operator", "viewer"] as const;
export type HumanCompanyRole = typeof HUMAN_COMPANY_ROLES[number];
export type CompanyMembershipRole = HumanCompanyRole | "member";

export const COMPANY_PERMISSION_KEYS = [
  "agents:create",
  "agents:configure",
  "agents:suggest-changes",
  "skills:create",
  "skills:suggest-changes",
  "environments:manage",
  "tools:admin",
  "tools:manage_connections",
  "tools:manage_profiles",
  "tools:view_audit",
  "audit:view_agent_actions",
  "tools:use",
  "tools:manage_runtime",
  "inbox:manage",
  "users:invite",
  "users:manage_permissions",
  "tasks:assign",
  "tasks:assign_scope",
  "tasks:manage_active_checkouts",
  "pipelines:write",
  "joins:approve",
] as const;
export type CompanyPermissionKey = typeof COMPANY_PERMISSION_KEYS[number];

export const OWNER_DEFAULT_PERMISSION_KEYS = [
  "agents:create",
  "agents:configure",
  "skills:create",
  "environments:manage",
  "users:invite",
  "users:manage_permissions",
  "tasks:assign",
  "joins:approve",
] as const satisfies readonly CompanyPermissionKey[];

export const HUMAN_ROLE_PERMISSION_KEYS: Readonly<Record<HumanCompanyRole, readonly CompanyPermissionKey[]>> = {
  owner: OWNER_DEFAULT_PERMISSION_KEYS,
  admin: OWNER_DEFAULT_PERMISSION_KEYS.filter((key) => key !== "users:manage_permissions"),
  operator: ["tasks:assign"],
  viewer: [],
};

export function permissionKeysForHumanRole(role: HumanCompanyRole): readonly CompanyPermissionKey[] {
  return HUMAN_ROLE_PERMISSION_KEYS[role];
}

export interface CompanyMembership {
  readonly companyId: Identifier;
  readonly principalType: "user" | "agent";
  readonly principalId: Identifier;
  readonly status: CompanyMembershipStatus;
  readonly role: CompanyMembershipRole;
}

export interface CompanyAccessActor {
  readonly type: "user" | "agent";
  readonly principalId: Identifier;
  readonly companyId?: Identifier;
  readonly memberships: readonly CompanyMembership[];
  readonly responsibleUserId?: Identifier;
  readonly responsibleUserMemberships?: readonly CompanyMembership[];
}

export type CompanyAccessDecision =
  | { readonly allowed: true; readonly membership: CompanyMembership }
  | {
      readonly allowed: false;
      readonly code:
        | "COMPANY_ACCESS_NOT_FOUND"
        | "COMPANY_MEMBERSHIP_INACTIVE"
        | "COMPANY_VIEWER_READ_ONLY"
        | "RESPONSIBLE_USER_UNAVAILABLE"
        | "RESPONSIBLE_USER_UNAUTHORIZED";
    };

function activeMembership(
  memberships: readonly CompanyMembership[],
  companyId: Identifier,
  principalType: "user" | "agent",
  principalId: Identifier,
): CompanyMembership | undefined {
  return memberships.find((membership) =>
    membership.companyId === companyId &&
    membership.principalType === principalType &&
    membership.principalId === principalId &&
    membership.status === "active");
}

export function decideCompanyAccess(
  actor: CompanyAccessActor,
  companyId: Identifier,
  operation: "read" | "write",
): CompanyAccessDecision {
  if (actor.type === "agent" && actor.companyId !== companyId) {
    return { allowed: false, code: "COMPANY_ACCESS_NOT_FOUND" };
  }

  const membership = activeMembership(actor.memberships, companyId, actor.type, actor.principalId);
  if (!membership) {
    const samePrincipalMembership = actor.memberships.some((candidate) =>
      candidate.companyId === companyId &&
      candidate.principalType === actor.type &&
      candidate.principalId === actor.principalId);
    return {
      allowed: false,
      code: samePrincipalMembership ? "COMPANY_MEMBERSHIP_INACTIVE" : "COMPANY_ACCESS_NOT_FOUND",
    };
  }

  if (operation === "write" && actor.type === "user" && membership.role === "viewer") {
    return { allowed: false, code: "COMPANY_VIEWER_READ_ONLY" };
  }

  if (actor.type === "agent" && actor.responsibleUserId) {
    const responsibleMembership = activeMembership(
      actor.responsibleUserMemberships ?? [],
      companyId,
      "user",
      actor.responsibleUserId,
    );
    if (!responsibleMembership) {
      return { allowed: false, code: "RESPONSIBLE_USER_UNAVAILABLE" };
    }
    if (operation === "write" && responsibleMembership.role === "viewer") {
      return { allowed: false, code: "RESPONSIBLE_USER_UNAUTHORIZED" };
    }
  }

  return { allowed: true, membership };
}
