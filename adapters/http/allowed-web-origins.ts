function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function exactOrigin(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("WEB_ORIGIN_INVALID"); }
  if (url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname) ||
      url.origin === "null") throw new Error("WEB_ORIGIN_INVALID");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname))) {
    throw new Error("WEB_ORIGIN_HTTPS_REQUIRED");
  }
  return url.origin;
}

/** Parses exact browser origins; wildcard and path-based trust are never accepted. */
export function parseAllowedWebOrigins(source: string | undefined, publicBaseUrl: string | undefined): readonly string[] {
  const values: string[] = [];
  if (publicBaseUrl?.trim()) {
    let url: URL;
    try { url = new URL(publicBaseUrl); } catch { throw new Error("PUBLIC_BASE_URL_INVALID"); }
    values.push(url.origin);
  }
  if (source?.trim()) values.push(...source.split(",").map((value) => value.trim()).filter(Boolean).map(exactOrigin));
  if (values.length > 16) throw new Error("WEB_ORIGIN_LIMIT_EXCEEDED");
  return Object.freeze([...new Set(values)]);
}
