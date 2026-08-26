import type { DataConnectorCapabilities, DataConnectorPort } from "../../ports/data-connector-port.ts";

const PACKAGE = /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/;
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const OPERATIONS = new Set(["READ", "WRITE", "EXPORT"]);

export interface CompanyOsDataConnectorModule {
  readonly createDataConnectorPort?: () => DataConnectorPort | Promise<DataConnectorPort>;
}

export function parseFormalDataConnectorPackages(source: string | undefined): readonly string[] {
  if (!source?.trim()) return [];
  const packages = source.split(",").map((value) => value.trim()).filter(Boolean);
  if (packages.length > 32 || packages.some((value) => !PACKAGE.test(value))) {
    throw new Error("DATA_CONNECTOR_PACKAGE_LIST_INVALID");
  }
  if (new Set(packages).size !== packages.length) throw new Error("DATA_CONNECTOR_PACKAGE_DUPLICATE");
  return packages;
}

function validateCapabilities(value: DataConnectorCapabilities): void {
  if (!ID.test(value.connectorId) || !value.displayName.trim() || value.displayName.length > 120 ||
      value.protocolVersion !== "1.0" || !value.dataSourceIds.length || value.dataSourceIds.length > 100 ||
      value.dataSourceIds.some((id) => !ID.test(id)) ||
      new Set(value.dataSourceIds).size !== value.dataSourceIds.length ||
      !value.supportedOperations.length || value.supportedOperations.some((operation) => !OPERATIONS.has(operation))) {
    throw new Error("DATA_CONNECTOR_CAPABILITIES_INVALID");
  }
}

export async function loadFormalDataConnectors(
  packages: readonly string[],
  importer: (specifier: string) => Promise<CompanyOsDataConnectorModule> =
    (specifier) => import(specifier) as Promise<CompanyOsDataConnectorModule>,
): Promise<readonly DataConnectorPort[]> {
  const ports: DataConnectorPort[] = [];
  const ids = new Set<string>();
  const sources = new Set<string>();
  for (const packageName of packages) {
    const module = await importer(packageName);
    if (typeof module.createDataConnectorPort !== "function") throw new Error("DATA_CONNECTOR_MODULE_FACTORY_REQUIRED");
    const port = await module.createDataConnectorPort();
    if (!port || typeof port.capabilities !== "function" || typeof port.health !== "function" || typeof port.access !== "function") {
      throw new Error("DATA_CONNECTOR_PORT_INVALID");
    }
    const capabilities = await port.capabilities();
    validateCapabilities(capabilities);
    if (ids.has(capabilities.connectorId)) throw new Error("DATA_CONNECTOR_ID_DUPLICATE");
    if (capabilities.dataSourceIds.some((source) => sources.has(source))) throw new Error("DATA_CONNECTOR_SOURCE_AMBIGUOUS");
    ids.add(capabilities.connectorId);
    capabilities.dataSourceIds.forEach((source) => sources.add(source));
    ports.push(port);
  }
  return Object.freeze([...ports]);
}
