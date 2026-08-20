import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { CompanyWorkState } from "../../application/company-operations.ts";

export interface DemoApplicationClient {
  snapshot(): Promise<CompanyWorkState>;
  assignTask(): Promise<CompanyWorkState>;
  advance(): Promise<CompanyWorkState>;
  decide(decision: "APPROVED" | "REJECTED"): Promise<CompanyWorkState>;
  reset(): Promise<CompanyWorkState>;
}

export interface CompanyOsHttpServiceOptions {
  readonly runtime: DemoApplicationClient;
  readonly deploymentProfile: "managed-cloud" | "self-hosted";
  readonly allowedOrigins?: readonly string[];
  readonly maxBodyBytes?: number;
  readonly formalApi?: {
    getAgentBoss(companyId: string): Promise<unknown>;
  };
}

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const encoded = JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(encoded),
  });
  res.end(encoded);
}

function sendError(res: ServerResponse, status: number, code: string, message: string) {
  sendJson(res, status, { error: { code, message } });
}

function sendStructuredError(
  res: ServerResponse,
  status: number,
  code: string,
  parameters: Readonly<Record<string, string | number | boolean | null>> = {},
) {
  sendJson(res, status, { error: { code, parameters } });
}

async function readJson(req: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBodyBytes) throw new Error("REQUEST_BODY_TOO_LARGE");
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("INVALID_JSON");
  }
}

function isAllowedOrigin(req: IncomingMessage, allowedOrigins: readonly string[]) {
  const origin = req.headers.origin;
  return origin === undefined || allowedOrigins.includes(origin);
}

function actionFromBody(value: unknown):
  | { readonly action: "ASSIGN" | "ADVANCE" | "RESET" }
  | { readonly action: "DECIDE"; readonly decision: "APPROVED" | "REJECTED" }
  | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.action === "ASSIGN" || input.action === "ADVANCE" || input.action === "RESET") {
    return { action: input.action };
  }
  if (input.action === "DECIDE" && (input.decision === "APPROVED" || input.decision === "REJECTED")) {
    return { action: "DECIDE", decision: input.decision };
  }
  return null;
}

function publicErrorCode(error: unknown) {
  if (!(error instanceof Error)) return "INTERNAL_ERROR";
  const known = new Set([
    "WORK_ALREADY_ASSIGNED",
    "TOOL_ACTIVITY_ALREADY_RECORDED",
    "TOOL_ACTIVITY_REQUIRED",
    "APPROVAL_REQUIRES_ACCOUNTABLE_HUMAN",
    "APPROVAL_ALREADY_DECIDED",
  ]);
  return known.has(error.message) ? error.message : "OPERATION_REJECTED";
}

function formalError(error: unknown): { readonly status: number; readonly code: string } {
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  if (code === "FORMAL_IDENTITY_REQUIRED") return { status: 401, code };
  if (code === "TENANT_MISMATCH" || code === "AUTHORIZATION_PRINCIPAL_MISMATCH") {
    return { status: 403, code };
  }
  if (code === "ORGANIZATION_NOT_FOUND") return { status: 404, code };
  if (code === "FORMAL_API_UNAVAILABLE") return { status: 503, code };
  return { status: 409, code: "OPERATION_REJECTED" };
}

export function createCompanyOsHttpService(options: CompanyOsHttpServiceOptions): Server {
  const allowedOrigins = options.allowedOrigins ?? [];
  const maxBodyBytes = options.maxBodyBytes ?? 64 * 1024;
  const startedAt = Date.now();

  const server = createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const path = new URL(req.url ?? "/", "http://localhost").pathname;

    try {
      if (method === "GET" && path === "/health") {
        sendJson(res, 200, {
          status: "ok",
          service: "company-os",
          mode: "DEMO_FIXTURE",
          deploymentProfile: options.deploymentProfile,
          uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        });
        return;
      }
      if (method === "GET" && path === "/ready") {
        await options.runtime.snapshot();
        sendJson(res, 200, { status: "ready" });
        return;
      }
      if (method === "GET" && path === "/api/demo") {
        sendJson(res, 200, await options.runtime.snapshot());
        return;
      }
      const agentBossRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/agent-boss$/,
      );
      if (method === "GET" && agentBossRoute) {
        if (!options.formalApi) throw new Error("FORMAL_API_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.getAgentBoss(agentBossRoute[1] as string));
        return;
      }
      if (method === "POST" && path === "/api/demo/actions") {
        if (!isAllowedOrigin(req, allowedOrigins)) {
          sendError(res, 403, "ORIGIN_NOT_ALLOWED", "Request origin is not allowed.");
          return;
        }
        const body = actionFromBody(await readJson(req, maxBodyBytes));
        if (!body) {
          sendError(res, 422, "INVALID_ACTION", "Action payload is invalid.");
          return;
        }
        const state = body.action === "ASSIGN"
          ? await options.runtime.assignTask()
          : body.action === "ADVANCE"
            ? await options.runtime.advance()
            : body.action === "DECIDE"
              ? await options.runtime.decide(body.decision)
              : await options.runtime.reset();
        sendJson(res, 200, state);
        return;
      }
      sendError(res, 404, "ROUTE_NOT_FOUND", "Route not found.");
    } catch (error) {
      if (path.startsWith("/api/v1/")) {
        const response = formalError(error);
        sendStructuredError(res, response.status, response.code);
        return;
      }
      if (error instanceof Error && error.message === "REQUEST_BODY_TOO_LARGE") {
        sendError(res, 413, "REQUEST_BODY_TOO_LARGE", "Request body is too large.");
        return;
      }
      if (error instanceof Error && error.message === "INVALID_JSON") {
        sendError(res, 400, "INVALID_JSON", "Request body must be valid JSON.");
        return;
      }
      sendError(res, 409, publicErrorCode(error), "Operation could not be completed.");
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 12_000;
  server.keepAliveTimeout = 5_000;
  return server;
}
