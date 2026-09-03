import type { IncomingMessage, ServerResponse } from "node:http";

export interface TenantAuthRuntime {
  readonly slug: string;
  readonly providerId: string;
  readonly status: "ACTIVE" | "DISABLED";
  handle(request: Request): Promise<Response>;
}

export interface TenantAuthRouteResolver {
  resolveBySlug(slug: string): Promise<TenantAuthRuntime | null>;
  resolveByProviderId(providerId: string): Promise<TenantAuthRuntime | null>;
}

export function isTenantAuthPath(pathname: string): boolean {
  return /^\/t\/[^/]+\/sign-in$/.test(pathname) ||
    /^\/api\/auth\/oauth2\/callback\/feishu-/.test(pathname);
}

const TENANT_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;
const DYNAMIC_PROVIDER_ID = /^feishu-[a-z0-9](?:[a-z0-9-]{1,92}[a-z0-9])?$/;

function exactHttpsBase(value: string, code: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(code); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      !["", "/"].includes(url.pathname)) throw new Error(code);
  return url.origin;
}

function notFound(): Response {
  return Response.json({ error: { code: "TENANT_AUTH_ROUTE_NOT_FOUND" } }, {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}

function active(runtime: TenantAuthRuntime | null, expected: {
  readonly slug?: string;
  readonly providerId?: string;
}): runtime is TenantAuthRuntime {
  return runtime !== null && runtime.status === "ACTIVE" &&
    (expected.slug === undefined || runtime.slug === expected.slug) &&
    (expected.providerId === undefined || runtime.providerId === expected.providerId) &&
    TENANT_SLUG.test(runtime.slug) && DYNAMIC_PROVIDER_ID.test(runtime.providerId);
}

/**
 * Selects one tenant-owned Better Auth runtime before OAuth state, accounts, or
 * user records can be touched. Dynamic provider callbacks deliberately never
 * fall back to the legacy provider.
 */
export function createTenantAuthRequestRouter(input: TenantAuthRouteResolver & {
  readonly authBaseUrl: string;
  readonly webBaseUrl: string;
  readonly legacyHandle: (request: Request) => Promise<Response>;
}): (request: Request) => Promise<Response> {
  const authBaseUrl = exactHttpsBase(input.authBaseUrl, "TENANT_AUTH_BASE_URL_INVALID");
  const webBaseUrl = exactHttpsBase(input.webBaseUrl, "TENANT_WEB_BASE_URL_INVALID");

  return async (request) => {
    const url = new URL(request.url);
    const signInMatch = /^\/t\/([^/]+)\/sign-in$/.exec(url.pathname);
    if (signInMatch) {
      if (request.method !== "POST") {
        return new Response(null, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } });
      }
      const slug = signInMatch[1]!;
      if (!TENANT_SLUG.test(slug)) return notFound();
      const runtime = await input.resolveBySlug(slug);
      if (!active(runtime, { slug })) return notFound();
      const headers = new Headers(request.headers);
      headers.set("content-type", "application/json; charset=utf-8");
      headers.delete("content-length");
      return runtime.handle(new Request(`${authBaseUrl}/api/auth/sign-in/oauth2`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          providerId: runtime.providerId,
          callbackURL: `${webBaseUrl}/t/${slug}`,
        }),
      }));
    }

    const callbackMatch = /^\/api\/auth\/oauth2\/callback\/([^/]+)$/.exec(url.pathname);
    const callbackProviderId = callbackMatch?.[1];
    if (callbackProviderId && callbackProviderId !== "feishu" && DYNAMIC_PROVIDER_ID.test(callbackProviderId)) {
      const runtime = await input.resolveByProviderId(callbackProviderId);
      if (!active(runtime, { providerId: callbackProviderId })) return notFound();
      const callbackUrl = new URL(`${authBaseUrl}${url.pathname}`);
      callbackUrl.search = url.search;
      return runtime.handle(new Request(callbackUrl, {
        method: request.method,
        headers: request.headers,
      }));
    }
    if (callbackProviderId?.startsWith("feishu-") && !DYNAMIC_PROVIDER_ID.test(callbackProviderId)) {
      return notFound();
    }
    return input.legacyHandle(request);
  };
}

function requestHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, raw] of Object.entries(request.headers)) {
    if (Array.isArray(raw)) raw.forEach((value) => headers.append(key, value));
    else if (raw !== undefined) headers.set(key, raw);
  }
  return headers;
}

async function writeWebResponse(source: Response, target: ServerResponse): Promise<void> {
  const headers: Record<string, string | string[]> = {};
  source.headers.forEach((value, key) => { if (key !== "set-cookie") headers[key] = value; });
  const cookieHeaders = source.headers.getSetCookie();
  if (cookieHeaders.length) headers["set-cookie"] = cookieHeaders;
  const body = Buffer.from(await source.arrayBuffer());
  if (!source.headers.has("content-length")) headers["content-length"] = String(body.length);
  target.writeHead(source.status, headers);
  target.end(body);
}

/** Bridges only tenant-owned sign-in and callback routes into Web Request auth runtimes. */
export function createTenantAuthNodeHandler(input: TenantAuthRouteResolver & {
  readonly authBaseUrl: string;
  readonly webBaseUrl: string;
  readonly legacyHandle: (request: Request) => Promise<Response>;
}): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  const authBaseUrl = exactHttpsBase(input.authBaseUrl, "TENANT_AUTH_BASE_URL_INVALID");
  const route = createTenantAuthRequestRouter(input);
  return async (request, response) => {
    const url = new URL(request.url ?? "/", authBaseUrl);
    if (!isTenantAuthPath(url.pathname)) {
      await writeWebResponse(notFound(), response);
      return;
    }
    const isSignIn = /^\/t\/[^/]+\/sign-in$/.test(url.pathname);
    const contentLength = Number(request.headers["content-length"] ?? 0);
    if ((isSignIn && (request.method !== "POST" || !Number.isSafeInteger(contentLength) || contentLength !== 0 ||
        request.headers["transfer-encoding"] !== undefined)) ||
        (!isSignIn && request.method !== "GET")) {
      await writeWebResponse(new Response(null, { status: 405, headers: { "cache-control": "no-store" } }), response);
      return;
    }
    const webRequest = new Request(new URL(`${url.pathname}${url.search}`, authBaseUrl), {
      method: request.method,
      headers: requestHeaders(request),
    });
    await writeWebResponse(await route(webRequest), response);
  };
}
