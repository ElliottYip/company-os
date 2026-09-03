import { pathToFileURL } from "node:url";

import { readSecretFileEnvironment } from "../adapters/config/secret-file-environment.ts";
import { createFeishuIdentityBindingVerifier } from
  "../adapters/identity/feishu-identity-binding-verifier.ts";
import { createCompanyDatabase } from
  "../adapters/persistence/postgres/company-database.ts";
import { PostgresLegacyTenantBootstrapStore } from
  "../adapters/persistence/postgres/postgres-legacy-tenant-bootstrap-store.ts";
import { nextPostgresRecordId } from
  "../adapters/persistence/postgres/postgres-company-access-store.ts";
import { createTenantSecretEnvelope } from
  "../adapters/security/tenant-secret-envelope.ts";
import { BootstrapLegacyTenantRoute } from
  "../application/bootstrap-legacy-tenant-route.ts";

type OperationInput = {
  readonly companyId: string;
  readonly ownerUserId: string;
  readonly slug: string;
  readonly appId: string;
  readonly appSecret: string;
};

type Receipt = {
  readonly schemaVersion: 1;
  readonly status: "READY" | "CREATED" | "ALREADY_PRESENT";
  readonly mode: "verify-only" | "apply";
  readonly companyId: string;
  readonly slug: string;
  readonly provider: "FEISHU";
  readonly secretMaterialIncluded: false;
};

function required(value: string | undefined, code: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

export function decodeTenantMasterKey(input: {
  readonly version: string | undefined;
  readonly encoded: string | undefined;
}): { readonly version: string; readonly key: Buffer } {
  const version = input.version?.trim() ?? "";
  const encoded = input.encoded?.trim() ?? "";
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(version) || !/^[A-Za-z0-9_-]{43}$/.test(encoded)) {
    throw new Error("TENANT_SECRET_MASTER_KEY_CONFIGURATION_INVALID");
  }
  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== encoded) {
    throw new Error("TENANT_SECRET_MASTER_KEY_CONFIGURATION_INVALID");
  }
  return { version, key };
}

export async function withDecodedTenantMasterKey<T>(input: {
  readonly version: string | undefined;
  readonly encoded: string | undefined;
}, operation: (material: { readonly version: string; readonly key: Buffer }) => Promise<T>): Promise<T> {
  const material = decodeTenantMasterKey(input);
  try {
    return await operation(material);
  } finally {
    material.key.fill(0);
  }
}

export async function runLegacyTenantBootstrapOperation(input: {
  readonly mode: "verify-only" | "apply";
  readonly input: OperationInput;
  readonly preflight: (operation: OperationInput) => Promise<{
    readonly status: "READY" | "ALREADY_PRESENT";
    readonly companyId: string;
    readonly slug: string;
  }>;
  readonly bootstrap: (operation: OperationInput) => Promise<{
    readonly status: "CREATED" | "ALREADY_PRESENT";
    readonly companyId: string;
    readonly slug: string;
  }>;
}): Promise<Receipt> {
  if (input.mode === "verify-only") {
    const preflight = await input.preflight(input.input);
    return {
      schemaVersion: 1,
      status: preflight.status,
      mode: input.mode,
      companyId: preflight.companyId,
      slug: preflight.slug,
      provider: "FEISHU",
      secretMaterialIncluded: false,
    };
  }
  const result = await input.bootstrap(input.input);
  return {
    schemaVersion: 1,
    status: result.status,
    mode: input.mode,
    companyId: result.companyId,
    slug: result.slug,
    provider: "FEISHU",
    secretMaterialIncluded: false,
  };
}

export async function main(
  args: readonly string[] = process.argv.slice(2),
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (args.length !== 1 || !["--verify-only", "--apply"].includes(args[0]!)) {
    throw new Error("LEGACY_TENANT_BOOTSTRAP_MODE_REQUIRED");
  }
  const mode = args[0] === "--apply" ? "apply" : "verify-only";
  const appSecret = required(await readSecretFileEnvironment(
    "COMPANY_OS_FEISHU_APP_SECRET", environment,
  ), "FEISHU_APP_SECRET_REQUIRED");
  const operationInput: OperationInput = {
    companyId: required(environment.COMPANY_OS_LEGACY_TENANT_COMPANY_ID,
      "LEGACY_TENANT_COMPANY_ID_REQUIRED"),
    ownerUserId: required(environment.COMPANY_OS_LEGACY_TENANT_OWNER_USER_ID,
      "LEGACY_TENANT_OWNER_USER_ID_REQUIRED"),
    slug: required(environment.COMPANY_OS_LEGACY_TENANT_SLUG, "LEGACY_TENANT_SLUG_REQUIRED"),
    appId: required(environment.COMPANY_OS_FEISHU_APP_ID, "FEISHU_APP_ID_REQUIRED"),
    appSecret,
  };
  const verifier = createFeishuIdentityBindingVerifier();
  const connectionString = required(await readSecretFileEnvironment(
    "COMPANY_OS_DATABASE_URL", environment,
  ), "DATABASE_URL_REQUIRED");
  const database = createCompanyDatabase(connectionString);
  try {
    await database.checkSchema();
    const store = new PostgresLegacyTenantBootstrapStore(database.db);
    const buildService = (envelope: ConstructorParameters<typeof BootstrapLegacyTenantRoute>[0]["envelope"]) =>
      new BootstrapLegacyTenantRoute({
        verify: verifier,
        store,
        envelope,
        nextId: nextPostgresRecordId,
        now: () => new Date().toISOString(),
      });
    let receipt: Receipt;
    if (mode === "verify-only") {
      const preflightService = buildService({
        seal() { throw new Error("LEGACY_TENANT_BOOTSTRAP_APPLY_NOT_AUTHORIZED"); },
      });
      receipt = await runLegacyTenantBootstrapOperation({
        mode,
        input: operationInput,
        preflight: (operation) => preflightService.preflight(operation),
        bootstrap: async () => { throw new Error("LEGACY_TENANT_BOOTSTRAP_APPLY_NOT_AUTHORIZED"); },
      });
    } else {
      const encoded = await readSecretFileEnvironment("COMPANY_OS_TENANT_SECRET_MASTER_KEY", environment);
      receipt = await withDecodedTenantMasterKey({
        version: environment.COMPANY_OS_TENANT_SECRET_KEY_VERSION,
        encoded,
      }, async (masterKey) => {
        const applyService = buildService(createTenantSecretEnvelope({
          activeKeyVersion: masterKey.version,
          keys: new Map([[masterKey.version, masterKey.key]]),
        }));
        return runLegacyTenantBootstrapOperation({
          mode,
          input: operationInput,
          preflight: (operation) => applyService.preflight(operation),
          bootstrap: (operation) => applyService.bootstrap(operation),
        });
      });
    }
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  } finally {
    await database.close();
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) await main();
