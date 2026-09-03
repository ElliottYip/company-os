import { createHash } from "node:crypto";
import { tenantAssertedEmailHmac } from "../security/tenant-identity-email-hmac.ts";
import type { GenericOAuthConfig } from "better-auth/plugins";

export interface FeishuOAuthConfiguration {
  readonly baseUrl: string;
  readonly redirectUri: string;
  readonly appId: string;
  readonly appSecret: string;
  readonly providerId?: string;
  readonly expectedTenantKey?: string;
  readonly expectedTenantDigest?: string;
  readonly tenantScopedAlias?: boolean;
  readonly assertedEmailHmacKey?: Buffer;
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const AUTHORIZATION_URL = "https://accounts.feishu.cn/open-apis/authen/v1/authorize";
const TOKEN_URL = "https://open.feishu.cn/open-apis/authen/v2/oauth/token";
const USER_INFO_URL = "https://open.feishu.cn/open-apis/authen/v1/user_info";
const SCOPES = ["auth:user.id:read", "contact:user.email:readonly"] as const;
const PROVIDER_ID = "feishu";
const MAX_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MILLISECONDS = 10_000;
const PORTABLE_FEISHU_ID = /^[A-Za-z0-9_-]{3,255}$/;
const DYNAMIC_PROVIDER_ID = /^feishu-[a-z0-9](?:[a-z0-9-]{1,92}[a-z0-9])?$/;
const TENANT_DIGEST = /^sha256:[a-f0-9]{64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function required(value: string, code: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function httpsUrl(value: string, code: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(code); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error(code);
  return url;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function boundedJson(response: Response, failureCode: string): Promise<Record<string, unknown>> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) throw new Error(failureCode);
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) throw new Error(failureCode);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error(failureCode); }
  const value = record(parsed);
  if (!response.ok || !value) throw new Error(failureCode);
  return value;
}

function boundedString(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && [...normalized].length <= maximum ? normalized : null;
}

function identityEmail(providerId: string, tenantKey: string, unionId: string): string {
  const digest = createHash("sha256")
    .update(providerId).update("\0").update(tenantKey).update("\0").update(unionId).digest("hex");
  return `feishu-${digest.slice(0, 40)}@identity.invalid`;
}

function digestTenantKey(tenantKey: string): string {
  return `sha256:${createHash("sha256").update(tenantKey).digest("hex")}`;
}

/**
 * Builds the Better Auth provider boundary for a tenant-owned Feishu app.
 * Feishu is OAuth 2.0 rather than OIDC here, so tenant and profile validation
 * happen explicitly before Better Auth may create or resume a local user.
 */
export function buildFeishuOAuthProvider(
  input: FeishuOAuthConfiguration,
  fetcher: Fetcher = fetch,
): GenericOAuthConfig {
  const baseUrl = httpsUrl(input.baseUrl, "AUTH_BASE_URL_HTTPS_REQUIRED").href.replace(/\/$/, "");
  const redirectUri = httpsUrl(input.redirectUri, "FEISHU_REDIRECT_URI_HTTPS_REQUIRED").href;
  const providerId = input.providerId?.trim() || PROVIDER_ID;
  if (providerId !== PROVIDER_ID && !DYNAMIC_PROVIDER_ID.test(providerId)) {
    throw new Error("FEISHU_PROVIDER_ID_INVALID");
  }
  const expectedRedirectUri = `${baseUrl}/api/auth/oauth2/callback/${providerId}`;
  if (redirectUri !== expectedRedirectUri) throw new Error("FEISHU_REDIRECT_URI_MISMATCH");
  const appId = required(input.appId, "FEISHU_APP_ID_REQUIRED");
  const appSecret = required(input.appSecret, "FEISHU_APP_SECRET_REQUIRED");
  const expectedTenantKey = input.expectedTenantKey?.trim() || undefined;
  const expectedTenantDigest = input.expectedTenantDigest?.trim() || undefined;
  if (!expectedTenantKey && !expectedTenantDigest) throw new Error("FEISHU_TENANT_KEY_REQUIRED");
  if (expectedTenantKey && expectedTenantDigest) throw new Error("FEISHU_TENANT_EXPECTATION_AMBIGUOUS");
  if (expectedTenantDigest && !TENANT_DIGEST.test(expectedTenantDigest)) {
    throw new Error("FEISHU_TENANT_DIGEST_INVALID");
  }
  if (providerId !== PROVIDER_ID && (!expectedTenantDigest || input.tenantScopedAlias !== true)) {
    throw new Error(!expectedTenantDigest
      ? "FEISHU_TENANT_DIGEST_REQUIRED"
      : "FEISHU_TENANT_SCOPED_ALIAS_REQUIRED");
  }
  if (!PORTABLE_FEISHU_ID.test(appId) || (expectedTenantKey && !PORTABLE_FEISHU_ID.test(expectedTenantKey))) {
    throw new Error("FEISHU_CONFIGURATION_IDENTIFIER_INVALID");
  }

  return {
    providerId,
    authorizationUrl: AUTHORIZATION_URL,
    tokenUrl: TOKEN_URL,
    userInfoUrl: USER_INFO_URL,
    clientId: appId,
    clientSecret: appSecret,
    redirectURI: redirectUri,
    scopes: [...SCOPES],
    pkce: true,
    responseType: "code",
    authentication: "post",
    disableImplicitSignUp: false,
    overrideUserInfo: input.tenantScopedAlias === true,
    async getToken({ code, redirectURI, codeVerifier }) {
      if (redirectURI !== redirectUri || !boundedString(code, 1_024) ||
          typeof codeVerifier !== "string" || !/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) {
        throw new Error("FEISHU_TOKEN_REQUEST_INVALID");
      }
      let response: Response;
      try {
        response = await fetcher(TOKEN_URL, {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8", accept: "application/json" },
          body: JSON.stringify({
            grant_type: "authorization_code",
            client_id: appId,
            client_secret: appSecret,
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
        });
      } catch { throw new Error("FEISHU_TOKEN_EXCHANGE_FAILED"); }
      const value = await boundedJson(response, "FEISHU_TOKEN_EXCHANGE_FAILED");
      const accessToken = boundedString(value.access_token, 4_096);
      const expiresIn = value.expires_in;
      if (value.code !== 0 || !accessToken || !Number.isSafeInteger(expiresIn) || Number(expiresIn) <= 0 ||
          Number(expiresIn) > 86_400 || value.token_type !== "Bearer") {
        throw new Error("FEISHU_TOKEN_EXCHANGE_FAILED");
      }
      const scope = typeof value.scope === "string"
        ? value.scope.split(" ").map((entry) => entry.trim()).filter(Boolean)
        : [];
      return {
        accessToken,
        tokenType: "Bearer",
        accessTokenExpiresAt: new Date(Date.now() + Number(expiresIn) * 1_000),
        scopes: scope,
      };
    },
    async getUserInfo(tokens) {
      const accessToken = boundedString(tokens.accessToken, 4_096);
      if (!accessToken) throw new Error("FEISHU_USER_INFO_TOKEN_REQUIRED");
      let response: Response;
      try {
        response = await fetcher(USER_INFO_URL, {
          method: "GET",
          headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
        });
      } catch { throw new Error("FEISHU_USER_INFO_FAILED"); }
      const envelope = await boundedJson(response, "FEISHU_USER_INFO_FAILED");
      const profile = record(envelope.data);
      if (envelope.code !== 0 || !profile) throw new Error("FEISHU_USER_INFO_FAILED");
      const tenantKey = boundedString(profile.tenant_key, 255);
      if (!tenantKey || (expectedTenantKey
        ? tenantKey !== expectedTenantKey
        : digestTenantKey(tenantKey) !== expectedTenantDigest)) {
        throw new Error("FEISHU_TENANT_MISMATCH");
      }
      const unionId = boundedString(profile.union_id, 255);
      const name = boundedString(profile.name, 120);
      const assertedEmail = boundedString(profile.enterprise_email, 254) ?? boundedString(profile.email, 254);
      if (!unionId || !PORTABLE_FEISHU_ID.test(unionId) || !name ||
          (assertedEmail !== null && !EMAIL.test(assertedEmail))) {
        throw new Error("FEISHU_USER_INFO_INVALID");
      }
      const email = input.tenantScopedAlias === true
        ? identityEmail(providerId, tenantKey, unionId)
        : assertedEmail?.toLocaleLowerCase("en-US") ?? identityEmail(providerId, tenantKey, unionId);
      const rawImage = boundedString(profile.avatar_url, 2_048);
      let image: string | undefined;
      if (rawImage) {
        try {
          const avatar = httpsUrl(rawImage, "FEISHU_AVATAR_INVALID");
          image = avatar.href;
        } catch { image = undefined; }
      }
      return {
        id: unionId,
        name,
        email,
        ...(assertedEmail && expectedTenantDigest && input.assertedEmailHmacKey
          ? { assertedEmailHmac: tenantAssertedEmailHmac({
              key: input.assertedEmailHmacKey,
              tenantDigest: expectedTenantDigest,
              email: assertedEmail,
            }) }
          : {}),
        ...(image ? { image } : {}),
        // When Feishu has no mail attribute, this is a non-deliverable stable
        // local alias derived from the verified tenant and subject. It exists
        // only because Better Auth requires an email-shaped user key.
        emailVerified: true,
      };
    },
  };
}
