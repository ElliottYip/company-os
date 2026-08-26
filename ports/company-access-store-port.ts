import type { CompanyMembership, CompanyMembershipStatus, CompanyPermissionKey, HumanCompanyRole } from "../core/company-access.ts";
import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";

export type FirstInstanceAdminClaim =
  | { readonly status: "CLAIMED"; readonly userId: Identifier }
  | { readonly status: "ALREADY_CLAIMED"; readonly existingUserId: Identifier };

export interface AccessibleCompany {
  readonly id: Identifier;
  readonly name: string;
  readonly membershipRole: HumanCompanyRole;
}

export interface CompanyHumanMember {
  readonly userId: Identifier;
  readonly displayName: string;
  readonly email: string;
  readonly role: HumanCompanyRole;
  readonly status: "pending" | "active" | "suspended" | "archived";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateOwnedCompanyRecord {
  readonly companyId: Identifier;
  readonly membershipId: Identifier;
  readonly permissionGrantIds: readonly Identifier[];
  readonly ownerUserId: Identifier;
  readonly name: string;
  readonly purpose: string;
  readonly locale: string;
}

export interface CompanyAccessStorePort {
  /** Infrastructure-wide enumeration for recovery workers; never grants company access. */
  listCompanyIds(): Promise<readonly Identifier[]>;
  claimFirstInstanceAdmin(input: {
    readonly roleId: Identifier;
    readonly userId: Identifier;
  }): Promise<FirstInstanceAdminClaim>;
  createOwnedCompany(input: {
    readonly companyId: Identifier;
    readonly membershipId: Identifier;
    readonly permissionGrants: readonly {
      readonly id: Identifier;
      readonly permissionKey: CompanyPermissionKey;
    }[];
    readonly ownerUserId: Identifier;
    readonly name: string;
    readonly purpose: string;
    readonly locale: string;
  }): Promise<CreateOwnedCompanyRecord>;
  listActiveHumanMemberships(userId: Identifier): Promise<readonly CompanyMembership[]>;
  listCompanyHumanMembers(companyId: Identifier): Promise<readonly CompanyHumanMember[]>;
  updateCompanyHumanMembership(input: {
    readonly companyId: Identifier;
    readonly userId: Identifier;
    readonly expectedRole: HumanCompanyRole;
    readonly expectedStatus: CompanyMembershipStatus;
    readonly role: HumanCompanyRole;
    readonly status: CompanyMembershipStatus;
    readonly permissionGrants: readonly {
      readonly id: Identifier;
      readonly permissionKey: CompanyPermissionKey;
    }[];
    readonly grantedByUserId: Identifier;
    readonly changedAt: string;
    readonly event: CompanyDomainEvent;
    readonly expectedEventSequence: number;
  }): Promise<CompanyHumanMember>;
  isInstanceAdmin(userId: Identifier): Promise<boolean>;
  listPermissionKeys(userId: Identifier, companyId: Identifier): Promise<readonly CompanyPermissionKey[]>;
}
