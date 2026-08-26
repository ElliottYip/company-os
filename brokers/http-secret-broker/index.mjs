import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const CODE = /^[A-Z][A-Z0-9_]{2,95}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const PURPOSES = new Set(["MODEL_PROVIDER", "DATA_CONNECTOR", "AGENT_CONNECTOR", "IDENTITY_ADAPTER"]);
const STATUSES = new Set(["ACTIVE", "SUSPENDED", "REVOKED"]);
const MANAGEMENT_OPERATIONS = new Set(["CREATE", "ROTATE", "SUSPEND", "REVOKE"]);
const PRIVATE_KEY = /^(?:secretValue|credentialValue|password|accessToken|refreshToken|privateKey|externalSession|privateReasoning|chainOfThought)$/i;

function deploymentSecret(environment, name) {
  const inline = environment[name]?.trim(); const path = environment[`${name}_FILE`]?.trim();
  if (inline && path) throw new Error(`${name}_SOURCE_AMBIGUOUS`); if (inline) return inline; if (!path) return undefined;
  if (!isAbsolute(path) || path.includes("\0")) throw new Error(`${name}_FILE_PATH_INVALID`);
  const metadata = statSync(path); if (!metadata.isFile() || metadata.size < 1 || metadata.size > 16_384) throw new Error(`${name}_FILE_INVALID`);
  const value = readFileSync(path, "utf8").trim(); if (!value) throw new Error(`${name}_FILE_INVALID`); return value;
}

function requiredText(value, code, maximum = 256) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || /[\r\n]/.test(value)) throw new Error(code);
  return value.trim();
}
function id(value, code) {
  const normalized = requiredText(value, code, 64);
  if (!ID.test(normalized)) throw new Error(code);
  return normalized;
}
function secretFree(value) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return;
  if (Array.isArray(value)) { if (value.length > 1_000) throw new Error("HTTP_SECRET_BROKER_PAYLOAD_INVALID"); value.forEach(secretFree); return; }
  if (!value || typeof value !== "object") throw new Error("HTTP_SECRET_BROKER_PAYLOAD_INVALID");
  for (const [key, nested] of Object.entries(value)) {
    if (PRIVATE_KEY.test(key)) throw new Error("HTTP_SECRET_BROKER_MATERIAL_FORBIDDEN");
    secretFree(nested);
  }
}
function loopback(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

export function validateHttpSecretBrokerConfiguration(input) {
  const brokerId = id(input?.brokerId, "HTTP_SECRET_BROKER_ID_INVALID");
  const displayName = requiredText(input?.displayName, "HTTP_SECRET_BROKER_NAME_INVALID", 120);
  let url;
  try { url = new URL(requiredText(input?.baseUrl, "HTTP_SECRET_BROKER_BASE_URL_REQUIRED", 2_048)); }
  catch { throw new Error("HTTP_SECRET_BROKER_BASE_URL_INVALID"); }
  if (url.username || url.password) throw new Error("HTTP_SECRET_BROKER_URL_CREDENTIALS_FORBIDDEN");
  if (url.search || url.hash || !["", "/"].includes(url.pathname)) throw new Error("HTTP_SECRET_BROKER_BASE_URL_INVALID");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && input.allowInsecureLoopback === true && loopback(url.hostname))) {
    throw new Error("HTTP_SECRET_BROKER_TLS_REQUIRED");
  }
  const bearerToken = requiredText(input?.bearerToken, "HTTP_SECRET_BROKER_BEARER_TOKEN_REQUIRED", 16_384);
  if (!Number.isSafeInteger(input?.requestTimeoutMs) || input.requestTimeoutMs < 250 || input.requestTimeoutMs > 60_000) {
    throw new Error("HTTP_SECRET_BROKER_TIMEOUT_INVALID");
  }
  if (!Number.isSafeInteger(input?.maximumLeaseSeconds) || input.maximumLeaseSeconds < 1 || input.maximumLeaseSeconds > 900) {
    throw new Error("HTTP_SECRET_BROKER_LEASE_LIMIT_INVALID");
  }
  return Object.freeze({ brokerId, displayName, baseUrl: url.origin, bearerToken,
    allowInsecureLoopback: input.allowInsecureLoopback === true, requestTimeoutMs: input.requestTimeoutMs,
    maximumLeaseSeconds: input.maximumLeaseSeconds });
}

function fromEnvironment(environment = process.env) {
  return validateHttpSecretBrokerConfiguration({
    brokerId: environment.COMPANY_OS_HTTP_SECRET_BROKER_ID ?? "http-secret-broker",
    displayName: environment.COMPANY_OS_HTTP_SECRET_BROKER_NAME ?? "Enterprise HTTP Secret Broker",
    baseUrl: environment.COMPANY_OS_HTTP_SECRET_BROKER_BASE_URL,
    bearerToken: deploymentSecret(environment, "COMPANY_OS_HTTP_SECRET_BROKER_BEARER_TOKEN"),
    allowInsecureLoopback: environment.COMPANY_OS_HTTP_SECRET_BROKER_ALLOW_INSECURE_LOOPBACK === "true",
    requestTimeoutMs: Number(environment.COMPANY_OS_HTTP_SECRET_BROKER_TIMEOUT_MS ?? "10000"),
    maximumLeaseSeconds: Number(environment.COMPANY_OS_HTTP_SECRET_BROKER_MAXIMUM_LEASE_SECONDS ?? "600"),
  });
}

async function boundedJson(response) {
  if (!(response.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new Error("HTTP_SECRET_BROKER_PROTOCOL_INVALID");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("HTTP_SECRET_BROKER_PROTOCOL_INVALID");
  const chunks = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1_048_576) { await reader.cancel(); throw new Error("HTTP_SECRET_BROKER_RESPONSE_TOO_LARGE"); }
    chunks.push(Buffer.from(value));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("HTTP_SECRET_BROKER_PROTOCOL_INVALID"); }
}

function stableFailure(status) {
  if (status === 401 || status === 403) return { code: "SECRET_BROKER_AUTHENTICATION_FAILED", retryable: false };
  if (status === 404) return { code: "SECRET_REFERENCE_NOT_FOUND", retryable: false };
  if (status === 409) return { code: "SECRET_BROKER_CONFLICT", retryable: false };
  if (status === 429 || status >= 500) return { code: "SECRET_BROKER_UNAVAILABLE", retryable: true };
  return { code: "SECRET_BROKER_REQUEST_REJECTED", retryable: false };
}
function remoteFailure(status, payload) {
  const candidate = payload?.error;
  if (candidate && typeof candidate === "object" && CODE.test(candidate.code) && typeof candidate.retryable === "boolean") {
    return { code: candidate.code, retryable: candidate.retryable };
  }
  return stableFailure(status);
}
function reference(value, companyId, referenceId) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.id !== referenceId || value.companyId !== companyId ||
      !PURPOSES.has(value.purpose) || !ID.test(value.providerAdapterId) ||
      !Number.isSafeInteger(value.currentVersion) || value.currentVersion < 1 || !STATUSES.has(value.status)) {
    throw new Error("HTTP_SECRET_BROKER_REFERENCE_INVALID");
  }
  secretFree(value);
  return structuredClone(value);
}
function grant(value, intent) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !ID.test(value.id) ||
      value.secretReferenceId !== intent.secretReferenceId || value.version !== intent.expectedVersion ||
      value.consumerId !== intent.consumerId || value.workAttemptId !== intent.workAttemptId ||
      typeof value.issuedAt !== "string" || !Number.isFinite(Date.parse(value.issuedAt)) ||
      value.expiresAt !== intent.expiresAt || !DIGEST.test(value.attestationDigest)) {
    throw new Error("HTTP_SECRET_BROKER_LEASE_INVALID");
  }
  secretFree(value);
  return structuredClone(value);
}

function managementSession(value, intent, brokerOrigin) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !ID.test(value.id) ||
      value.companyId !== intent.companyId || value.referenceId !== intent.referenceId ||
      value.operation !== intent.operation || typeof value.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(value.expiresAt))) {
    throw new Error("HTTP_SECRET_BROKER_MANAGEMENT_SESSION_INVALID");
  }
  let managementUrl;
  try { managementUrl = new URL(value.managementUrl); }
  catch { throw new Error("HTTP_SECRET_BROKER_MANAGEMENT_URL_INVALID"); }
  if (managementUrl.origin !== brokerOrigin || managementUrl.username || managementUrl.password) {
    throw new Error("HTTP_SECRET_BROKER_MANAGEMENT_URL_INVALID");
  }
  secretFree(value);
  return structuredClone(value);
}

function managementResult(value, companyId) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !["PENDING", "FAILED", "COMPLETED"].includes(value.status)) {
    throw new Error("HTTP_SECRET_BROKER_MANAGEMENT_RESULT_INVALID");
  }
  secretFree(value);
  if (value.status === "PENDING") return { status: "PENDING" };
  if (value.status === "FAILED") {
    if (!CODE.test(value.code) || typeof value.retryable !== "boolean") {
      throw new Error("HTTP_SECRET_BROKER_MANAGEMENT_RESULT_INVALID");
    }
    return { status: "FAILED", code: value.code, retryable: value.retryable };
  }
  if (!value.reference || !ID.test(value.reference.id)) throw new Error("HTTP_SECRET_BROKER_MANAGEMENT_RESULT_INVALID");
  return { status: "COMPLETED", reference: reference(value.reference, companyId, value.reference.id) };
}

class HttpSecretBroker {
  #configuration;
  constructor(configuration) { this.#configuration = configuration; }
  async #request(method, path, body) {
    if (body !== undefined) {
      secretFree(body);
      if (Buffer.byteLength(JSON.stringify(body)) > 262_144) throw new Error("HTTP_SECRET_BROKER_REQUEST_TOO_LARGE");
    }
    let response;
    try {
      response = await fetch(new URL(path, this.#configuration.baseUrl), { method, redirect: "error",
        signal: AbortSignal.timeout(this.#configuration.requestTimeoutMs),
        headers: { accept: "application/json", authorization: `Bearer ${this.#configuration.bearerToken}`,
          "content-type": "application/json", "x-company-os-secret-broker-protocol": "1.0" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch { throw new Error("SECRET_BROKER_UNAVAILABLE"); }
    return { status: response.status, payload: await boundedJson(response) };
  }
  async capabilities() {
    return { brokerId: this.#configuration.brokerId, displayName: this.#configuration.displayName,
      protocolVersion: "1.0", supportedPurposes: [...PURPOSES],
      maximumLeaseSeconds: this.#configuration.maximumLeaseSeconds };
  }
  async health() {
    try {
      const result = await this.#request("GET", "/v1/health");
      return result.status === 200 && ["HEALTHY", "DEGRADED", "UNAVAILABLE"].includes(result.payload?.status)
        ? result.payload.status : "UNAVAILABLE";
    } catch { return "UNAVAILABLE"; }
  }
  async describe(companyId, referenceId) {
    const company = id(companyId, "HTTP_SECRET_BROKER_COMPANY_ID_INVALID");
    const referenceKey = id(referenceId, "HTTP_SECRET_BROKER_REFERENCE_ID_INVALID");
    const result = await this.#request("GET", `/v1/companies/${encodeURIComponent(company)}/references/${encodeURIComponent(referenceKey)}`);
    if (result.status === 404) return null;
    if (result.status !== 200) throw new Error(remoteFailure(result.status, result.payload).code);
    return reference(result.payload.reference, company, referenceKey);
  }
  async issueLease(intent, authorizationReceiptId) {
    try {
      if (!intent || !Number.isSafeInteger(intent.expectedVersion) || intent.expectedVersion < 1 ||
          !Number.isFinite(Date.parse(intent.expiresAt))) throw new Error("HTTP_SECRET_BROKER_LEASE_INTENT_INVALID");
      for (const [value, code] of [[intent.companyId, "COMPANY"], [intent.secretReferenceId, "REFERENCE"],
        [intent.consumerId, "CONSUMER"], [intent.workAttemptId, "ATTEMPT"],
        [authorizationReceiptId, "AUTHORIZATION"]]) id(value, `HTTP_SECRET_BROKER_${code}_ID_INVALID`);
      requiredText(intent.reasonCode, "HTTP_SECRET_BROKER_REASON_INVALID", 64);
      const result = await this.#request("POST", "/v1/leases", { schemaVersion: 1, intent, authorizationReceiptId });
      if (![200, 201].includes(result.status)) return { ok: false, error: remoteFailure(result.status, result.payload) };
      return { ok: true, value: grant(result.payload.lease, intent) };
    } catch (error) {
      const code = error instanceof Error && CODE.test(error.message) ? error.message : "SECRET_BROKER_UNAVAILABLE";
      return { ok: false, error: { code, retryable: code === "SECRET_BROKER_UNAVAILABLE" } };
    }
  }
  async revokeLease(companyId, leaseId, reasonCode) {
    const company = id(companyId, "HTTP_SECRET_BROKER_COMPANY_ID_INVALID");
    const lease = id(leaseId, "HTTP_SECRET_BROKER_LEASE_ID_INVALID");
    const reason = requiredText(reasonCode, "HTTP_SECRET_BROKER_REASON_INVALID", 64);
    const result = await this.#request("POST", `/v1/companies/${encodeURIComponent(company)}/leases/${encodeURIComponent(lease)}/revocations`,
      { schemaVersion: 1, reasonCode: reason });
    if (![200, 202].includes(result.status) || result.payload?.revoked !== true) {
      throw new Error(remoteFailure(result.status, result.payload).code);
    }
  }
  async beginReferenceManagement(intent, authorizationReceiptId) {
    if (!intent || !MANAGEMENT_OPERATIONS.has(intent.operation) || !PURPOSES.has(intent.purpose) ||
        (intent.operation === "CREATE" ? intent.expectedVersion !== null :
          !Number.isSafeInteger(intent.expectedVersion) || intent.expectedVersion < 1)) {
      throw new Error("HTTP_SECRET_BROKER_MANAGEMENT_INTENT_INVALID");
    }
    for (const [value, code] of [[intent.companyId, "COMPANY"], [intent.referenceId, "REFERENCE"],
      [intent.providerAdapterId, "PROVIDER"], [authorizationReceiptId, "AUTHORIZATION"]]) {
      id(value, `HTTP_SECRET_BROKER_${code}_ID_INVALID`);
    }
    const result = await this.#request("POST", "/v1/reference-management-sessions", {
      schemaVersion: 1, intent, authorizationReceiptId,
    });
    if (![200, 201].includes(result.status)) throw new Error(remoteFailure(result.status, result.payload).code);
    return managementSession(result.payload.session, intent, this.#configuration.baseUrl);
  }
  async referenceManagementResult(companyId, sessionId) {
    const company = id(companyId, "HTTP_SECRET_BROKER_COMPANY_ID_INVALID");
    const session = id(sessionId, "HTTP_SECRET_BROKER_MANAGEMENT_SESSION_ID_INVALID");
    const result = await this.#request("GET",
      `/v1/companies/${encodeURIComponent(company)}/reference-management-sessions/${encodeURIComponent(session)}`);
    if (result.status !== 200) throw new Error(remoteFailure(result.status, result.payload).code);
    return managementResult(result.payload.result, company);
  }
}

export function createSecretBrokerRuntimePort(options, environment = process.env) {
  return new HttpSecretBroker(options ? validateHttpSecretBrokerConfiguration(options) : fromEnvironment(environment));
}
