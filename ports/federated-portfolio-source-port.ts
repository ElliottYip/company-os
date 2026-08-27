import type { AgentPortfolioRecord } from "../core/agent-portfolio.ts";
import type { Identifier } from "../core/control-plane.ts";
import type { ExternalWorkInput } from "../core/cross-source-work.ts";

export interface FederatedPortfolioSourceSnapshot {
  readonly inventory: readonly AgentPortfolioRecord[];
  readonly work: readonly ExternalWorkInput[];
  readonly anomalies: readonly {
    readonly code: string;
    readonly externalId: string;
  }[];
}

export interface FederatedPortfolioSourcePort {
  readonly connectorId: Identifier;
  readonly companyId: Identifier;
  synchronize(): Promise<FederatedPortfolioSourceSnapshot>;
}
