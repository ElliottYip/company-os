import type {
  CompanyDomainEvent,
  Identifier,
} from "../core/control-plane.ts";

export interface EventReadOptions {
  readonly afterSequence?: number;
  readonly types?: readonly string[];
}

export interface AppendResult {
  readonly sequence: number;
  readonly storedAt: string;
}

export interface EventDataStorePort {
  append(
    event: CompanyDomainEvent,
    expectedSequence?: number,
  ): Promise<AppendResult>;
  read(
    companyId: Identifier,
    options?: EventReadOptions,
  ): Promise<readonly CompanyDomainEvent[]>;
  resetFixture(companyId: Identifier): Promise<void>;
}

