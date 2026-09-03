export class TenantSignupRequestLimiter {
  readonly #maximum: number;
  readonly #windowMilliseconds: number;
  readonly #now: () => number;
  readonly #maximumKeys: number;
  readonly #windows = new Map<string, { count: number; expiresAt: number }>();

  constructor(input: {
    readonly maximumRequestsPerWindow: number;
    readonly windowMilliseconds?: number;
    readonly maximumKeys?: number;
    readonly now?: () => number;
  }) {
    if (!Number.isSafeInteger(input.maximumRequestsPerWindow) ||
        input.maximumRequestsPerWindow < 1 || input.maximumRequestsPerWindow > 10_000) {
      throw new Error("TENANT_SIGNUP_RATE_LIMIT_CONFIGURATION_INVALID");
    }
    this.#maximum = input.maximumRequestsPerWindow;
    this.#windowMilliseconds = input.windowMilliseconds ?? 60_000;
    if (!Number.isSafeInteger(this.#windowMilliseconds) ||
        this.#windowMilliseconds < 1 || this.#windowMilliseconds > 3_600_000) {
      throw new Error("TENANT_SIGNUP_RATE_LIMIT_CONFIGURATION_INVALID");
    }
    this.#maximumKeys = input.maximumKeys ?? 10_000;
    if (!Number.isSafeInteger(this.#maximumKeys) || this.#maximumKeys < 1 || this.#maximumKeys > 100_000) {
      throw new Error("TENANT_SIGNUP_RATE_LIMIT_CONFIGURATION_INVALID");
    }
    this.#now = input.now ?? Date.now;
  }

  consume(key = "global"): void {
    const now = this.#now();
    const normalizedKey = key.trim();
    if (!Number.isFinite(now) || !normalizedKey || normalizedKey.length > 255) {
      throw new Error("TENANT_SIGNUP_RATE_LIMIT_TIME_INVALID");
    }
    let window = this.#windows.get(normalizedKey);
    if (!window || window.expiresAt <= now) {
      if (!window && this.#windows.size >= this.#maximumKeys) {
        for (const [candidate, value] of this.#windows) {
          if (value.expiresAt <= now) this.#windows.delete(candidate);
        }
        if (this.#windows.size >= this.#maximumKeys) throw new Error("TENANT_SIGNUP_RATE_LIMITED");
      }
      window = { count: 0, expiresAt: now + this.#windowMilliseconds };
    }
    if (window.count >= this.#maximum) throw new Error("TENANT_SIGNUP_RATE_LIMITED");
    this.#windows.set(normalizedKey, { ...window, count: window.count + 1 });
  }
}
