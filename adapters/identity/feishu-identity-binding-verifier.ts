import { createHash } from "node:crypto";
import type {
  IdentityBindingVerificationPort,
  VerifiedIdentityBinding,
} from "../../ports/identity-binding-verification-port.ts";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const TOKEN_URL = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
const TENANT_URL = "https://open.feishu.cn/open-apis/tenant/v2/tenant/query";
const IDENTIFIER = /^[A-Za-z0-9_-]{3,255}$/;
const CLIENT_SECRET = /^[A-Za-z0-9_-]{16,1024}$/;
const MAXIMUM_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MILLISECONDS = 10_000;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
function boundedString(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && [...normalized].length <= maximum ? normalized : null;
}

async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAXIMUM_RESPONSE_BYTES) {
    throw new Error("REMOTE_RESPONSE_INVALID");
  }
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > MAXIMUM_RESPONSE_BYTES) throw new Error("REMOTE_RESPONSE_INVALID");
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { throw new Error("REMOTE_RESPONSE_INVALID"); }
  const value = record(parsed);
  if (!response.ok || !value) throw new Error("REMOTE_RESPONSE_INVALID");
  return value;
}

async function request(fetcher: Fetcher, url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetcher(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
  });
  return boundedJson(response);
}

export function createFeishuIdentityBindingVerifier(
  fetcher: Fetcher = fetch,
): IdentityBindingVerificationPort {
  return {
    async verify(input): Promise<VerifiedIdentityBinding> {
      const clientId = input.clientId.trim();
      const clientSecret = input.clientSecret.trim();
      if (!IDENTIFIER.test(clientId) || !CLIENT_SECRET.test(clientSecret)) {
        throw new Error("IDENTITY_BINDING_CREDENTIALS_INVALID");
      }
      try {
        const tokenEnvelope = await request(fetcher, TOKEN_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json; charset=utf-8",
            accept: "application/json",
          },
          body: JSON.stringify({ app_id: clientId, app_secret: clientSecret }),
        });
        const accessToken = boundedString(tokenEnvelope.tenant_access_token, 4_096);
        if (tokenEnvelope.code !== 0 || !accessToken || accessToken.length < 8 ||
            !Number.isSafeInteger(tokenEnvelope.expire) || Number(tokenEnvelope.expire) <= 0 ||
            Number(tokenEnvelope.expire) > 86_400) {
          throw new Error("REMOTE_RESPONSE_INVALID");
        }

        const tenantEnvelope = await request(fetcher, TENANT_URL, {
          method: "GET",
          headers: {
            authorization: `Bearer ${accessToken}`,
            accept: "application/json",
          },
        });
        const tenant = record(record(tenantEnvelope.data)?.tenant);
        const tenantKey = boundedString(tenant?.tenant_key, 255);
        const tenantDisplayName = boundedString(tenant?.name, 160);
        if (tenantEnvelope.code !== 0 || !tenantKey || !IDENTIFIER.test(tenantKey) || !tenantDisplayName) {
          throw new Error("REMOTE_RESPONSE_INVALID");
        }
        return {
          providerFamily: "OAUTH2",
          providerKey: "feishu",
          clientId,
          externalTenantDigest: `sha256:${createHash("sha256").update(tenantKey).digest("hex")}`,
          tenantDisplayName,
        };
      } catch {
        throw new Error("IDENTITY_BINDING_VERIFICATION_FAILED");
      }
    },
  };
}
