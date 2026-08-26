import type { ModelProviderRuntimePort } from "../../ports/model-provider-runtime-port.ts";

const PACKAGE_SPECIFIER = /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/;
const IDENTIFIER = /^[a-z0-9][a-z0-9-]{0,127}$/;

export interface CompanyOsModelProviderModule {
  readonly createModelProviderRuntimePort?: () => ModelProviderRuntimePort | Promise<ModelProviderRuntimePort>;
}
export type ModelProviderModuleImporter = (specifier: string) => Promise<CompanyOsModelProviderModule>;

export function parseFormalModelProviderPackages(source: string | undefined): readonly string[] {
  if (!source?.trim()) return [];
  const packages = source.split(",").map((value) => value.trim()).filter(Boolean);
  if (packages.length > 32 || packages.some((value) => !PACKAGE_SPECIFIER.test(value))) {
    throw new Error("MODEL_PROVIDER_PACKAGE_LIST_INVALID");
  }
  if (new Set(packages).size !== packages.length) throw new Error("MODEL_PROVIDER_PACKAGE_DUPLICATE");
  return packages;
}

function validatePort(value: unknown): asserts value is ModelProviderRuntimePort {
  if (!value || typeof value !== "object") throw new Error("MODEL_PROVIDER_PORT_INVALID");
  const candidate = value as Record<string, unknown>;
  for (const method of ["capabilities", "health"]) {
    if (typeof candidate[method] !== "function") throw new Error("MODEL_PROVIDER_PORT_INVALID");
  }
}

export async function loadFormalModelProviders(
  packages: readonly string[],
  importer: ModelProviderModuleImporter = (specifier) => import(specifier) as Promise<CompanyOsModelProviderModule>,
): Promise<readonly ModelProviderRuntimePort[]> {
  const ports: ModelProviderRuntimePort[] = [];
  const providerIds = new Set<string>();
  for (const packageName of packages) {
    const module = await importer(packageName);
    if (typeof module.createModelProviderRuntimePort !== "function") {
      throw new Error("MODEL_PROVIDER_MODULE_FACTORY_REQUIRED");
    }
    const port = await module.createModelProviderRuntimePort();
    validatePort(port);
    const capabilities = await port.capabilities();
    if (!IDENTIFIER.test(capabilities.providerAdapterId) || !capabilities.displayName.trim() ||
        capabilities.displayName.length > 120 || capabilities.protocolVersion !== "1.0" ||
        !capabilities.modelReferences.length || capabilities.modelReferences.length > 256 ||
        capabilities.modelReferences.some((model) => !IDENTIFIER.test(model)) ||
        new Set(capabilities.modelReferences).size !== capabilities.modelReferences.length ||
        !capabilities.supportedResidencies.length ||
        capabilities.supportedResidencies.some((value) => !["MANAGED_CLOUD", "LOCAL"].includes(value)) ||
        new Set(capabilities.supportedResidencies).size !== capabilities.supportedResidencies.length) {
      throw new Error("MODEL_PROVIDER_CAPABILITIES_INVALID");
    }
    if (providerIds.has(capabilities.providerAdapterId)) throw new Error("MODEL_PROVIDER_ID_DUPLICATE");
    providerIds.add(capabilities.providerAdapterId);
    ports.push(port);
  }
  return Object.freeze([...ports]);
}
