import type { DemoPortfolioSnapshot } from "../../core/demo-portfolio.ts";
import type { DemoSessionStorePort } from "../../ports/demo-session-store-port.ts";

export class InMemoryDemoSessionStore implements DemoSessionStorePort {
  readonly #sessions = new Map<string, DemoPortfolioSnapshot>();

  async create(snapshot: DemoPortfolioSnapshot): Promise<void> {
    if (this.#sessions.has(snapshot.sessionId)) throw new Error("DEMO_SESSION_ID_CONFLICT");
    this.#sessions.set(snapshot.sessionId, structuredClone(snapshot));
  }

  async load(sessionId: string): Promise<DemoPortfolioSnapshot | null> {
    const snapshot = this.#sessions.get(sessionId);
    return snapshot ? structuredClone(snapshot) : null;
  }

  async replace(
    sessionId: string,
    expectedRevision: number,
    snapshot: DemoPortfolioSnapshot,
  ): Promise<void> {
    const current = this.#sessions.get(sessionId);
    if (!current || current.revision !== expectedRevision ||
        snapshot.sessionId !== sessionId ||
        snapshot.company.id !== current.company.id) {
      throw new Error("DEMO_SESSION_REVISION_CONFLICT");
    }
    this.#sessions.set(sessionId, structuredClone(snapshot));
  }
}

