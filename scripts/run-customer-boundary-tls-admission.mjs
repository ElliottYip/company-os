import { randomBytes } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function listen(server) {
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("BOUNDARY_TLS_LISTENER_MISSING"));
      resolvePromise(`https://127.0.0.1:${address.port}`);
    });
  });
}

function close(server) {
  return new Promise((resolvePromise) => server.close(() => resolvePromise()));
}

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  response.end(body);
}

async function startHealthServer(tls, token, protocolHeader) {
  const server = createServer(tls, (request, response) => {
    if (request.url !== "/v1/health" || request.method !== "GET") return json(response, 404, { error: { code: "NOT_FOUND" } });
    if (request.headers.authorization !== `Bearer ${token}` || request.headers[protocolHeader] !== "1.0") {
      return json(response, 401, { error: { code: "UNAUTHORIZED" } });
    }
    return json(response, 200, { status: "HEALTHY" });
  });
  return { server, origin: await listen(server) };
}

async function runChild(environment) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types",
      resolve("scripts/customer-boundary-preflight.ts")], {
      cwd: process.cwd(), env: environment, stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let bytes = 0;
    const collect = (target) => (chunk) => {
      bytes += chunk.length;
      if (bytes > 1_048_576) child.kill("SIGKILL");
      else target.push(Buffer.from(chunk));
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.once("error", () => reject(new Error("BOUNDARY_TLS_CHILD_START_FAILED")));
    child.once("exit", (code) => resolvePromise({
      code: code ?? 1,
      stdout: Buffer.concat(stdout).toString("utf8").trim(),
      stderr: Buffer.concat(stderr).toString("utf8").trim(),
    }));
  });
}

async function main() {
  const directory = mkdtempSync(join(tmpdir(), "company-os-boundary-tls-"));
  const keyPath = join(directory, "tls-key.pem");
  const certificatePath = join(directory, "tls-cert.pem");
  const servers = [];
  try {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "1",
      "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1",
      "-keyout", keyPath, "-out", certificatePath], { stdio: "ignore" });
    const tls = { key: readFileSync(keyPath), cert: readFileSync(certificatePath) };
    const tokens = {
      agent: randomBytes(32).toString("base64url"),
      data: randomBytes(32).toString("base64url"),
      broker: randomBytes(32).toString("base64url"),
    };
    const agent = await startHealthServer(tls, tokens.agent, "x-company-os-connector-protocol");
    const data = await startHealthServer(tls, tokens.data, "x-company-os-data-connector-protocol");
    const broker = await startHealthServer(tls, tokens.broker, "x-company-os-secret-broker-protocol");
    servers.push(agent.server, data.server, broker.server);

    let issuer = "";
    const identityServer = createServer(tls, (request, response) => {
      if (request.url !== "/.well-known/openid-configuration") {
        return json(response, 404, { error: "not_found" });
      }
      return json(response, 200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        code_challenge_methods_supported: ["S256"],
      });
    });
    issuer = await listen(identityServer);
    servers.push(identityServer);

    const result = await runChild({
      ...process.env,
      NODE_EXTRA_CA_CERTS: certificatePath,
      COMPANY_OS_OIDC_ISSUER: issuer,
      COMPANY_OS_OIDC_DISCOVERY_URL: `${issuer}/.well-known/openid-configuration`,
      COMPANY_OS_HTTP_AGENT_NODE_BASE_URL: agent.origin,
      COMPANY_OS_HTTP_AGENT_NODE_BEARER_TOKEN: tokens.agent,
      COMPANY_OS_HTTP_DATA_NODE_SOURCES: "synthetic-source",
      COMPANY_OS_HTTP_DATA_NODE_OPERATIONS: "READ",
      COMPANY_OS_HTTP_DATA_NODE_BASE_URL: data.origin,
      COMPANY_OS_HTTP_DATA_NODE_BEARER_TOKEN: tokens.data,
      COMPANY_OS_HTTP_SECRET_BROKER_BASE_URL: broker.origin,
      COMPANY_OS_HTTP_SECRET_BROKER_BEARER_TOKEN: tokens.broker,
    });
    // Node 22 emits an ExperimentalWarning for strip-types on stderr. The
    // contract is the child exit status plus the validated, secret-free JSON
    // report; incidental runtime warnings are not protocol failures.
    if (result.code !== 0) throw new Error("BOUNDARY_TLS_PREFLIGHT_FAILED");
    let report;
    try { report = JSON.parse(result.stdout); }
    catch { throw new Error("BOUNDARY_TLS_REPORT_MALFORMED"); }
    const forbidden = [issuer, agent.origin, data.origin, broker.origin, ...Object.values(tokens)];
    if (report?.status !== "PASS" || forbidden.some((value) => result.stdout.includes(value))) {
      throw new Error("BOUNDARY_TLS_REPORT_INVALID");
    }
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, status: "PASS", verifiedTls: true,
      identity: true, agentNode: true, dataNode: true, secretBroker: true })}\n`);
  } finally {
    await Promise.allSettled(servers.map(close));
    rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const code = error instanceof Error && /^BOUNDARY_TLS_[A-Z_]+$/.test(error.message)
    ? error.message : "BOUNDARY_TLS_ADMISSION_FAILED";
  process.stderr.write(`${JSON.stringify({ schemaVersion: 1, status: "FAIL", code })}\n`);
  process.exitCode = 1;
});
