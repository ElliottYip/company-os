import type { DemoPortfolioSnapshot } from "../../core/demo-portfolio.ts";
import type { DemoSessionStorePort } from "../../ports/demo-session-store-port.ts";

export class InMemoryDemoSessionStore implements DemoSessionStorePort {
  readonly #sessions = new Map<string, DemoPortfolioSnapshot>();
  readonly #maximumSessions: number;
  readonly #now: () => string;

  constructor(input: {
    readonly maximumSessions?: number;
    readonly now?: () => string;
  } = {}) {
    const maximumSessions = input.maximumSessions ?? 500;
    if (!Number.isSafeInteger(maximumSessions) || maximumSessions < 1 || maximumSessions > 10_000) {
      throw new Error("DEMO_SESSION_CAPACITY_INVALID");
    }
    this.#maximumSessions = maximumSessions;
    this.#now = input.now ?? (() => new Date().toISOString());
  }

  async create(snapshot: DemoPortfolioSnapshot): Promise<void> {
    this.#reclaimExpired();
    if (this.#sessions.has(snapshot.sessionId)) throw new Error("DEMO_SESSION_ID_CONFLICT");
    if (this.#sessions.size >= this.#maximumSessions) {
      throw new Error("DEMO_SESSION_CAPACITY_EXCEEDED");
    }
    this.#sessions.set(snapshot.sessionId, structuredClone(snapshot));
  }

  async load(sessionId: string): Promise<DemoPortfolioSnapshot | null> {
    const snapshot = this.#sessions.get(sessionId);
    return snapshot ? structuredClone(snapshot) : null;
  }

  async delete(sessionId: string): Promise<void> {
    this.#sessions.delete(sessionId);
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

  #reclaimExpired(): void {
    const now = Date.parse(this.#now());
    if (!Number.isFinite(now)) throw new Error("DEMO_SESSION_TIME_INVALID");
    for (const [sessionId, snapshot] of this.#sessions) {
      if (Date.parse(snapshot.expiresAt) <= now) this.#sessions.delete(sessionId);
    }
  }
}
