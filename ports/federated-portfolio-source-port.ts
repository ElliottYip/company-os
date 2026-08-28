import type { AgentPortfolioRecord } from "../core/agent-portfolio.ts";
import type { ConnectorCapabilities } from "../core/connector-capabilities.ts";
import type { Identifier } from "../core/control-plane.ts";
import type { ExternalWorkInput } from "../core/cross-source-work.ts";

export interface FederatedPortfolioSourceCapabilities {
  readonly connectorId: Identifier;
  readonly protocolVersion: "2.0";
  readonly capabilities: ConnectorCapabilities;
  readonly maximumBatchSize: number;
}

export interface FederatedPortfolioSourceHealth {
  readonly status: "NOT_CHECKED" | "HEALTHY" | "UNAVAILABLE";
  readonly checkedAt: string | null;
  readonly lastSuccessfulAt: string | null;
}

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
  capabilities(): Promise<FederatedPortfolioSourceCapabilities>;
  /** Returns retained bounded state and must not call the external source. */
  health(): Promise<FederatedPortfolioSourceHealth>;
  synchronize(): Promise<FederatedPortfolioSourceSnapshot>;
}
