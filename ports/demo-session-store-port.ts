import type { DemoPortfolioSnapshot } from "../core/demo-portfolio.ts";

export interface DemoSessionStorePort {
  create(snapshot: DemoPortfolioSnapshot): Promise<void>;
  load(sessionId: string): Promise<DemoPortfolioSnapshot | null>;
  delete(sessionId: string): Promise<void>;
  replace(
    sessionId: string,
    expectedRevision: number,
    snapshot: DemoPortfolioSnapshot,
  ): Promise<void>;
}
