import type { GenericWorkFailure } from "../../ports/generic-work-port.ts";

interface UpstreamErrorBody {
  readonly code?: unknown;
  readonly error?: unknown;
  readonly details?: unknown;
}

function categoryForStatus(status: number): GenericWorkFailure["category"] {
  if (status === 400 || status === 422) return "INVALID_REQUEST";
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "UPSTREAM_UNAVAILABLE";
  return "UNKNOWN";
}

/**
 * Normalizes the pinned upstream error envelope without treating English text
 * as a machine contract. The fallback code is intentionally coarse; endpoints
 * that drive product behavior must expose a stable upstream `code` before
 * production admission.
 */
export function normalizePaperclipError(status: number, body: unknown): GenericWorkFailure {
  const candidate = body && typeof body === "object" && !Array.isArray(body)
    ? body as UpstreamErrorBody
    : null;
  const upstreamCode = typeof candidate?.code === "string" && candidate.code.trim()
    ? candidate.code.trim()
    : null;
  const retryable = status === 408 || status === 429 || status >= 500;

  return {
    code: upstreamCode ?? `UPSTREAM_HTTP_${status}`,
    category: categoryForStatus(status),
    retryable,
    ...(upstreamCode ? { details: { upstreamCode } } : {}),
  };
}
