import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { extname, join } from "node:path";

export async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

export async function waitForHttp(url: string, process: ChildProcess, output: readonly string[]): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw new Error(`Company OS service exited early: ${output.join("")}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The service has not bound its port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Company OS service did not become ready: ${output.join("")}`);
}

export async function startCompanyWebEdge(
  key: Buffer,
  certificate: Buffer,
  requestedPort = 0,
): Promise<{
  readonly origin: string;
  setBackendPort(port: number): void;
  close(): Promise<void>;
}> {
  let backendPort: number | null = null;
  const webRoot = join(process.cwd(), "web", "dist");
  const server = createHttpsServer({ key, cert: certificate }, (incoming, outgoing) => {
    const pathname = new URL(incoming.url ?? "/", "https://127.0.0.1").pathname;
    if (pathname.startsWith("/api/") || pathname === "/health" || pathname === "/ready") {
      if (backendPort === null) {
        outgoing.writeHead(503).end();
        return;
      }
      const headers = { ...incoming.headers, host: `127.0.0.1:${backendPort}` };
      const proxy = httpRequest({ hostname: "127.0.0.1", port: backendPort,
        path: incoming.url, method: incoming.method, headers }, (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      });
      proxy.on("error", () => outgoing.writeHead(502).end());
      incoming.pipe(proxy);
      return;
    }
    const relative = pathname.startsWith("/assets/") ? pathname.slice(1) : "index.html";
    try {
      const source = readFileSync(join(webRoot, relative));
      outgoing.writeHead(200, {
        "content-type": contentType(relative), "content-length": source.byteLength,
        "cache-control": relative === "index.html" ? "no-store" : "public, max-age=31536000, immutable",
      });
      outgoing.end(source);
    } catch {
      outgoing.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    origin: `https://127.0.0.1:${address.port}`,
    setBackendPort(port) { backendPort = port; },
    async close() { await new Promise<void>((resolve) => server.close(() => resolve())); },
  };
}

function contentType(path: string): string {
  return ({
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
  } as Record<string, string>)[extname(path)] ?? "application/octet-stream";
}
