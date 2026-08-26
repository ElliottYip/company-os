import type {
  AgentExecutionCapabilities,
  AgentExecutionPort,
} from "../../ports/agent-execution-port.ts";

const PACKAGE_SPECIFIER = /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/;
const IDENTIFIER = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PROTOCOL_VERSION = /^[0-9]+\.[0-9]+(?:\.[0-9]+)?$/;

export interface CompanyOsConnectorModule {
  readonly createAgentExecutionPort?: () => AgentExecutionPort | Promise<AgentExecutionPort>;
}

export type ConnectorModuleImporter = (specifier: string) => Promise<CompanyOsConnectorModule>;

/**
 * Parses only installed package names. Local paths, URLs and inline code are
 * deliberately not a production configuration surface.
 */
export function parseFormalConnectorPackages(source: string | undefined): readonly string[] {
  if (!source?.trim()) return [];
  const packages = source.split(",").map((value) => value.trim()).filter(Boolean);
  if (packages.length > 32 || packages.some((value) => !PACKAGE_SPECIFIER.test(value))) {
    throw new Error("CONNECTOR_PACKAGE_LIST_INVALID");
  }
  if (new Set(packages).size !== packages.length) throw new Error("CONNECTOR_PACKAGE_DUPLICATE");
  return packages;
}

function validateCapabilities(value: AgentExecutionCapabilities): void {
  if (!IDENTIFIER.test(value.connectorId) || !value.displayName.trim() || value.displayName.length > 120 ||
      !PROTOCOL_VERSION.test(value.protocolVersion) || value.protocolVersion !== "1.0" ||
      !Number.isSafeInteger(value.maximumTimeoutSeconds) ||
      value.maximumTimeoutSeconds < 1 || value.maximumTimeoutSeconds > 86_400 ||
      [value.supportsPause, value.supportsResume, value.supportsCancellation, value.supportsEvidence]
        .some((flag) => typeof flag !== "boolean")) {
    throw new Error("CONNECTOR_CAPABILITIES_INVALID");
  }
  if (value.supportsResume && !value.supportsPause) throw new Error("CONNECTOR_CAPABILITIES_INVALID");
}

function validatePort(value: unknown): asserts value is AgentExecutionPort {
  if (!value || typeof value !== "object") throw new Error("CONNECTOR_PORT_INVALID");
  const candidate = value as Record<string, unknown>;
  for (const method of ["capabilities", "health", "deploy", "submit", "observe", "pause", "resume", "cancel"]) {
    if (typeof candidate[method] !== "function") throw new Error("CONNECTOR_PORT_INVALID");
  }
}

/** Loads optional server-side Connector packages before the HTTP service starts. */
export async function loadFormalConnectors(
  packages: readonly string[],
  importer: ConnectorModuleImporter = (specifier) => import(specifier) as Promise<CompanyOsConnectorModule>,
): Promise<readonly AgentExecutionPort[]> {
  const ports: AgentExecutionPort[] = [];
  const connectorIds = new Set<string>();
  for (const packageName of packages) {
    const module = await importer(packageName);
    if (typeof module.createAgentExecutionPort !== "function") {
      throw new Error("CONNECTOR_MODULE_FACTORY_REQUIRED");
    }
    const port = await module.createAgentExecutionPort();
    validatePort(port);
    const capabilities = await port.capabilities();
    validateCapabilities(capabilities);
    if (connectorIds.has(capabilities.connectorId)) throw new Error("CONNECTOR_ID_DUPLICATE");
    connectorIds.add(capabilities.connectorId);
    ports.push(port);
  }
  return Object.freeze([...ports]);
}
