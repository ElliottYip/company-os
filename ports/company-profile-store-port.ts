import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";

export interface CompanyProfileStorePort {
  updateCompanyProfileAtomically(input: {
    readonly companyId: Identifier;
    readonly expected: { readonly name: string; readonly purpose: string; readonly locale: string };
    readonly next: { readonly name: string; readonly purpose: string; readonly locale: string };
    readonly event: CompanyDomainEvent;
    readonly expectedEventSequence: number;
  }): Promise<void>;
}
