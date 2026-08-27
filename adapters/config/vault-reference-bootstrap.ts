export interface VaultBootstrapRequest {
  readonly method: "GET" | "POST" | "PUT";
  readonly path: string;
  readonly token?: string;
  readonly body?: unknown;
}

export interface VaultBootstrapTransport {
  request(input: VaultBootstrapRequest): Promise<unknown>;
}

export interface VaultBootstrapSecretSink {
  writeInitialization(input: {
    readonly schemaVersion: 1;
    readonly seal: "SHAMIR";
    readonly secretShares: 1;
    readonly secretThreshold: 1;
    readonly unsealKeyBase64: string;
    readonly initialRootToken: string;
  }): Promise<void>;
  writeAppRole(input: { readonly roleId: string; readonly secretId: string }): Promise<void>;
  finalizeInitialization(input: {
    readonly schemaVersion: 1;
    readonly seal: "SHAMIR";
    readonly secretShares: 1;
    readonly secretThreshold: 1;
    readonly unsealKeyBase64: string;
    readonly initialRootTokenRevoked: true;
  }): Promise<void>;
}

export async function bootstrapReferenceVault(input: {
  readonly siteId: string;
  readonly transport: VaultBootstrapTransport;
  readonly secretSink: VaultBootstrapSecretSink;
}): Promise<{ readonly schemaVersion: 1; readonly status: "VAULT_BOOTSTRAPPED_NOT_STARTED";
  readonly authMethod: "APPROLE"; readonly secretsEngine: "KV_V2"; readonly initialRootTokenRevoked: true }> {
  if (!/^[a-z0-9][a-z0-9-]{2,95}$/.test(input.siteId) || !input.transport || !input.secretSink) {
    throw new Error("VAULT_REFERENCE_BOOTSTRAP_INPUT_INVALID");
  }
  let initialized = false;
  try {
    const status = record(await input.transport.request({ method: "GET", path: "/v1/sys/init" }));
    if (status.initialized !== false) throw new Error("VAULT_REFERENCE_ALREADY_INITIALIZED_REVIEW_REQUIRED");
    const initialization = record(await input.transport.request({ method: "POST", path: "/v1/sys/init",
      body: { secret_shares: 1, secret_threshold: 1 } }));
    initialized = true;
    const keys = Array.isArray(initialization.keys_base64) ? initialization.keys_base64 : [];
    const unsealKeyBase64 = secret(keys.length === 1 ? keys[0] : undefined,
      "VAULT_REFERENCE_INITIALIZATION_RESPONSE_INVALID");
    const initialRootToken = secret(initialization.root_token,
      "VAULT_REFERENCE_INITIALIZATION_RESPONSE_INVALID");
    await input.secretSink.writeInitialization({ schemaVersion: 1, seal: "SHAMIR", secretShares: 1,
      secretThreshold: 1, unsealKeyBase64, initialRootToken });

    const unseal = record(await input.transport.request({ method: "POST", path: "/v1/sys/unseal",
      body: { key: unsealKeyBase64 } }));
    if (unseal.sealed !== false) throw new Error("VAULT_REFERENCE_UNSEAL_FAILED");
    const authenticated = (method: "GET" | "POST" | "PUT", path: string, body?: unknown) =>
      input.transport.request({ method, path, token: initialRootToken, ...(body === undefined ? {} : { body }) });
    await authenticated("POST", "/v1/sys/mounts/company-os", {
      type: "kv", description: "Company OS site-owned provider material", options: { version: "2" },
    });
    await authenticated("POST", "/v1/sys/auth/approle", {
      type: "approle", description: "Company OS Vault Secret Broker",
    });
    const prefix = `${input.siteId}/model-providers`;
    await authenticated("PUT", "/v1/sys/policies/acl/company-os-broker", {
      policy: [`path "company-os/data/${prefix}/*" {`,
        '  capabilities = ["create", "update", "read"]', "}"].join("\n"),
    });
    await authenticated("POST", "/v1/auth/approle/role/company-os-broker", {
      token_policies: ["company-os-broker"], token_type: "batch", token_ttl: "5m",
      token_max_ttl: "10m", bind_secret_id: true, secret_id_ttl: 0, secret_id_num_uses: 0,
    });
    const role = record(await authenticated("GET", "/v1/auth/approle/role/company-os-broker/role-id"));
    const issued = record(await authenticated("POST",
      "/v1/auth/approle/role/company-os-broker/secret-id", {}));
    const roleId = secret(record(role.data).role_id, "VAULT_REFERENCE_APPROLE_RESPONSE_INVALID");
    const secretId = secret(record(issued.data).secret_id, "VAULT_REFERENCE_APPROLE_RESPONSE_INVALID");
    const login = record(await input.transport.request({ method: "POST", path: "/v1/auth/approle/login",
      body: { role_id: roleId, secret_id: secretId } }));
    secret(record(login.auth).client_token, "VAULT_REFERENCE_APPROLE_LOGIN_INVALID");
    await input.secretSink.writeAppRole({ roleId, secretId });
    await authenticated("POST", "/v1/auth/token/revoke-self", {});
    await input.secretSink.finalizeInitialization({ schemaVersion: 1, seal: "SHAMIR", secretShares: 1,
      secretThreshold: 1, unsealKeyBase64, initialRootTokenRevoked: true });
    return { schemaVersion: 1, status: "VAULT_BOOTSTRAPPED_NOT_STARTED", authMethod: "APPROLE",
      secretsEngine: "KV_V2", initialRootTokenRevoked: true };
  } catch (error) {
    if (error instanceof Error && error.message === "VAULT_REFERENCE_ALREADY_INITIALIZED_REVIEW_REQUIRED") {
      throw error;
    }
    throw new Error(initialized ? "VAULT_REFERENCE_BOOTSTRAP_FAILED_REQUIRES_REVIEW" :
      "VAULT_REFERENCE_BOOTSTRAP_FAILED_BEFORE_INITIALIZATION");
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("VAULT_REFERENCE_PROTOCOL_INVALID");
  }
  return value as Record<string, unknown>;
}

function secret(value: unknown, code: string): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 32_768 || value.includes("\0")) {
    throw new Error(code);
  }
  return value;
}
