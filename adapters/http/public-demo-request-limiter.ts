import { createHash, randomBytes } from "node:crypto";

interface WindowCounter {
  count: number;
  expiresAt: number;
}

export class PublicDemoRequestLimiter {
  readonly #maximumCreations: number;
  readonly #maximumSessionRequests: number;
  readonly #windowMilliseconds: number;
  readonly #maximumTrackedSessions: number;
  readonly #now: () => number;
  readonly #hashSessionId: (sessionId: string) => string;
  #creationWindow: WindowCounter | null = null;
  readonly #sessionWindows = new Map<string, WindowCounter>();

  constructor(input: {
    readonly maximumCreationsPerWindow: number;
    readonly maximumRequestsPerSessionPerWindow: number;
    readonly windowMilliseconds: number;
    readonly maximumTrackedSessions?: number;
    readonly now?: () => number;
    readonly hashSessionId?: (sessionId: string) => string;
  }) {
    for (const [name, value, maximum] of [
      ["maximumCreationsPerWindow", input.maximumCreationsPerWindow, 10_000],
      ["maximumRequestsPerSessionPerWindow", input.maximumRequestsPerSessionPerWindow, 100_000],
      ["windowMilliseconds", input.windowMilliseconds, 3_600_000],
    ] as const) {
      if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
        throw new Error(`PUBLIC_DEMO_RATE_LIMIT_${name.toUpperCase()}_INVALID`);
      }
    }
    this.#maximumCreations = input.maximumCreationsPerWindow;
    this.#maximumSessionRequests = input.maximumRequestsPerSessionPerWindow;
    this.#windowMilliseconds = input.windowMilliseconds;
    const maximumTrackedSessions = input.maximumTrackedSessions ?? 500;
    if (!Number.isSafeInteger(maximumTrackedSessions) ||
        maximumTrackedSessions < 1 || maximumTrackedSessions > 10_000) {
      throw new Error("PUBLIC_DEMO_RATE_LIMIT_TRACKED_SESSIONS_INVALID");
    }
    this.#maximumTrackedSessions = maximumTrackedSessions;
    this.#now = input.now ?? Date.now;
    const salt = randomBytes(32);
    this.#hashSessionId = input.hashSessionId ?? ((sessionId) =>
      createHash("sha256").update(salt).update(sessionId).digest("base64url"));
  }

  consumeCreation(): void {
    const now = this.#now();
    this.#creationWindow = this.#consume(this.#creationWindow, this.#maximumCreations, now);
  }

  consumeSession(sessionId: string): void {
    const now = this.#now();
    this.#reclaimExpiredSessionWindows(now);
    const key = this.#hashSessionId(sessionId);
    if (!this.#sessionWindows.has(key) && this.#sessionWindows.size >= this.#maximumTrackedSessions) {
      throw new Error("PUBLIC_DEMO_RATE_LIMITED");
    }
    const next = this.#consume(this.#sessionWindows.get(key) ?? null, this.#maximumSessionRequests, now);
    this.#sessionWindows.set(key, next);
  }

  diagnosticKeys(): readonly string[] {
    return [...this.#sessionWindows.keys()].sort();
  }

  #consume(current: WindowCounter | null, maximum: number, now: number): WindowCounter {
    if (!Number.isFinite(now)) throw new Error("PUBLIC_DEMO_RATE_LIMIT_TIME_INVALID");
    const active = current && current.expiresAt > now
      ? current
      : { count: 0, expiresAt: now + this.#windowMilliseconds };
    if (active.count >= maximum) throw new Error("PUBLIC_DEMO_RATE_LIMITED");
    return { ...active, count: active.count + 1 };
  }

  #reclaimExpiredSessionWindows(now: number): void {
    for (const [key, window] of this.#sessionWindows) {
      if (window.expiresAt <= now) this.#sessionWindows.delete(key);
    }
  }
}
