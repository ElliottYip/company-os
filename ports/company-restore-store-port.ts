import type { CompanyPermissionKey } from "../core/company-access.ts";
import type { Identifier } from "../core/control-plane.ts";

export interface RestoredOwnedCompanyRecord {
  readonly companyId: Identifier;
  readonly membershipId: Identifier;
  readonly permissionGrantIds: readonly Identifier[];
  readonly ownerUserId: Identifier;
  readonly name: string;
  readonly purpose: string;
  readonly locale: string;
}

export interface CompanyRestoreInspectionRecord {
  readonly companyId: Identifier;
  readonly name: string;
  readonly purpose: string;
  readonly locale: string;
  readonly actorUserId: Identifier;
  readonly identityBinding: "EXACT";
  readonly eventCount: number;
  readonly deliveredPublicationCount: number;
  readonly checkpointCount: number;
  readonly humanCount: number;
  readonly agentCount: number;
}

/**
 * Atomic boundary for restoring a portable control-plane backup into a company
 * directory that does not yet exist. A failure must not leave a directory or
 * membership shell behind.
 */
export interface CompanyRestoreStorePort {
  inspectOwnedCompanyRestore(input: {
    readonly source: string;
    readonly actorUserId: Identifier;
  }): Promise<CompanyRestoreInspectionRecord>;
  restoreOwnedCompany(input: {
    readonly source: string;
    readonly actorUserId: Identifier;
    readonly membershipId: Identifier;
    readonly permissionGrants: readonly {
      readonly id: Identifier;
      readonly permissionKey: CompanyPermissionKey;
    }[];
  }): Promise<RestoredOwnedCompanyRecord>;
}
