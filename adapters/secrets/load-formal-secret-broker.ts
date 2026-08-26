import type { SecretPurpose } from "../../core/secret-governance.ts";
import type { SecretBrokerRuntimePort } from "../../ports/secret-broker-runtime-port.ts";

const PACKAGE_SPECIFIER = /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/;
const IDENTIFIER = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PURPOSES: readonly SecretPurpose[] = [
  "MODEL_PROVIDER", "DATA_CONNECTOR", "AGENT_CONNECTOR", "IDENTITY_ADAPTER",
];

export interface CompanyOsSecretBrokerModule {
  readonly createSecretBrokerRuntimePort?: () => SecretBrokerRuntimePort | Promise<SecretBrokerRuntimePort>;
}

export type SecretBrokerModuleImporter = (specifier: string) => Promise<CompanyOsSecretBrokerModule>;

export function parseFormalSecretBrokerPackage(source: string | undefined): string | null {
  if (!source?.trim()) return null;
  const packageName = source.trim();
  if (!PACKAGE_SPECIFIER.test(packageName)) throw new Error("SECRET_BROKER_PACKAGE_INVALID");
  return packageName;
}

function validatePort(value: unknown): asserts value is SecretBrokerRuntimePort {
  if (!value || typeof value !== "object") throw new Error("SECRET_BROKER_PORT_INVALID");
  const candidate = value as Record<string, unknown>;
  for (const method of ["capabilities", "health", "describe", "issueLease", "revokeLease"]) {
    if (typeof candidate[method] !== "function") throw new Error("SECRET_BROKER_PORT_INVALID");
  }
  const managementMethods = ["beginReferenceManagement", "referenceManagementResult"]
    .filter((method) => typeof candidate[method] === "function");
  if (managementMethods.length === 1) throw new Error("SECRET_BROKER_PORT_INVALID");
}

export async function loadFormalSecretBroker(
  packageName: string | null,
  importer: SecretBrokerModuleImporter = (specifier) => import(specifier) as Promise<CompanyOsSecretBrokerModule>,
): Promise<SecretBrokerRuntimePort | null> {
  if (!packageName) return null;
  const module = await importer(packageName);
  if (typeof module.createSecretBrokerRuntimePort !== "function") {
    throw new Error("SECRET_BROKER_MODULE_FACTORY_REQUIRED");
  }
  const port = await module.createSecretBrokerRuntimePort();
  validatePort(port);
  const capabilities = await port.capabilities();
  if (!IDENTIFIER.test(capabilities.brokerId) || !capabilities.displayName.trim() ||
      capabilities.displayName.length > 120 || capabilities.protocolVersion !== "1.0" ||
      !Number.isSafeInteger(capabilities.maximumLeaseSeconds) ||
      capabilities.maximumLeaseSeconds < 1 || capabilities.maximumLeaseSeconds > 900 ||
      !capabilities.supportedPurposes.length ||
      new Set(capabilities.supportedPurposes).size !== capabilities.supportedPurposes.length ||
      capabilities.supportedPurposes.some((purpose) => !PURPOSES.includes(purpose))) {
    throw new Error("SECRET_BROKER_CAPABILITIES_INVALID");
  }
  return port;
}
