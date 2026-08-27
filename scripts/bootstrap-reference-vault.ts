import { chmod, lstat, readFile, rename, rm, writeFile } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { join } from "node:path";

import { parseDependencySecretMetadata, type DependencySecretMetadata } from
  "../adapters/config/site-runtime-contract.ts";
import { bootstrapReferenceVault, type VaultBootstrapRequest, type VaultBootstrapSecretSink,
  type VaultBootstrapTransport } from "../adapters/config/vault-reference-bootstrap.ts";

export function createVaultHttpsTransport(originValue: string, certificateAuthority: Buffer): VaultBootstrapTransport {
  const origin = vaultOrigin(originValue);
  if (!Buffer.isBuffer(certificateAuthority) || certificateAuthority.length < 64 ||
      certificateAuthority.length > 1_048_576) throw new Error("VAULT_BOOTSTRAP_CA_INVALID");
  return { request(input) { return requestJson(origin, certificateAuthority, input); } };
}

export function createVaultBootstrapSecretSink(metadata: DependencySecretMetadata): VaultBootstrapSecretSink {
  const entries = new Map(metadata.entries.map((entry) => [entry.purpose, entry]));
  const initialization = output(entries, metadata.directory, "VAULT_INITIALIZATION");
  const roleId = output(entries, metadata.directory, "VAULT_APPROLE_ROLE_ID");
  const secretId = output(entries, metadata.directory, "VAULT_APPROLE_SECRET_ID");
  return {
    async writeInitialization(value) {
      await safeDirectory(metadata.directory); await rejectExisting([initialization.path, roleId.path, secretId.path]);
      await writeExact(initialization.path, `${JSON.stringify(value)}\n`, initialization.mode);
    },
    async writeAppRole(value) {
      await safeDirectory(metadata.directory); await safeExisting(initialization.path, initialization.mode);
      await rejectExisting([roleId.path, secretId.path]);
      const rolePartial = `${roleId.path}.partial-${process.pid}`;
      const secretPartial = `${secretId.path}.partial-${process.pid}`;
      try {
        await writeExact(rolePartial, `${value.roleId}\n`, roleId.mode);
        await writeExact(secretPartial, `${value.secretId}\n`, secretId.mode);
        await rename(rolePartial, roleId.path); await rename(secretPartial, secretId.path);
      } finally { await rm(rolePartial, { force: true }); await rm(secretPartial, { force: true }); }
    },
    async finalizeInitialization(value) {
      await safeExisting(initialization.path, initialization.mode);
      await safeExisting(roleId.path, roleId.mode); await safeExisting(secretId.path, secretId.mode);
      const partial = `${initialization.path}.partial-${process.pid}`;
      try { await writeExact(partial, `${JSON.stringify(value)}\n`, initialization.mode);
        await rename(partial, initialization.path); }
      finally { await rm(partial, { force: true }); }
    },
  };
}

export async function runReferenceVaultBootstrap(input: {
  readonly siteId: string;
  readonly origin: string;
  readonly metadataFile: string;
}): Promise<{ readonly schemaVersion: 1; readonly status: "VAULT_BOOTSTRAPPED_NOT_STARTED";
  readonly authMethod: "APPROLE"; readonly secretsEngine: "KV_V2"; readonly initialRootTokenRevoked: true }> {
  const metadataStat = await lstat(input.metadataFile);
  if (!metadataStat.isFile() || metadataStat.isSymbolicLink() || metadataStat.nlink !== 1 ||
      (metadataStat.mode & 0o077) !== 0 || metadataStat.size > 1_048_576) {
    throw new Error("VAULT_BOOTSTRAP_METADATA_FILE_UNSAFE");
  }
  const metadata = parseDependencySecretMetadata(JSON.parse(await readFile(input.metadataFile, "utf8")), input.siteId);
  await safeDirectory(metadata.directory);
  const certificate = output(new Map(metadata.entries.map((entry) => [entry.purpose, entry])),
    metadata.directory, "INTERNAL_TLS_CERT");
  await safeExisting(certificate.path, certificate.mode);
  const ca = await readFile(certificate.path);
  const transport = createVaultHttpsTransport(input.origin, ca);
  await waitForVaultInitializationEndpoint(transport);
  return bootstrapReferenceVault({ siteId: input.siteId, transport,
    secretSink: createVaultBootstrapSecretSink(metadata) });
}

export async function waitForVaultInitializationEndpoint(transport: VaultBootstrapTransport,
  supplied: { attempts?: number; wait?: (milliseconds: number) => Promise<void> } = {}): Promise<void> {
  const attempts = supplied.attempts ?? 30;
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 60) {
    throw new Error("VAULT_BOOTSTRAP_READINESS_ATTEMPTS_INVALID");
  }
  const wait = supplied.wait ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const value = await transport.request({ method: "GET", path: "/v1/sys/init" });
      if (value && typeof value === "object" && !Array.isArray(value) &&
          typeof (value as Record<string, unknown>).initialized === "boolean") return;
    } catch { /* A bounded readiness retry does not initialize or mutate Vault. */ }
    if (attempt < attempts) await wait(2_000);
  }
  throw new Error("VAULT_BOOTSTRAP_NOT_READY");
}

async function requestJson(origin: URL, ca: Buffer, input: VaultBootstrapRequest): Promise<unknown> {
  if (!input.path.startsWith("/v1/") || input.path.includes("?") || input.path.includes("#") ||
      unsafePathSegment(input.path)) {
    throw new Error("VAULT_BOOTSTRAP_REQUEST_PATH_INVALID");
  }
  const body = input.body === undefined ? null : Buffer.from(JSON.stringify(input.body));
  if (body && body.length > 65_536) throw new Error("VAULT_BOOTSTRAP_REQUEST_TOO_LARGE");
  return new Promise((resolve, reject) => {
    const request = httpsRequest(new URL(input.path, origin), { method: input.method, ca,
      minVersion: "TLSv1.2", rejectUnauthorized: true, timeout: 5_000,
      headers: { accept: "application/json", ...(input.token ? { "x-vault-token": input.token } : {}),
        ...(body ? { "content-type": "application/json", "content-length": body.length } : {}) } }, (response) => {
      const chunks: Buffer[] = []; let length = 0;
      response.on("data", (chunk: Buffer) => {
        length += chunk.length;
        if (length > 1_048_576) { request.destroy(new Error("VAULT_BOOTSTRAP_RESPONSE_TOO_LARGE")); return; }
        chunks.push(Buffer.from(chunk));
      });
      response.on("end", () => {
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error("VAULT_BOOTSTRAP_HTTP_FAILED")); return;
        }
        const value = Buffer.concat(chunks).toString("utf8");
        if (!value) { resolve({}); return; }
        if (!(response.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
          reject(new Error("VAULT_BOOTSTRAP_CONTENT_TYPE_INVALID")); return;
        }
        try { resolve(JSON.parse(value)); } catch { reject(new Error("VAULT_BOOTSTRAP_RESPONSE_INVALID")); }
      });
    });
    request.on("timeout", () => request.destroy(new Error("VAULT_BOOTSTRAP_TIMEOUT")));
    request.on("error", () => reject(new Error("VAULT_BOOTSTRAP_TRANSPORT_FAILED")));
    if (body) request.end(body); else request.end();
  });
}

function unsafePathSegment(path: string): boolean {
  return path.split("/").some((segment) => {
    let decoded: string;
    try { decoded = decodeURIComponent(segment); } catch { return true; }
    return decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\");
  });
}

function vaultOrigin(value: string): URL {
  let url; try { url = new URL(value); } catch { throw new Error("VAULT_BOOTSTRAP_ORIGIN_INVALID"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      !["", "/"].includes(url.pathname)) throw new Error("VAULT_BOOTSTRAP_ORIGIN_INVALID");
  return url;
}

function output(entries: Map<string, DependencySecretMetadata["entries"][number]>, directory: string,
  purpose: string): { path: string; mode: 256 | 384 } {
  const entry = entries.get(purpose);
  if (!entry) throw new Error("VAULT_BOOTSTRAP_SECRET_METADATA_INVALID");
  return { path: join(directory, entry.filename), mode: entry.mode };
}

async function safeDirectory(path: string) {
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) {
    throw new Error("VAULT_BOOTSTRAP_SECRET_DIRECTORY_UNSAFE");
  }
}
async function safeExisting(path: string, mode: number) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o777) !== mode || metadata.size < 1 || metadata.size > 65_536) {
    throw new Error("VAULT_BOOTSTRAP_SECRET_FILE_UNSAFE");
  }
}
async function rejectExisting(paths: readonly string[]) {
  for (const path of paths) {
    try { await lstat(path); throw new Error("VAULT_BOOTSTRAP_OUTPUT_EXISTS_REVIEW_REQUIRED"); }
    catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
  }
}
async function writeExact(path: string, value: string, mode: number) {
  await writeFile(path, value, { flag: "wx", mode }); await chmod(path, mode);
}

function argumentsFrom(values: readonly string[]) {
  const result: { siteId?: string; origin?: string; metadataFile?: string } = {};
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index]; const value = values[index + 1];
    if (!["--site", "--origin", "--metadata"].includes(flag ?? "") || !value || value.startsWith("--")) {
      throw new Error("VAULT_BOOTSTRAP_ARGUMENT_INVALID");
    }
    if (flag === "--site") result.siteId = value;
    else if (flag === "--origin") result.origin = value;
    else result.metadataFile = value;
    index += 1;
  }
  if (!result.siteId || !result.origin || !result.metadataFile) {
    throw new Error("VAULT_BOOTSTRAP_ARGUMENT_REQUIRED");
  }
  return { siteId: result.siteId, origin: result.origin, metadataFile: result.metadataFile };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const result = await runReferenceVaultBootstrap(argumentsFrom(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
