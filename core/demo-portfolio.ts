import type { AgentCommercialProjection } from "./agent-commercial-governance.ts";
import type { AgentPortfolioRecord } from "./agent-portfolio.ts";
import type { CompanyDomainEvent, Identifier } from "./control-plane.ts";
import type { ExternalWorkRecord } from "./cross-source-work.ts";

export interface DemoPortfolioSnapshot {
  readonly sessionId: string;
  readonly generation: number;
  readonly revision: number;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly company: {
    readonly id: Identifier;
    readonly name: string;
  };
  readonly agents: readonly AgentPortfolioRecord[];
  readonly work: readonly ExternalWorkRecord[];
  readonly commercial: AgentCommercialProjection;
  readonly governed: {
    readonly phase: "READY" | "AWAITING_APPROVAL" | "APPROVED" | "REJECTED";
    readonly approvalRequestId: Identifier | null;
    readonly evidenceReferences: readonly Identifier[];
    readonly resultReference: Identifier | null;
    readonly costCents: number;
  };
  readonly provenance: Extract<CompanyDomainEvent["provenance"], "DEMO_FIXTURE">;
}

export type CreateDemoPortfolioFixture = (input: {
  readonly sessionId: string;
  readonly companyId: Identifier;
  readonly generation: number;
  readonly revision: number;
  readonly createdAt: string;
  readonly expiresAt: string;
}) => DemoPortfolioSnapshot;
