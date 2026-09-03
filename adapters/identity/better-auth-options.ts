import type { BetterAuthOptions } from "better-auth";
import { genericOAuth } from "better-auth/plugins";
import { isIP } from "node:net";
import { randomUUID } from "node:crypto";
import {
  buildFeishuOAuthProvider,
  type FeishuOAuthConfiguration,
} from "./feishu-oauth-provider.ts";

export interface CompanyOidcConfiguration {
  readonly provider?: "OIDC";
  readonly baseUrl: string;
  readonly redirectUri: string;
  readonly issuer: string;
  readonly discoveryUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly sessionSecret: string;
  readonly instanceId?: string;
  readonly trustedProxyCidrs?: readonly string[];
  readonly trustedWebOrigins?: readonly string[];
}

export interface CompanyFeishuConfiguration extends FeishuOAuthConfiguration {
  readonly provider: "FEISHU";
  readonly sessionSecret: string;
  readonly instanceId?: string;
  readonly trustedProxyCidrs?: readonly string[];
  readonly trustedWebOrigins?: readonly string[];
}

export type CompanyAuthConfiguration = CompanyOidcConfiguration | CompanyFeishuConfiguration;

export function parseCompanyIdentityProvider(value: string | undefined): "OIDC" | "FEISHU" {
  if (value === undefined || value === "OIDC") return "OIDC";
  if (value === "FEISHU") return "FEISHU";
  throw new Error("IDENTITY_PROVIDER_INVALID");
}

function required(value: string, code: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function httpsUrl(value: string, code: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(code);
  return url;
}

export function deriveCompanyAuthCookiePrefix(instanceId = "default"): string {
  const normalized = instanceId.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "default";
  return `company-os-${normalized}`;
}

function exactTrustedOrigin(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("AUTH_TRUSTED_ORIGIN_INVALID"); }
  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname) ||
      url.origin === "null" || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) {
    throw new Error("AUTH_TRUSTED_ORIGIN_INVALID");
  }
  return url.origin;
}

export function deriveCompanyAuthTrustedOrigins(
  baseUrl: string,
  trustedWebOrigins: readonly string[] = [],
): string[] {
  return [...new Set([
    httpsUrl(baseUrl, "AUTH_BASE_URL_HTTPS_REQUIRED").origin,
    ...trustedWebOrigins.map(exactTrustedOrigin),
  ])];
}

export function buildCompanyAuthOptions(
  input: CompanyOidcConfiguration,
  database: NonNullable<BetterAuthOptions["database"]>,
): BetterAuthOptions {
  const issuer = httpsUrl(input.issuer, "OIDC_ISSUER_HTTPS_REQUIRED").href.replace(/\/$/, "");
  const discoveryUrl = httpsUrl(input.discoveryUrl, "OIDC_DISCOVERY_URL_HTTPS_REQUIRED").href;
  const baseUrl = httpsUrl(input.baseUrl, "AUTH_BASE_URL_HTTPS_REQUIRED").href.replace(/\/$/, "");
  const redirectUri = httpsUrl(input.redirectUri, "OIDC_REDIRECT_URI_HTTPS_REQUIRED").href;
  // Better Auth genericOAuth owns this route; IdPs such as Keycloak compare it exactly.
  const expectedRedirectUri = `${baseUrl}/api/auth/oauth2/callback/enterprise-oidc`;
  if (redirectUri !== expectedRedirectUri) throw new Error("OIDC_REDIRECT_URI_MISMATCH");
  const clientId = required(input.clientId, "OIDC_CLIENT_ID_REQUIRED");
  const clientSecret = required(input.clientSecret, "OIDC_CLIENT_SECRET_REQUIRED");
  return hardenedSessionOptions(input, database, genericOAuth({
    config: [{
      providerId: "enterprise-oidc",
      issuer,
      discoveryUrl,
      clientId,
      clientSecret,
      scopes: ["openid", "profile", "email"],
      pkce: true,
      requireIssuerValidation: true,
      disableImplicitSignUp: false,
    }],
  }));
}

export function buildCompanyFeishuAuthOptions(
  input: CompanyFeishuConfiguration,
  database: NonNullable<BetterAuthOptions["database"]>,
): BetterAuthOptions {
  const provider = buildFeishuOAuthProvider(input);
  return hardenedSessionOptions(input, database, genericOAuth({ config: [provider] }));
}

export function buildConfiguredCompanyAuthOptions(
  input: CompanyAuthConfiguration,
  database: NonNullable<BetterAuthOptions["database"]>,
): BetterAuthOptions {
  return input.provider === "FEISHU"
    ? buildCompanyFeishuAuthOptions(input, database)
    : buildCompanyAuthOptions(input, database);
}

function hardenedSessionOptions(
  input: Pick<CompanyOidcConfiguration, "baseUrl" | "sessionSecret" | "instanceId" |
    "trustedProxyCidrs" | "trustedWebOrigins">,
  database: NonNullable<BetterAuthOptions["database"]>,
  plugin: NonNullable<BetterAuthOptions["plugins"]>[number],
): BetterAuthOptions {
  const baseUrl = httpsUrl(input.baseUrl, "AUTH_BASE_URL_HTTPS_REQUIRED").href.replace(/\/$/, "");
  const secret = required(input.sessionSecret, "SESSION_SIGNING_KEY_REQUIRED");
  if (Buffer.byteLength(secret, "utf8") < 32) throw new Error("SESSION_SIGNING_KEY_TOO_SHORT");
  return {
    baseURL: baseUrl,
    secret,
    database,
    trustedOrigins: deriveCompanyAuthTrustedOrigins(baseUrl, input.trustedWebOrigins),
    emailAndPassword: { enabled: false },
    user: {
      additionalFields: {
        assertedEmailHmac: {
          type: "string",
          required: false,
          input: true,
          returned: false,
          fieldName: "assertedEmailHmac",
        },
      },
    },
    account: {
      encryptOAuthTokens: true,
      storeStateStrategy: "database",
    },
    rateLimit: {
      enabled: true,
      storage: "database",
    },
    advanced: {
      cookiePrefix: deriveCompanyAuthCookiePrefix(input.instanceId),
      ipAddress: {
        ipAddressHeaders: ["x-company-os-client-chain"],
        trustedProxies: [...(input.trustedProxyCidrs ?? [])],
      },
      database: {
        generateId: () => randomUUID(),
      },
    },
    plugins: [plugin],
  };
}

export function parseTrustedProxyCidrs(value: string | undefined): readonly string[] {
  if (!value?.trim()) return [];
  const cidrs = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  for (const cidr of cidrs) {
    const [address, prefix, extra] = cidr.split("/");
    const family = address ? isIP(address) : 0;
    const maximum = family === 4 ? 32 : family === 6 ? 128 : -1;
    if (extra !== undefined || maximum < 0 ||
        (prefix !== undefined && (!/^\d{1,3}$/.test(prefix) || Number(prefix) > maximum))) {
      throw new Error("TRUSTED_PROXY_CIDR_INVALID");
    }
  }
  return cidrs;
}
