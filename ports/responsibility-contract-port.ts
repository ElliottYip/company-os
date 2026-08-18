import type { Identifier } from "../core/control-plane.ts";
import type { ResponsibilityContract } from "../core/responsibility.ts";

export interface ResponsibilityContractSnapshot {
  readonly revision: number;
  readonly contracts: readonly ResponsibilityContract[];
}

export interface ReplaceResponsibilityContractsInput {
  readonly companyId: Identifier;
  readonly actorId: Identifier;
  readonly recordedAt: string;
  readonly expectedRevision: number;
  readonly contracts: readonly ResponsibilityContract[];
}

export interface ResponsibilityContractPort {
  load(companyId: Identifier): Promise<ResponsibilityContractSnapshot>;
  replace(input: ReplaceResponsibilityContractsInput): Promise<ResponsibilityContractSnapshot>;
}
