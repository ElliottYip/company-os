import { lstat, readFile } from "node:fs/promises";
import { request as httpsRequest } from "node:https";

type EndpointKind = "OIDC" | "VAULT" | "BROKER" | "AGENT";

export async function verifyReferenceDependencyHealth(input: {
  readonly certificateAuthorityFile: string;
  readonly oidcDiscoveryUrl: string;
  readonly vaultOrigin: string;
  readonly brokerOrigin: string;
  readonly agentOrigin: string;
  readonly brokerTokenFile: string;
  readonly agentTokenFile: string;
}, supplied: { readonly attempts?: number; readonly wait?: (milliseconds: number) => Promise<void> } = {}) {
  const metadata = await lstat(input.certificateAuthorityFile);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 || metadata.size < 64 ||
      metadata.size > 1_048_576 || (metadata.mode & 0o077) !== 0) {
    throw new Error("REFERENCE_DEPENDENCY_CA_FILE_UNSAFE");
  }
  const ca = await readFile(input.certificateAuthorityFile);
  const brokerToken = await secretFile(input.brokerTokenFile);
  const agentToken = await secretFile(input.agentTokenFile);
  const endpoints = [
    endpoint("OIDC", input.oidcDiscoveryUrl, "/.well-known/openid-configuration", null),
    endpoint("VAULT", `${origin(input.vaultOrigin)}/v1/sys/health`, "/v1/sys/health", null),
    endpoint("BROKER", `${origin(input.brokerOrigin)}/v1/health`, "/v1/health", brokerToken),
    endpoint("AGENT", `${origin(input.agentOrigin)}/v1/health`, "/v1/health", agentToken),
  ] as const;
  const attempts = supplied.attempts ?? 30;
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 60) {
    throw new Error("REFERENCE_DEPENDENCY_HEALTH_ATTEMPTS_INVALID");
  }
  const wait = supplied.wait ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  for (const item of endpoints) {
    let healthy = false;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try { healthy = validate(item.kind, await requestJson(item.url, ca, item.token)); } catch { healthy = false; }
      if (healthy) break;
      if (attempt < attempts) await wait(2_000);
    }
    if (!healthy) throw new Error(`REFERENCE_DEPENDENCY_${item.kind}_HEALTH_FAILED`);
  }
  return { schemaVersion: 1 as const, status: "REFERENCE_DEPENDENCIES_HEALTHY" as const,
    tlsVerified: true as const, services: endpoints.map(({ kind }) => kind) };
}

function endpoint(kind: EndpointKind, value: string, expectedPath: string, token: string | null) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("REFERENCE_DEPENDENCY_ENDPOINT_INVALID"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      url.pathname !== expectedPath) throw new Error("REFERENCE_DEPENDENCY_ENDPOINT_INVALID");
  return { kind, url, token };
}

function origin(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("REFERENCE_DEPENDENCY_ENDPOINT_INVALID"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      !["", "/"].includes(url.pathname)) throw new Error("REFERENCE_DEPENDENCY_ENDPOINT_INVALID");
  return url.origin;
}

function validate(kind: EndpointKind, value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (kind === "OIDC") return typeof record.issuer === "string" && record.issuer.startsWith("https://");
  if (kind === "VAULT") return record.initialized === true && record.sealed === false;
  return record.status === "HEALTHY";
}

async function requestJson(url: URL, ca: Buffer, token: string | null): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, { method: "GET", ca, minVersion: "TLSv1.2",
      rejectUnauthorized: true, timeout: 3_000, headers: { accept: "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}) } }, (response) => {
      const chunks: Buffer[] = []; let length = 0;
      response.on("data", (chunk: Buffer) => {
        length += chunk.length;
        if (length > 1_048_576) { request.destroy(new Error("RESPONSE_TOO_LARGE")); return; }
        chunks.push(Buffer.from(chunk));
      });
      response.on("end", () => {
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300 ||
            !(response.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
          reject(new Error("REFERENCE_DEPENDENCY_HEALTH_HTTP_INVALID")); return;
        }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
        catch { reject(new Error("REFERENCE_DEPENDENCY_HEALTH_RESPONSE_INVALID")); }
      });
    });
    request.on("timeout", () => request.destroy(new Error("REFERENCE_DEPENDENCY_HEALTH_TIMEOUT")));
    request.on("error", () => reject(new Error("REFERENCE_DEPENDENCY_HEALTH_TRANSPORT_FAILED")));
    request.end();
  });
}

async function secretFile(path: string): Promise<string> {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 || metadata.size < 16 ||
      metadata.size > 16_384 || (metadata.mode & 0o077) !== 0) {
    throw new Error("REFERENCE_DEPENDENCY_HEALTH_TOKEN_FILE_UNSAFE");
  }
  const value = (await readFile(path, "utf8")).trim();
  if (value.length < 16 || value.length > 16_384 || value.includes("\0")) {
    throw new Error("REFERENCE_DEPENDENCY_HEALTH_TOKEN_FILE_INVALID");
  }
  return value;
}

function argumentsFrom(values: readonly string[]) {
  const result: Record<string, string> = {};
  const mapping: Record<string, string> = { "--ca": "certificateAuthorityFile", "--oidc": "oidcDiscoveryUrl",
    "--vault": "vaultOrigin", "--broker": "brokerOrigin", "--agent": "agentOrigin",
    "--broker-token": "brokerTokenFile", "--agent-token": "agentTokenFile" };
  for (let index = 0; index < values.length; index += 2) {
    const key = mapping[values[index] ?? ""]; const value = values[index + 1];
    if (!key || !value || value.startsWith("--")) throw new Error("REFERENCE_DEPENDENCY_HEALTH_ARGUMENT_INVALID");
    result[key] = value;
  }
  if (Object.keys(result).length !== 7) throw new Error("REFERENCE_DEPENDENCY_HEALTH_ARGUMENT_REQUIRED");
  return result as { certificateAuthorityFile: string; oidcDiscoveryUrl: string; vaultOrigin: string;
    brokerOrigin: string; agentOrigin: string; brokerTokenFile: string; agentTokenFile: string };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const result = await verifyReferenceDependencyHealth(argumentsFrom(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
