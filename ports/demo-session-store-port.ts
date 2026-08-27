import type { DemoPortfolioSnapshot } from "../core/demo-portfolio.ts";

export interface DemoSessionStorePort {
  create(snapshot: DemoPortfolioSnapshot): Promise<void>;
  load(sessionId: string): Promise<DemoPortfolioSnapshot | null>;
  replace(
    sessionId: string,
    expectedRevision: number,
    snapshot: DemoPortfolioSnapshot,
  ): Promise<void>;
}

