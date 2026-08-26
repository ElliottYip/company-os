export type OperationalCheck = {
  readonly status: "pass" | "degraded" | "fail";
  readonly code: string;
};

export interface OperationalReadiness {
  readonly status: "ready" | "not_ready";
  readonly checks: Readonly<Record<string, OperationalCheck>>;
}

type RuntimeHealth = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
type HealthPort = { health(): Promise<RuntimeHealth> };

async function runtimeCheck(
  ports: readonly HealthPort[],
  name: "CONNECTOR_RUNTIME" | "MODEL_RUNTIME" | "DATA_RUNTIME",
): Promise<OperationalCheck> {
  if (!ports.length) return { status: "degraded", code: `NO_${name}_INSTALLED` };
  const health = await Promise.all(ports.map(async (port): Promise<RuntimeHealth> => {
    try { return await port.health(); } catch { return "UNAVAILABLE"; }
  }));
  if (health.every((value) => value === "HEALTHY")) {
    return { status: "pass", code: `${name}_HEALTHY` };
  }
  return {
    status: "degraded",
    code: health.some((value) => value === "UNAVAILABLE")
      ? `${name}_UNAVAILABLE`
      : `${name}_DEGRADED`,
  };
}

async function brokerCheck(port: HealthPort | null): Promise<OperationalCheck> {
  if (!port) return { status: "degraded", code: "NO_SECRET_BROKER_INSTALLED" };
  let health: RuntimeHealth;
  try { health = await port.health(); } catch { health = "UNAVAILABLE"; }
  if (health === "HEALTHY") return { status: "pass", code: "SECRET_BROKER_HEALTHY" };
  return { status: "degraded", code: `SECRET_BROKER_${health}` };
}

/** Probes only bounded health contracts and never forwards provider error text. */
export async function getOperationalReadiness(input: {
  readonly formalRequired: boolean;
  readonly formalConfigured: boolean;
  readonly database: { ping(): Promise<void>; checkSchema(): Promise<void> } | null;
  readonly connectors: readonly HealthPort[];
  readonly modelProviders: readonly HealthPort[];
  readonly secretBroker: HealthPort | null;
  readonly dataConnectors: readonly HealthPort[];
}): Promise<OperationalReadiness> {
  const [connectorRuntime, modelRuntime, secretBroker, dataRuntime] = await Promise.all([
    runtimeCheck(input.connectors, "CONNECTOR_RUNTIME"),
    runtimeCheck(input.modelProviders, "MODEL_RUNTIME"),
    brokerCheck(input.secretBroker),
    runtimeCheck(input.dataConnectors, "DATA_RUNTIME"),
  ]);
  const checks: Record<string, OperationalCheck> = {
    configuration: input.formalConfigured
      ? { status: "pass", code: "FORMAL_CONFIGURATION_READY" }
      : input.formalRequired
        ? { status: "fail", code: "FORMAL_CONFIGURATION_REQUIRED" }
        : { status: "degraded", code: "LOCAL_DEVELOPMENT_ONLY" },
    connectorRuntime,
    modelRuntime,
    secretBroker,
    dataRuntime,
    database: { status: "degraded", code: "LOCAL_STORAGE_ONLY" },
  };
  if (input.database) {
    try {
      await input.database.ping();
      await input.database.checkSchema();
      checks.database = { status: "pass", code: "DATABASE_READY" };
    } catch {
      checks.database = { status: "fail", code: "DATABASE_OR_SCHEMA_UNAVAILABLE" };
    }
  } else if (input.formalRequired) {
    checks.database = { status: "fail", code: "DATABASE_REQUIRED" };
  }
  return {
    status: Object.values(checks).some(({ status }) => status === "fail") ? "not_ready" : "ready",
    checks,
  };
}
