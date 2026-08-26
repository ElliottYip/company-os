import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const OPERATIONS = new Set(["READ", "WRITE", "EXPORT"]);
const CLASSIFICATIONS = new Set(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]);
const CODE = /^[A-Z][A-Z0-9_]{2,95}$/;
const FORBIDDEN_KEY = /(?:^|_)(?:credential|password|secret|token|private[_-]?reasoning|chain[_-]?of[_-]?thought|external[_-]?session|record[_-]?content|raw[_-]?data)(?:$|_)/i;

function deploymentSecret(environment, name) {
  const inline = environment[name]?.trim(); const path = environment[`${name}_FILE`]?.trim();
  if (inline && path) throw new Error(`${name}_SOURCE_AMBIGUOUS`); if (inline) return inline; if (!path) return undefined;
  if (!isAbsolute(path) || path.includes("\0")) throw new Error(`${name}_FILE_PATH_INVALID`);
  const metadata = statSync(path); if (!metadata.isFile() || metadata.size < 1 || metadata.size > 16_384) throw new Error(`${name}_FILE_INVALID`);
  const value = readFileSync(path, "utf8").trim(); if (!value) throw new Error(`${name}_FILE_INVALID`); return value;
}

function text(value, code, maximum = 256) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || /[\r\n]/.test(value)) throw new Error(code);
  return value.trim();
}
function id(value, code) { const result = text(value, code, 64); if (!ID.test(result)) throw new Error(code); return result; }
function loopback(hostname) { return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname); }
function secretFree(value) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return;
  if (Array.isArray(value)) { if (value.length > 1_000) throw new Error("HTTP_DATA_NODE_PAYLOAD_INVALID"); value.forEach(secretFree); return; }
  if (!value || typeof value !== "object") throw new Error("HTTP_DATA_NODE_PAYLOAD_INVALID");
  for (const [key, nested] of Object.entries(value)) { if (FORBIDDEN_KEY.test(key)) throw new Error("HTTP_DATA_NODE_PRIVATE_MATERIAL_FORBIDDEN"); secretFree(nested); }
}

export function validateHttpDataNodeConfiguration(input) {
  const connectorId = id(input?.connectorId, "HTTP_DATA_NODE_CONNECTOR_ID_INVALID");
  const displayName = text(input?.displayName, "HTTP_DATA_NODE_NAME_INVALID", 120);
  if (!Array.isArray(input?.dataSourceIds) || !input.dataSourceIds.length || input.dataSourceIds.length > 100) throw new Error("HTTP_DATA_NODE_SOURCES_INVALID");
  const dataSourceIds = input.dataSourceIds.map((value) => id(value, "HTTP_DATA_NODE_SOURCES_INVALID"));
  if (new Set(dataSourceIds).size !== dataSourceIds.length) throw new Error("HTTP_DATA_NODE_SOURCES_INVALID");
  if (!Array.isArray(input?.supportedOperations) || !input.supportedOperations.length ||
      input.supportedOperations.some((value) => !OPERATIONS.has(value))) throw new Error("HTTP_DATA_NODE_OPERATIONS_INVALID");
  const supportedOperations = [...new Set(input.supportedOperations)];
  let url;
  try { url = new URL(text(input?.baseUrl, "HTTP_DATA_NODE_BASE_URL_REQUIRED", 2_048)); }
  catch { throw new Error("HTTP_DATA_NODE_BASE_URL_INVALID"); }
  if (url.username || url.password) throw new Error("HTTP_DATA_NODE_URL_CREDENTIALS_FORBIDDEN");
  if (url.search || url.hash || !["", "/"].includes(url.pathname)) throw new Error("HTTP_DATA_NODE_BASE_URL_INVALID");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && input.allowInsecureLoopback === true && loopback(url.hostname))) {
    throw new Error("HTTP_DATA_NODE_TLS_REQUIRED");
  }
  const bearerToken = text(input?.bearerToken, "HTTP_DATA_NODE_BEARER_TOKEN_REQUIRED", 16_384);
  if (!Number.isSafeInteger(input?.requestTimeoutMs) || input.requestTimeoutMs < 250 || input.requestTimeoutMs > 60_000) {
    throw new Error("HTTP_DATA_NODE_TIMEOUT_INVALID");
  }
  return Object.freeze({ connectorId, displayName, dataSourceIds: Object.freeze(dataSourceIds),
    supportedOperations: Object.freeze(supportedOperations), baseUrl: url.origin, bearerToken,
    allowInsecureLoopback: input.allowInsecureLoopback === true, requestTimeoutMs: input.requestTimeoutMs });
}

function fromEnvironment(environment = process.env) {
  return validateHttpDataNodeConfiguration({
    connectorId: environment.COMPANY_OS_HTTP_DATA_NODE_ID ?? "http-data-node",
    displayName: environment.COMPANY_OS_HTTP_DATA_NODE_NAME ?? "Enterprise HTTP Data Node",
    dataSourceIds: (environment.COMPANY_OS_HTTP_DATA_NODE_SOURCES ?? "").split(",").map((v) => v.trim()).filter(Boolean),
    supportedOperations: (environment.COMPANY_OS_HTTP_DATA_NODE_OPERATIONS ?? "READ").split(",").map((v) => v.trim()).filter(Boolean),
    baseUrl: environment.COMPANY_OS_HTTP_DATA_NODE_BASE_URL,
    bearerToken: deploymentSecret(environment, "COMPANY_OS_HTTP_DATA_NODE_BEARER_TOKEN"),
    allowInsecureLoopback: environment.COMPANY_OS_HTTP_DATA_NODE_ALLOW_INSECURE_LOOPBACK === "true",
    requestTimeoutMs: Number(environment.COMPANY_OS_HTTP_DATA_NODE_TIMEOUT_MS ?? "10000"),
  });
}

async function json(response) {
  if (!(response.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new Error("HTTP_DATA_NODE_PROTOCOL_INVALID");
  const reader = response.body?.getReader(); if (!reader) throw new Error("HTTP_DATA_NODE_PROTOCOL_INVALID");
  const chunks = []; let size = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength;
    if (size > 1_048_576) { await reader.cancel(); throw new Error("HTTP_DATA_NODE_RESPONSE_TOO_LARGE"); } chunks.push(Buffer.from(value)); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Error("HTTP_DATA_NODE_PROTOCOL_INVALID"); }
}

class HttpDataNode {
  #configuration;
  constructor(configuration) { this.#configuration = configuration; }
  capabilities() { return Promise.resolve({ connectorId: this.#configuration.connectorId,
    displayName: this.#configuration.displayName, protocolVersion: "1.0",
    dataSourceIds: [...this.#configuration.dataSourceIds], supportedOperations: [...this.#configuration.supportedOperations] }); }
  async #request(method, path, body) {
    if (body !== undefined) { secretFree(body); if (Buffer.byteLength(JSON.stringify(body)) > 262_144) throw new Error("HTTP_DATA_NODE_REQUEST_TOO_LARGE"); }
    let response;
    try { response = await fetch(new URL(path, this.#configuration.baseUrl), { method, redirect: "error",
      signal: AbortSignal.timeout(this.#configuration.requestTimeoutMs), headers: { accept: "application/json",
        authorization: `Bearer ${this.#configuration.bearerToken}`, "content-type": "application/json",
        "x-company-os-data-connector-protocol": "1.0" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
    catch { throw new Error("HTTP_DATA_NODE_UNAVAILABLE"); }
    return { status: response.status, body: await json(response) };
  }
  async health() { try { const response = await this.#request("GET", "/v1/health");
    return response.status === 200 && ["HEALTHY", "DEGRADED", "UNAVAILABLE"].includes(response.body?.status) ? response.body.status : "UNAVAILABLE";
  } catch { return "UNAVAILABLE"; } }
  async access(request) {
    if (!request || !OPERATIONS.has(request.operation) || !CLASSIFICATIONS.has(request.classification) ||
        !this.#configuration.dataSourceIds.includes(request.dataSourceId) ||
        !this.#configuration.supportedOperations.includes(request.operation)) throw new Error("HTTP_DATA_NODE_REQUEST_INVALID");
    for (const key of ["requestId", "companyId", "workId", "agentId", "dataSourceId", "authorizationContractId", "authorizationReceiptId"]) id(request[key], "HTTP_DATA_NODE_REQUEST_INVALID");
    secretFree(request);
    const response = await this.#request("POST", "/v1/data-access", { schemaVersion: 1, request });
    const result = response.body?.result;
    if (response.status === 403 && result?.type === "DENIED" && CODE.test(result.policyCode) && typeof result.retryable === "boolean") return structuredClone(result);
    if (![200, 201].includes(response.status) || result?.type !== "GRANTED" || !ID.test(result.dataReference) ||
        !ID.test(result.evidenceReference) || !DIGEST.test(result.contentDigest)) throw new Error("HTTP_DATA_NODE_RESULT_INVALID");
    secretFree(result); return structuredClone(result);
  }
}

export function createDataConnectorPort(options, environment = process.env) {
  return new HttpDataNode(options ? validateHttpDataNodeConfiguration(options) : fromEnvironment(environment));
}
