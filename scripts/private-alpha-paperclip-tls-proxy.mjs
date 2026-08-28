import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";

const listenPort = Number(process.env.COMPANY_OS_PAPERCLIP_PROXY_PORT ?? "3140");
const upstreamPort = Number(process.env.COMPANY_OS_PAPERCLIP_UPSTREAM_PORT ?? "3137");
const upstreamHost = process.env.COMPANY_OS_PAPERCLIP_UPSTREAM_HOST ?? "127.0.0.1";
const certificatePath = process.env.COMPANY_OS_PAPERCLIP_PROXY_CERTIFICATE;
const keyPath = process.env.COMPANY_OS_PAPERCLIP_PROXY_KEY;
if (!Number.isSafeInteger(listenPort) || !Number.isSafeInteger(upstreamPort) ||
    !certificatePath || !keyPath) throw new Error("PAPERCLIP_TLS_PROXY_CONFIGURATION_REQUIRED");

const server = createHttpsServer({
  cert: readFileSync(certificatePath),
  key: readFileSync(keyPath),
}, (incoming, outgoing) => {
  const proxy = httpRequest({
    hostname: upstreamHost,
    port: upstreamPort,
    path: incoming.url,
    method: incoming.method,
    headers: {
      ...incoming.headers,
      host: `localhost:${upstreamPort}`,
      "x-forwarded-proto": "https",
    },
  }, (response) => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(outgoing);
  });
  proxy.on("error", () => outgoing.writeHead(502).end());
  incoming.pipe(proxy);
});

server.listen(listenPort, "0.0.0.0", () => {
  process.stdout.write(`PAPERCLIP_TLS_PROXY_READY:${listenPort}\n`);
});
