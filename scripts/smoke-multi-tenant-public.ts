import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

type SmokeFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface PublicMultiTenantSmokeResult {
  readonly ok: true;
  readonly releaseId: string;
  readonly startStatus: 200;
  readonly invalidInviteStatus: 403;
  readonly missingTenantStatus: 404;
  readonly missingCallbackStatus: 404;
  readonly probeSlug: string;
}

function exactBaseUrl(value: string, code: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(code); }
  const loopback = url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if ((!loopback && url.protocol !== "https:") || url.username || url.password || url.search || url.hash ||
      !["", "/"].includes(url.pathname)) throw new Error(code);
  return url.origin;
}

async function errorCode(response: Response): Promise<string> {
  const payload = await response.json().catch(() => null) as { readonly error?: { readonly code?: unknown } } | null;
  return typeof payload?.error?.code === "string" ? payload.error.code : "PUBLIC_SMOKE_RESPONSE_INVALID";
}

function expectStatus(actual: number, expected: number, code: string): void {
  if (actual !== expected) throw new Error(`${code}:${actual}`);
}

export async function runPublicMultiTenantSmoke(input: {
  readonly webBaseUrl: string;
  readonly apiBaseUrl: string;
  readonly probeSuffix?: string;
  readonly fetcher?: SmokeFetch;
}): Promise<PublicMultiTenantSmokeResult> {
  const webBaseUrl = exactBaseUrl(input.webBaseUrl, "PUBLIC_SMOKE_WEB_URL_INVALID");
  const apiBaseUrl = exactBaseUrl(input.apiBaseUrl, "PUBLIC_SMOKE_API_URL_INVALID");
  const probeSuffix = input.probeSuffix ?? randomBytes(6).toString("hex");
  if (!/^[a-f0-9]{12}$/.test(probeSuffix)) throw new Error("PUBLIC_SMOKE_SUFFIX_INVALID");
  const probeSlug = `smoke-${probeSuffix}`;
  const fetcher = input.fetcher ?? fetch;
  const nonCredentialProbeMaterial = ["public", "smoke", "not", "a", "credential"].join("-");

  const start = await fetcher(`${webBaseUrl}/start`, {
    method: "GET",
    headers: { accept: "text/html" },
    redirect: "error",
  });
  expectStatus(start.status, 200, "PUBLIC_SMOKE_START_UNAVAILABLE");
  if (!start.headers.get("content-type")?.toLowerCase().startsWith("text/html")) {
    throw new Error("PUBLIC_SMOKE_START_CONTENT_TYPE_INVALID");
  }
  const releaseId = start.headers.get("x-company-os-release-id")?.trim() ?? "";
  if (!releaseId || releaseId.length > 160) throw new Error("PUBLIC_SMOKE_RELEASE_ID_INVALID");

  const invalidInvite = await fetcher(`${apiBaseUrl}/api/v1/tenant-registrations`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: webBaseUrl },
    body: JSON.stringify({
      companyName: "Company OS public smoke probe",
      slug: probeSlug,
      inviteCode: "COS-AAAAA-AAAAA-AAAAA-AAAAA",
      appId: "public-smoke-invalid-app",
      appSecret: nonCredentialProbeMaterial,
    }),
    redirect: "error",
  });
  expectStatus(invalidInvite.status, 403, "PUBLIC_SMOKE_INVALID_INVITE_NOT_REJECTED");
  if (await errorCode(invalidInvite) !== "TENANT_SIGNUP_NOT_ALLOWED") {
    throw new Error("PUBLIC_SMOKE_INVALID_INVITE_RESPONSE_INVALID");
  }

  const missingTenant = await fetcher(`${apiBaseUrl}/t/${probeSlug}/sign-in`, {
    method: "POST",
    redirect: "error",
  });
  expectStatus(missingTenant.status, 404, "PUBLIC_SMOKE_UNKNOWN_TENANT_DID_NOT_FAIL_CLOSED");
  if (await errorCode(missingTenant) !== "TENANT_AUTH_ROUTE_NOT_FOUND") {
    throw new Error("PUBLIC_SMOKE_UNKNOWN_TENANT_RESPONSE_INVALID");
  }

  const missingCallback = await fetcher(
    `${apiBaseUrl}/api/auth/oauth2/callback/feishu-${probeSlug}?code=public-smoke&state=public-smoke`,
    { method: "GET", redirect: "error" },
  );
  expectStatus(missingCallback.status, 404, "PUBLIC_SMOKE_UNKNOWN_CALLBACK_DID_NOT_FAIL_CLOSED");
  if (await errorCode(missingCallback) !== "TENANT_AUTH_ROUTE_NOT_FOUND") {
    throw new Error("PUBLIC_SMOKE_UNKNOWN_CALLBACK_RESPONSE_INVALID");
  }

  return {
    ok: true,
    releaseId,
    startStatus: 200,
    invalidInviteStatus: 403,
    missingTenantStatus: 404,
    missingCallbackStatus: 404,
    probeSlug,
  };
}

async function main(): Promise<void> {
  const result = await runPublicMultiTenantSmoke({
    webBaseUrl: process.argv[2] ?? "https://anc.raft.xin",
    apiBaseUrl: process.argv[3] ?? "https://api.anc.raft.xin",
  });
  console.log(JSON.stringify(result, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "PUBLIC_SMOKE_FAILED");
    process.exitCode = 1;
  });
}
