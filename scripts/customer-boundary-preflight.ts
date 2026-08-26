import { pathToFileURL } from "node:url";
import { createAgentExecutionPort } from "../connectors/http-agent-node/index.mjs";
import { createDataConnectorPort } from "../connectors/http-data-node/index.mjs";
import { createSecretBrokerRuntimePort } from "../brokers/http-secret-broker/index.mjs";

type Health = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
type Environment = Readonly<Record<string, string | undefined>>;

export interface CustomerBoundaryPreflightDependencies {
  readonly fetch: typeof fetch;
  readonly agent: { health(): Promise<Health> };
  readonly data: { health(): Promise<Health> };
  readonly broker: { health(): Promise<Health> };
}

export interface CustomerBoundaryPreflightResult {
  readonly schemaVersion: 1;
  readonly status: "PASS";
  readonly checks: {
    readonly identity: { readonly status: "PASS"; readonly code: "OIDC_DISCOVERY_S256_READY" };
    readonly agentNode: { readonly status: "PASS"; readonly code: "AGENT_NODE_HEALTHY" };
    readonly dataNode: { readonly status: "PASS"; readonly code: "DATA_NODE_HEALTHY" };
    readonly secretBroker: { readonly status: "PASS"; readonly code: "SECRET_BROKER_HEALTHY" };
  };
}

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value || value.length > 16_384 || /[\r\n]/.test(value)) {
    throw new Error(`CUSTOMER_PREFLIGHT_${name}_REQUIRED`);
  }
  return value;
}

function httpsUrl(value: unknown): URL {
  if (typeof value !== "string" || !value || value.length > 2_048) {
    throw new Error("CUSTOMER_PREFLIGHT_IDENTITY_PROTOCOL_INVALID");
  }
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("CUSTOMER_PREFLIGHT_IDENTITY_PROTOCOL_INVALID"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error("CUSTOMER_PREFLIGHT_IDENTITY_PROTOCOL_INVALID");
  }
  return url;
}

async function boundedDiscovery(response: Response): Promise<Record<string, unknown>> {
  if (response.status !== 200 || !(response.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new Error("CUSTOMER_PREFLIGHT_IDENTITY_PROTOCOL_INVALID");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("CUSTOMER_PREFLIGHT_IDENTITY_PROTOCOL_INVALID");
  const chunks: Buffer[] = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 128 * 1_024) {
      await reader.cancel();
      throw new Error("CUSTOMER_PREFLIGHT_IDENTITY_PROTOCOL_INVALID");
    }
    chunks.push(Buffer.from(value));
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new Error("CUSTOMER_PREFLIGHT_IDENTITY_PROTOCOL_INVALID");
  }
}

function defaultDependencies(environment: Environment): CustomerBoundaryPreflightDependencies {
  return {
    fetch,
    agent: createAgentExecutionPort({
      connectorId: environment.COMPANY_OS_HTTP_AGENT_NODE_ID ?? "http-agent-node",
      displayName: environment.COMPANY_OS_HTTP_AGENT_NODE_NAME ?? "Enterprise HTTP Agent Node",
      baseUrl: required(environment, "COMPANY_OS_HTTP_AGENT_NODE_BASE_URL"),
      bearerToken: required(environment, "COMPANY_OS_HTTP_AGENT_NODE_BEARER_TOKEN"),
      allowInsecureLoopback: false,
      requestTimeoutMs: Number(environment.COMPANY_OS_HTTP_AGENT_NODE_TIMEOUT_MS ?? "10000"),
    }),
    data: createDataConnectorPort({
      connectorId: environment.COMPANY_OS_HTTP_DATA_NODE_ID ?? "http-data-node",
      displayName: environment.COMPANY_OS_HTTP_DATA_NODE_NAME ?? "Enterprise HTTP Data Node",
      dataSourceIds: required(environment, "COMPANY_OS_HTTP_DATA_NODE_SOURCES").split(",").map((value) => value.trim()),
      supportedOperations: (environment.COMPANY_OS_HTTP_DATA_NODE_OPERATIONS ?? "READ").split(",").map((value) => value.trim()),
      baseUrl: required(environment, "COMPANY_OS_HTTP_DATA_NODE_BASE_URL"),
      bearerToken: required(environment, "COMPANY_OS_HTTP_DATA_NODE_BEARER_TOKEN"),
      allowInsecureLoopback: false,
      requestTimeoutMs: Number(environment.COMPANY_OS_HTTP_DATA_NODE_TIMEOUT_MS ?? "10000"),
    }),
    broker: createSecretBrokerRuntimePort({
      brokerId: environment.COMPANY_OS_HTTP_SECRET_BROKER_ID ?? "http-secret-broker",
      displayName: environment.COMPANY_OS_HTTP_SECRET_BROKER_NAME ?? "Enterprise HTTP Secret Broker",
      baseUrl: required(environment, "COMPANY_OS_HTTP_SECRET_BROKER_BASE_URL"),
      bearerToken: required(environment, "COMPANY_OS_HTTP_SECRET_BROKER_BEARER_TOKEN"),
      allowInsecureLoopback: false,
      requestTimeoutMs: Number(environment.COMPANY_OS_HTTP_SECRET_BROKER_TIMEOUT_MS ?? "10000"),
      maximumLeaseSeconds: Number(environment.COMPANY_OS_HTTP_SECRET_BROKER_MAXIMUM_LEASE_SECONDS ?? "600"),
    }),
  };
}

async function verifyIdentity(environment: Environment, fetchImplementation: typeof fetch) {
  const issuer = required(environment, "COMPANY_OS_OIDC_ISSUER");
  httpsUrl(issuer);
  const discoveryUrl = httpsUrl(required(environment, "COMPANY_OS_OIDC_DISCOVERY_URL"));
  let response: Response;
  try {
    response = await fetchImplementation(discoveryUrl, {
      redirect: "error",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("CUSTOMER_PREFLIGHT_IDENTITY_UNAVAILABLE");
  }
  const document = await boundedDiscovery(response);
  if (document.issuer !== issuer || !Array.isArray(document.code_challenge_methods_supported) ||
      !document.code_challenge_methods_supported.includes("S256")) {
    throw new Error("CUSTOMER_PREFLIGHT_IDENTITY_PROTOCOL_INVALID");
  }
  for (const field of ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const) httpsUrl(document[field]);
}

async function requireHealthy(port: { health(): Promise<Health> }, code: string) {
  let status: Health;
  try { status = await port.health(); } catch { throw new Error(code); }
  if (status !== "HEALTHY") throw new Error(code);
}

export async function runCustomerBoundaryPreflight(
  environment: Environment = process.env,
  dependencies?: CustomerBoundaryPreflightDependencies,
): Promise<CustomerBoundaryPreflightResult> {
  const ports = dependencies ?? defaultDependencies(environment);
  await verifyIdentity(environment, ports.fetch);
  await Promise.all([
    requireHealthy(ports.agent, "CUSTOMER_PREFLIGHT_AGENT_NODE_UNHEALTHY"),
    requireHealthy(ports.data, "CUSTOMER_PREFLIGHT_DATA_NODE_UNHEALTHY"),
    requireHealthy(ports.broker, "CUSTOMER_PREFLIGHT_SECRET_BROKER_UNHEALTHY"),
  ]);
  return {
    schemaVersion: 1,
    status: "PASS",
    checks: {
      identity: { status: "PASS", code: "OIDC_DISCOVERY_S256_READY" },
      agentNode: { status: "PASS", code: "AGENT_NODE_HEALTHY" },
      dataNode: { status: "PASS", code: "DATA_NODE_HEALTHY" },
      secretBroker: { status: "PASS", code: "SECRET_BROKER_HEALTHY" },
    },
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  runCustomerBoundaryPreflight().then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error: unknown) => {
    const code = error instanceof Error && /^CUSTOMER_PREFLIGHT_[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "CUSTOMER_PREFLIGHT_FAILED";
    process.stderr.write(`${JSON.stringify({ schemaVersion: 1, status: "FAIL", code })}\n`);
    process.exitCode = 1;
  });
}
