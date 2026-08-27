import type { FederatedPortfolioSourcePort } from "../../ports/federated-portfolio-source-port.ts";

const PACKAGE = /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/;
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface CompanyOsFederatedSourceModule {
  readonly createFederatedPortfolioSource?: () =>
    FederatedPortfolioSourcePort | Promise<FederatedPortfolioSourcePort>;
}

export function parseFormalFederatedSourcePackages(source: string | undefined): readonly string[] {
  if (!source?.trim()) return [];
  const packages = source.split(",").map((value) => value.trim()).filter(Boolean);
  if (packages.length > 16 || packages.some((value) => !PACKAGE.test(value))) {
    throw new Error("FEDERATED_SOURCE_PACKAGE_LIST_INVALID");
  }
  if (new Set(packages).size !== packages.length) throw new Error("FEDERATED_SOURCE_PACKAGE_DUPLICATE");
  return packages;
}

export async function loadFormalFederatedSources(
  packages: readonly string[],
  importer: (specifier: string) => Promise<CompanyOsFederatedSourceModule> =
    (specifier) => import(specifier) as Promise<CompanyOsFederatedSourceModule>,
): Promise<readonly FederatedPortfolioSourcePort[]> {
  const sources: FederatedPortfolioSourcePort[] = [];
  const connectorIds = new Set<string>();
  for (const packageName of packages) {
    const module = await importer(packageName);
    if (typeof module.createFederatedPortfolioSource !== "function") {
      throw new Error("FEDERATED_SOURCE_MODULE_FACTORY_REQUIRED");
    }
    const source = await module.createFederatedPortfolioSource();
    if (!source || typeof source !== "object" || !ID.test(source.connectorId) ||
        !ID.test(source.companyId) || typeof source.synchronize !== "function") {
      throw new Error("FEDERATED_SOURCE_PORT_INVALID");
    }
    if (connectorIds.has(source.connectorId)) throw new Error("FEDERATED_SOURCE_CONNECTOR_DUPLICATE");
    connectorIds.add(source.connectorId);
    sources.push(source);
  }
  return Object.freeze([...sources]);
}
