import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";

import { createVaultKvV2Client, createVaultLeaseBroker, createVaultSecretBrokerHttpService } from "./index.mjs";

function required(environment, name, maximum = 4_096) {
  const value = environment[name]?.trim();
  if (!value || value.length > maximum || value.includes("\0")) throw new Error(`${name}_REQUIRED`);
  return value;
}
function file(environment, name, maximum = 16_384) {
  const path = required(environment, `${name}_FILE`);
  if (!isAbsolute(path)) throw new Error(`${name}_FILE_INVALID`);
  const metadata = statSync(path); if (!metadata.isFile() || metadata.size < 1 || metadata.size > maximum) {
    throw new Error(`${name}_FILE_INVALID`);
  }
  const value = readFileSync(path, "utf8").trim(); if (!value) throw new Error(`${name}_FILE_INVALID`); return value;
}
function integer(environment, name, fallback, minimum, maximum) {
  const value = Number(environment[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${name}_INVALID`);
  return value;
}
function brokerConfiguration(environment) {
  const path = required(environment, "COMPANY_OS_VAULT_BROKER_REFERENCES_FILE");
  if (!isAbsolute(path)) throw new Error("COMPANY_OS_VAULT_BROKER_REFERENCES_FILE_INVALID");
  const metadata = statSync(path); if (!metadata.isFile() || metadata.size < 2 || metadata.size > 1_048_576) {
    throw new Error("COMPANY_OS_VAULT_BROKER_REFERENCES_FILE_INVALID");
  }
  let value; try { value = JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new Error("COMPANY_OS_VAULT_BROKER_REFERENCES_INVALID"); }
  const profiles = value?.managementProfiles ?? [];
  if (value?.schemaVersion !== 1 || !Array.isArray(value.references) || !Array.isArray(profiles) ||
      (!value.references.length && !profiles.length) || value.references.length > 1_000 || profiles.length > 1_000) {
    throw new Error("COMPANY_OS_VAULT_BROKER_REFERENCES_INVALID");
  }
  return { references: value.references, managementProfiles: profiles };
}

export function createVaultSecretBrokerService(environment = process.env) {
  const configuration = brokerConfiguration(environment);
  const vaultClient = createVaultKvV2Client({ address: required(environment, "COMPANY_OS_VAULT_ADDRESS", 2_048),
    allowInsecureLoopback: environment.COMPANY_OS_VAULT_ALLOW_INSECURE_LOOPBACK === "true",
    namespace: environment.COMPANY_OS_VAULT_NAMESPACE?.trim() || null,
    authMount: environment.COMPANY_OS_VAULT_AUTH_MOUNT?.trim() || "approle",
    roleId: file(environment, "COMPANY_OS_VAULT_ROLE_ID"), secretId: file(environment, "COMPANY_OS_VAULT_SECRET_ID"),
    requestTimeoutMs: integer(environment, "COMPANY_OS_VAULT_REQUEST_TIMEOUT_MS", 10_000, 250, 60_000) });
  const broker = createVaultLeaseBroker({ stateFile: required(environment, "COMPANY_OS_VAULT_BROKER_STATE_FILE"),
    referenceStateFile: environment.COMPANY_OS_VAULT_BROKER_REFERENCE_STATE_FILE?.trim() ||
      `${required(environment, "COMPANY_OS_VAULT_BROKER_STATE_FILE")}.references`,
    references: configuration.references, managementProfiles: configuration.managementProfiles,
    ...(configuration.managementProfiles.length ? {
      managementPublicOrigin: required(environment, "COMPANY_OS_VAULT_BROKER_PUBLIC_URL", 2_048),
      managementSigningKey: file(environment, "COMPANY_OS_VAULT_BROKER_MANAGEMENT_SIGNING_KEY"),
    } : {}), vaultClient,
    maximumLeaseSeconds: integer(environment, "COMPANY_OS_VAULT_BROKER_MAXIMUM_LEASE_SECONDS", 600, 1, 900) });
  return createVaultSecretBrokerHttpService({ broker,
    controlBearerToken: file(environment, "COMPANY_OS_VAULT_BROKER_CONTROL_BEARER_TOKEN"),
    executionBearerToken: file(environment, "COMPANY_OS_VAULT_BROKER_EXECUTION_BEARER_TOKEN") });
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const service = createVaultSecretBrokerService();
  const host = process.env.COMPANY_OS_VAULT_BROKER_HOST?.trim() || "127.0.0.1";
  const port = integer(process.env, "COMPANY_OS_VAULT_BROKER_PORT", 4321, 1, 65_535);
  service.listen(port, host, () => process.stdout.write(`${JSON.stringify({
    schemaVersion: 1, event: "company_os.vault_secret_broker_started",
  })}\n`));
  const shutdown = () => service.close(() => process.exit(0));
  process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown);
}
