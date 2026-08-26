import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
});

export function parseWebRuntimeOptions(environment = process.env) {
  const host = environment.COMPANY_OS_WEB_HOST?.trim() || "0.0.0.0";
  const parsedPort = Number(environment.COMPANY_OS_WEB_PORT || "8080");
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65_535) {
    throw new Error("COMPANY_OS_WEB_PORT_INVALID");
  }
  const mode = environment.COMPANY_OS_WEB_MODE?.trim() || "formal";
  if (mode !== "formal" && mode !== "demo") throw new Error("COMPANY_OS_WEB_MODE_INVALID");
  const apiBaseUrl = normalizePublicApiUrl(environment.COMPANY_OS_WEB_API_URL);
  return { host, port: parsedPort, mode, apiBaseUrl };
}

export function normalizePublicApiUrl(value) {
  if (!value?.trim()) throw new Error("COMPANY_OS_WEB_API_URL_REQUIRED");
  const url = new URL(value.trim());
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      (url.protocol !== "https:" && !(loopback && url.protocol === "http:"))) {
    throw new Error("COMPANY_OS_WEB_API_URL_INVALID");
  }
  return url.origin;
}

export function runtimeConfigSource(options) {
  const config = JSON.stringify({ apiBaseUrl: options.apiBaseUrl, mode: options.mode })
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
  return `window.__COMPANY_OS_CONFIG__ = Object.freeze(${config});\n`;
}

export function resolveStaticFile(distDirectory, requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\") || decoded.split("/").includes("..")) {
    return null;
  }
  const root = resolve(distDirectory);
  const relative = normalize(decoded).replace(/^[/\\]+/, "");
  const candidate = resolve(join(root, relative));
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return null;
}

export function createCompanyOsWebServer({ distDirectory, apiBaseUrl, mode = "formal" }) {
  const root = resolve(distDirectory);
  const indexFile = join(root, "index.html");
  if (!existsSync(indexFile)) throw new Error("COMPANY_OS_WEB_DIST_MISSING");
  const connectOrigin = normalizePublicApiUrl(apiBaseUrl);
  const baseHeaders = {
    "content-security-policy": `default-src 'self'; connect-src 'self' ${connectOrigin}; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'`,
    "cross-origin-opener-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };

  return createServer((request, response) => {
    const method = request.method || "GET";
    if (method !== "GET" && method !== "HEAD") {
      response.writeHead(405, { ...baseHeaders, allow: "GET, HEAD", "cache-control": "no-store" });
      response.end();
      return;
    }
    const requestUrl = new URL(request.url || "/", "http://localhost");
    if (requestUrl.pathname === "/company-os-config.js") {
      const body = runtimeConfigSource({ apiBaseUrl: connectOrigin, mode });
      response.writeHead(200, {
        ...baseHeaders,
        "cache-control": "no-store",
        "content-type": MIME_TYPES[".js"],
        "content-length": Buffer.byteLength(body),
      });
      response.end(method === "HEAD" ? undefined : body);
      return;
    }
    const staticFile = resolveStaticFile(root, requestUrl.pathname);
    const file = staticFile || indexFile;
    const extension = extname(file).toLowerCase();
    const immutable = Boolean(staticFile && requestUrl.pathname.startsWith("/assets/"));
    response.writeHead(200, {
      ...baseHeaders,
      "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-store",
      "content-type": MIME_TYPES[extension] || "application/octet-stream",
      "content-length": statSync(file).size,
    });
    if (method === "HEAD") response.end();
    else createReadStream(file).pipe(response);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runtime = parseWebRuntimeOptions();
  const distDirectory = resolve(process.env.COMPANY_OS_WEB_DIST || "web/dist");
  const server = createCompanyOsWebServer({
    distDirectory,
    apiBaseUrl: runtime.apiBaseUrl,
    mode: runtime.mode,
  });
  server.listen(runtime.port, runtime.host, () => {
    process.stdout.write(JSON.stringify({
      event: "company_os.web_listening",
      host: runtime.host,
      port: runtime.port,
      mode: runtime.mode,
    }) + "\n");
  });
}
