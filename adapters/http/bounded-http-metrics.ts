const DURATION_BUCKETS_MS = [5, 25, 100, 500, 1_000, 5_000] as const;
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "OPTIONS"]);
const DEPENDENCY_NAMES = new Map([
  ["configuration", "configuration"],
  ["database", "database"],
  ["connectorRuntime", "connector"],
  ["modelRuntime", "model"],
  ["secretBroker", "secret_broker"],
  ["dataRuntime", "data_node"],
] as const);

function routeFamily(path: string): string {
  if (path === "/health") return "health";
  if (path === "/ready") return "readiness";
  if (path === "/metrics") return "metrics";
  if (path.startsWith("/api/auth/")) return "auth";
  if (path.startsWith("/api/v1/")) return "formal_api";
  if (path.startsWith("/api/")) return "demo_api";
  return "unknown";
}

function statusClass(status: number): string {
  const group = Math.floor(status / 100);
  return group >= 1 && group <= 5 ? `${group}xx` : "other";
}

function metricLine(name: string, labels: Readonly<Record<string, string>>, value: number): string {
  const encoded = Object.entries(labels).map(([key, item]) => `${key}="${item}"`).join(",");
  return `${name}{${encoded}} ${value}`;
}

/** Fixed-label HTTP telemetry. It can never contain a tenant, user, Work, URL or error message. */
export class BoundedHttpMetrics {
  #inFlight = 0;
  #durationCount = 0;
  #durationSumMs = 0;
  readonly #durationBuckets = new Map<number, number>(DURATION_BUCKETS_MS.map((bucket) => [bucket, 0]));
  readonly #requests = new Map<string, number>();
  readonly #dependencies = new Map<string, "pass" | "degraded" | "fail">();
  readonly #connectorCommandOutcomes = new Map<"delivered" | "retry_pending", number>();
  readonly #secretLeaseRevocationOutcomes = new Map<"revoked" | "retry_pending", number>();

  setDependencyHealth(checks: Readonly<Record<string, { readonly status: "pass" | "degraded" | "fail" }>>): void {
    for (const [source, name] of DEPENDENCY_NAMES) {
      const check = checks[source];
      if (check) this.#dependencies.set(name, check.status);
    }
  }

  recordConnectorDeliveries(outcomes: readonly { readonly status: "DELIVERED" | "RETRY_PENDING" }[]): void {
    for (const outcome of outcomes) {
      const status = outcome.status === "DELIVERED" ? "delivered" : "retry_pending";
      this.#connectorCommandOutcomes.set(status, (this.#connectorCommandOutcomes.get(status) ?? 0) + 1);
    }
  }

  recordSecretLeaseRevocations(outcomes: readonly { readonly status: "REVOKED" | "RETRY_PENDING" }[]): void {
    for (const outcome of outcomes) {
      const status = outcome.status === "REVOKED" ? "revoked" : "retry_pending";
      this.#secretLeaseRevocationOutcomes.set(status,
        (this.#secretLeaseRevocationOutcomes.get(status) ?? 0) + 1);
    }
  }

  begin(method: string, path: string, startedAt = performance.now()): (status: number, endedAt?: number) => void {
    this.#inFlight += 1;
    let finished = false;
    return (status, endedAt = performance.now()) => {
      if (finished) return;
      finished = true;
      this.#inFlight = Math.max(0, this.#inFlight - 1);
      const normalizedMethod = METHODS.has(method) ? method : "OTHER";
      const family = routeFamily(path);
      const statusGroup = statusClass(status);
      const key = `${family}|${normalizedMethod}|${statusGroup}`;
      this.#requests.set(key, (this.#requests.get(key) ?? 0) + 1);
      const duration = Math.max(0, endedAt - startedAt);
      this.#durationCount += 1;
      this.#durationSumMs += duration;
      for (const bucket of DURATION_BUCKETS_MS) {
        if (duration <= bucket) this.#durationBuckets.set(bucket, (this.#durationBuckets.get(bucket) ?? 0) + 1);
      }
    };
  }

  render(): string {
    const lines = [
      "# HELP company_os_http_requests_total Bounded HTTP requests by route family, method, and status class.",
      "# TYPE company_os_http_requests_total counter",
    ];
    for (const [key, value] of [...this.#requests.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const [route, method, status] = key.split("|") as [string, string, string];
      lines.push(metricLine("company_os_http_requests_total", { route, method, status_class: status }, value));
    }
    lines.push(
      "# HELP company_os_http_requests_in_flight Current HTTP requests.",
      "# TYPE company_os_http_requests_in_flight gauge",
      `company_os_http_requests_in_flight ${this.#inFlight}`,
      "# HELP company_os_http_request_duration_milliseconds Request duration without tenant labels.",
      "# TYPE company_os_http_request_duration_milliseconds histogram",
    );
    for (const bucket of DURATION_BUCKETS_MS) {
      lines.push(metricLine("company_os_http_request_duration_milliseconds_bucket", { le: String(bucket) },
        this.#durationBuckets.get(bucket) ?? 0));
    }
    lines.push(
      metricLine("company_os_http_request_duration_milliseconds_bucket", { le: "+Inf" }, this.#durationCount),
      `company_os_http_request_duration_milliseconds_sum ${this.#durationSumMs}`,
      `company_os_http_request_duration_milliseconds_count ${this.#durationCount}`,
      "# HELP company_os_dependency_health Current bounded dependency readiness (1 is the reported state).",
      "# TYPE company_os_dependency_health gauge",
    );
    for (const [dependency, status] of [...this.#dependencies.entries()].sort(([left], [right]) =>
      left.localeCompare(right))) {
      lines.push(metricLine("company_os_dependency_health", { dependency, status }, 1));
    }
    lines.push(
      "# HELP company_os_connector_command_outcomes_total Connector command delivery outcomes without customer labels.",
      "# TYPE company_os_connector_command_outcomes_total counter",
    );
    for (const [status, value] of [...this.#connectorCommandOutcomes.entries()].sort(([left], [right]) =>
      left.localeCompare(right))) {
      lines.push(metricLine("company_os_connector_command_outcomes_total", { status }, value));
    }
    lines.push(
      "# HELP company_os_secret_lease_revocation_outcomes_total Secret lease revocation outcomes without customer labels.",
      "# TYPE company_os_secret_lease_revocation_outcomes_total counter",
    );
    for (const [status, value] of [...this.#secretLeaseRevocationOutcomes.entries()].sort(([left], [right]) =>
      left.localeCompare(right))) {
      lines.push(metricLine("company_os_secret_lease_revocation_outcomes_total", { status }, value));
    }
    return `${lines.join("\n")}\n`;
  }
}
