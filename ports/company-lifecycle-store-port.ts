import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";

export interface ArchivedCompanyRecord {
  readonly companyId: Identifier;
  readonly status: "archived";
  readonly archivedAt: string;
  readonly exportDigest: string;
  readonly retentionPolicyId: Identifier;
}

/** Owns the irreversible database transition from an active company to retained archive state. */
export interface CompanyLifecycleStorePort {
  archiveCompanyAtomically(input: {
    readonly companyId: Identifier;
    readonly actorUserId: Identifier;
    readonly expectedStatus: "active";
    readonly exportDigest: string;
    readonly retentionPolicyId: Identifier;
    readonly archivedAt: string;
    readonly event: CompanyDomainEvent;
    readonly expectedEventSequence: number;
  }): Promise<ArchivedCompanyRecord>;
}
