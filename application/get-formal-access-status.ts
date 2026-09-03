export const FORMAL_ACCESS_CAPABILITIES = [
  "diagnostics", "identitySettings", "companyData", "companyMutation",
  "execution", "approval", "governance",
] as const;

export type FormalAccessCapability = typeof FORMAL_ACCESS_CAPABILITIES[number];
export type FormalAccessEntryState = "BLOCKED" | "AUTHENTICATION_REQUIRED" | "READY";

export interface FormalAccessStatus {
  readonly schemaVersion: 1;
  readonly mode: "FORMAL";
  readonly deploymentProfile: "managed-cloud" | "self-hosted";
  readonly entryState: FormalAccessEntryState;
  readonly identityProvider: {
    readonly protocol: "OIDC" | "OAUTH2";
    readonly providerId: "enterprise-oidc" | "feishu";
    readonly configured: boolean;
  };
  readonly session: { readonly authenticated: boolean };
  readonly capabilities: Readonly<Record<FormalAccessCapability, boolean>>;
  readonly blockers: readonly {
    readonly code: "FORMAL_OIDC_NOT_CONFIGURED" | "FORMAL_FEISHU_NOT_CONFIGURED" |
      "FORMAL_IDENTITY_RUNTIME_UNAVAILABLE" | "FORMAL_IDENTITY_REQUIRED";
    readonly parameters: Readonly<Record<string, readonly string[]>>;
  }[];
}

export interface FormalAccessConfiguration {
  readonly provider?: "OIDC" | "FEISHU";
  readonly publicBaseUrl?: string;
  readonly issuer?: string;
  readonly discoveryUrl?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly redirectUri?: string;
  readonly sessionSigningKey?: string;
  readonly databaseUrl?: string;
  readonly feishuAppId?: string;
  readonly feishuAppSecret?: string;
  readonly feishuTenantKey?: string;
}

export function getFormalAccessStatus(input: {
  readonly deploymentProfile: "managed-cloud" | "self-hosted";
  readonly configuration: FormalAccessConfiguration;
  readonly authenticated?: boolean;
  readonly identityRuntimeHealthy?: boolean;
}): FormalAccessStatus {
  const provider = input.configuration.provider === "FEISHU" ? "FEISHU" : "OIDC";
  const required = provider === "FEISHU"
    ? (["publicBaseUrl", "feishuAppId", "feishuAppSecret", "feishuTenantKey", "redirectUri",
        "sessionSigningKey", "databaseUrl"] as const)
    : (["publicBaseUrl", "issuer", "discoveryUrl", "clientId", "clientSecret", "redirectUri",
        "sessionSigningKey", "databaseUrl"] as const);
  const missing = required
    .filter((key) => !input.configuration[key]?.trim());
  const configured = missing.length === 0;
  const authenticated = configured && input.authenticated === true;
  const runtimeHealthy = input.identityRuntimeHealthy !== false;
  const entryState: FormalAccessEntryState = !configured || !runtimeHealthy
    ? "BLOCKED"
    : authenticated ? "READY" : "AUTHENTICATION_REQUIRED";

  return {
    schemaVersion: 1,
    mode: "FORMAL",
    deploymentProfile: input.deploymentProfile,
    entryState,
    identityProvider: provider === "FEISHU"
      ? { protocol: "OAUTH2", providerId: "feishu", configured }
      : { protocol: "OIDC", providerId: "enterprise-oidc", configured },
    session: { authenticated },
    capabilities: {
      diagnostics: true,
      identitySettings: true,
      companyData: authenticated,
      companyMutation: authenticated,
      execution: authenticated,
      approval: authenticated,
      governance: authenticated,
    },
    blockers: entryState === "BLOCKED"
      ? [configured
          ? { code: "FORMAL_IDENTITY_RUNTIME_UNAVAILABLE" as const, parameters: {} }
          : { code: provider === "FEISHU" ? "FORMAL_FEISHU_NOT_CONFIGURED" as const
            : "FORMAL_OIDC_NOT_CONFIGURED" as const, parameters: { missing } }]
      : entryState === "AUTHENTICATION_REQUIRED"
        ? [{ code: "FORMAL_IDENTITY_REQUIRED", parameters: {} }]
        : [],
  };
}
