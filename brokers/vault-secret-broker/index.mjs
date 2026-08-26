import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, isAbsolute } from "node:path";

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const CODE = /^[A-Z][A-Z0-9_]{2,63}$/;
const FIELD = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const PATH_SEGMENTS = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/;
const PURPOSES = new Set(["MODEL_PROVIDER", "DATA_CONNECTOR", "AGENT_CONNECTOR", "IDENTITY_ADAPTER"]);
const STATUSES = new Set(["ACTIVE", "SUSPENDED", "REVOKED"]);
const MANAGEMENT_OPERATIONS = new Set(["CREATE", "ROTATE", "SUSPEND", "REVOKE"]);

function loopback(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}
async function boundedResponseJson(response) {
  if (!(response.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new Error("VAULT_PROTOCOL_INVALID");
  }
  const reader = response.body?.getReader(); if (!reader) throw new Error("VAULT_PROTOCOL_INVALID");
  const chunks = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength; if (size > 1_048_576) { await reader.cancel(); throw new Error("VAULT_RESPONSE_TOO_LARGE"); }
    chunks.push(Buffer.from(value));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Error("VAULT_PROTOCOL_INVALID"); }
}

function required(value, code, maximum = 512) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || value.includes("\0")) throw new Error(code);
  return value.trim();
}
function secretMaterial(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 32_768 || value.includes("\0")) {
    throw new Error("SECRET_MATERIAL_REQUIRED");
  }
  return value;
}
function identifier(value, code) { const result = required(value, code, 64); if (!ID.test(result)) throw new Error(code); return result; }
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`).join(",")}}`;
}
function sha(value) { return `sha256:${createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex")}`; }
function leaseId(intent, authorizationReceiptId) {
  return `lease-${createHash("sha256").update(canonical({ intent, authorizationReceiptId })).digest("hex").slice(0, 32)}`;
}
function publicReference(reference) {
  return { id: reference.id, companyId: reference.companyId, purpose: reference.purpose,
    providerAdapterId: reference.providerAdapterId, currentVersion: reference.currentVersion, status: reference.status };
}
function validateManagementProfile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !PURPOSES.has(value.purpose) ||
      !ID.test(value.providerAdapterId) || !PATH_SEGMENTS.test(value.mount) || value.mount.includes("/") ||
      !PATH_SEGMENTS.test(value.pathPrefix) || value.pathPrefix.startsWith("/") || value.pathPrefix.endsWith("/") ||
      !FIELD.test(value.field) || !FIELD.test(value.environmentVariable)) throw new Error("VAULT_MANAGEMENT_PROFILE_INVALID");
  return Object.freeze({ purpose: value.purpose, providerAdapterId: value.providerAdapterId, mount: value.mount,
    pathPrefix: value.pathPrefix, field: value.field, environmentVariable: value.environmentVariable });
}
function publicOrigin(value, code = "VAULT_MANAGEMENT_PUBLIC_URL_INVALID") {
  let url; try { url = new URL(required(value, code, 2_048)); } catch { throw new Error(code); }
  if (url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname) ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback(url.hostname)))) throw new Error(code);
  return url.origin;
}
function validateReference(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("VAULT_REFERENCE_INVALID");
  const reference = { ...value, id: identifier(value.id, "VAULT_REFERENCE_INVALID"),
    companyId: identifier(value.companyId, "VAULT_REFERENCE_INVALID"),
    providerAdapterId: identifier(value.providerAdapterId, "VAULT_REFERENCE_INVALID") };
  if (!PURPOSES.has(reference.purpose) || !STATUSES.has(reference.status) ||
      !Number.isSafeInteger(reference.currentVersion) || reference.currentVersion < 1 ||
      !reference.vault || typeof reference.vault !== "object" ||
      !PATH_SEGMENTS.test(reference.vault.mount) || reference.vault.mount.includes("/") ||
      !PATH_SEGMENTS.test(reference.vault.path) || reference.vault.path.startsWith("/") || reference.vault.path.endsWith("/") ||
      reference.vault.version !== reference.currentVersion || !FIELD.test(reference.vault.field) ||
      !FIELD.test(reference.vault.environmentVariable)) throw new Error("VAULT_REFERENCE_INVALID");
  return Object.freeze({ ...reference, vault: Object.freeze({ ...reference.vault }) });
}
function initialState() { return { schemaVersion: 1, leases: {} }; }
function initialReferenceState(references) {
  return { schemaVersion: 1, references: Object.fromEntries(references.map((reference) => [reference.id, reference])), sessions: {} };
}
function authorized(header, expected) {
  const supplied = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : "";
  return timingSafeEqual(createHash("sha256").update(supplied).digest(), createHash("sha256").update(expected).digest());
}
async function requestJson(request, maximumBytes = 262_144) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length; if (size > maximumBytes) throw new Error("VAULT_BROKER_REQUEST_TOO_LARGE");
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Error("VAULT_BROKER_JSON_INVALID"); }
}
function sendJson(response, status, body) {
  const encoded = JSON.stringify(body);
  response.writeHead(status, { "cache-control": "no-store", "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(encoded), "x-content-type-options": "nosniff" });
  response.end(encoded);
}
function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function sendHtml(response, status, body) {
  response.writeHead(status, { "cache-control": "no-store", "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(body), "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "x-frame-options": "DENY" });
  response.end(body);
}
async function requestForm(request) {
  if (!(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    throw new Error("SECRET_MANAGEMENT_FORM_INVALID");
  }
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length; if (size > 65_536) throw new Error("VAULT_BROKER_REQUEST_TOO_LARGE"); chunks.push(Buffer.from(chunk));
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}
function managementPage(session, token) {
  if (session.status !== "PENDING") return managementCompletedPage();
  const requiresMaterial = session.operation === "CREATE" || session.operation === "ROTATE";
  const action = session.operation === "CREATE" ? "Create" : session.operation === "ROTATE" ? "Rotate" :
    session.operation === "SUSPEND" ? "Suspend" : "Revoke";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${action} secret reference</title><style>body{font:16px system-ui;margin:0;background:#f7f7f5;color:#222}main{max-width:520px;margin:10vh auto;padding:32px;background:#fff;border:1px solid #ddd;border-radius:16px}label{display:block;margin:24px 0 8px}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #aaa;border-radius:8px}button{margin-top:24px;padding:12px 18px;border:0;border-radius:8px;background:#262624;color:#fff;font-weight:600}p{line-height:1.5;color:#555}</style></head><body><main><h1>${action} secret reference</h1><p>Reference <strong>${escapeHtml(session.referenceId)}</strong>. The value is sent directly to this Broker and is never returned to Company OS.</p><form method="post" action="/manage/${escapeHtml(session.id)}/complete"><input type="hidden" name="token" value="${escapeHtml(token)}">${requiresMaterial ? '<label for="material">Secret value</label><input id="material" name="material" type="password" autocomplete="new-password" required maxlength="32768">' : `<p>This changes Broker access immediately. Existing Company OS evidence remains retained.</p>`}<button type="submit">${action}</button></form></main></body></html>`;
}
function managementCompletedPage() {
  return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Secret reference updated</title></head><body><main><h1>Secret reference updated</h1><p>You can close this page and check status in Company OS.</p></main></body></html>";
}

class JsonLeaseStore {
  #queue = Promise.resolve();
  constructor(filePath) { this.filePath = filePath; }
  async #read() {
    try {
      const value = JSON.parse(await readFile(this.filePath, "utf8"));
      if (value?.schemaVersion !== 1 || !value.leases || typeof value.leases !== "object") throw new Error();
      return value;
    } catch (error) {
      if (error?.code === "ENOENT") return initialState();
      throw new Error("VAULT_BROKER_STATE_CORRUPT");
    }
  }
  async #write(state) {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporary = `${this.filePath}.tmp-${randomUUID()}`;
    await writeFile(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 });
    await rename(temporary, this.filePath);
  }
  mutate(operation) {
    const running = this.#queue.then(async () => {
      const state = await this.#read(); const result = await operation(state); await this.#write(state); return result;
    });
    this.#queue = running.then(() => undefined, () => undefined); return running;
  }
}

class JsonReferenceStore {
  #queue = Promise.resolve();
  constructor(filePath, initialReferences) { this.filePath = filePath; this.initialReferences = initialReferences; }
  async #read() {
    try {
      const value = JSON.parse(await readFile(this.filePath, "utf8"));
      if (value?.schemaVersion !== 1 || !value.references || typeof value.references !== "object" ||
          !value.sessions || typeof value.sessions !== "object") throw new Error();
      return value;
    } catch (error) {
      if (error?.code === "ENOENT") return initialReferenceState(this.initialReferences);
      throw new Error("VAULT_REFERENCE_STATE_CORRUPT");
    }
  }
  async #write(state) {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporary = `${this.filePath}.tmp-${randomUUID()}`;
    await writeFile(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 });
    await rename(temporary, this.filePath);
  }
  query(operation) {
    const running = this.#queue.then(async () => operation(await this.#read()));
    this.#queue = running.then(() => undefined, () => undefined); return running;
  }
  mutate(operation) {
    const running = this.#queue.then(async () => {
      const state = await this.#read(); const result = await operation(state); await this.#write(state); return result;
    });
    this.#queue = running.then(() => undefined, () => undefined); return running;
  }
}

/** Minimal Vault HTTP client. Tokens remain memory-only and are never returned by this object. */
export function createVaultKvV2Client(options) {
  let address;
  try { address = new URL(required(options?.address, "VAULT_ADDRESS_REQUIRED", 2_048)); }
  catch { throw new Error("VAULT_ADDRESS_INVALID"); }
  if (address.username || address.password || address.search || address.hash || !["", "/"].includes(address.pathname)) {
    throw new Error("VAULT_ADDRESS_INVALID");
  }
  if (address.protocol !== "https:" && !(address.protocol === "http:" && options.allowInsecureLoopback === true && loopback(address.hostname))) {
    throw new Error("VAULT_TLS_REQUIRED");
  }
  const authMount = required(options.authMount ?? "approle", "VAULT_AUTH_MOUNT_INVALID", 64);
  if (!PATH_SEGMENTS.test(authMount) || authMount.includes("/")) throw new Error("VAULT_AUTH_MOUNT_INVALID");
  const roleId = required(options.roleId, "VAULT_ROLE_ID_REQUIRED", 4_096);
  const secretId = required(options.secretId, "VAULT_SECRET_ID_REQUIRED", 16_384);
  const namespace = options.namespace === undefined || options.namespace === null || options.namespace === ""
    ? null : required(options.namespace, "VAULT_NAMESPACE_INVALID", 256);
  const requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 250 || requestTimeoutMs > 60_000) {
    throw new Error("VAULT_REQUEST_TIMEOUT_INVALID");
  }
  const nowMs = options.nowMs ?? Date.now;
  let cachedToken = null; let tokenUsableUntil = 0;

  async function request(method, path, body, token) {
    let response;
    try {
      response = await fetch(new URL(path, address.origin), { method, redirect: "error",
        signal: AbortSignal.timeout(requestTimeoutMs), headers: { accept: "application/json",
          ...(namespace ? { "x-vault-namespace": namespace } : {}),
          ...(token ? { "x-vault-token": token } : {}),
          ...(body === undefined ? {} : { "content-type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch { throw new Error("VAULT_UNAVAILABLE"); }
    return { status: response.status, payload: await boundedResponseJson(response) };
  }
  async function token() {
    if (cachedToken && nowMs() < tokenUsableUntil) return cachedToken;
    const result = await request("POST", `/v1/auth/${encodeURIComponent(authMount)}/login`,
      { role_id: roleId, secret_id: secretId });
    const value = result.payload?.auth?.client_token; const duration = result.payload?.auth?.lease_duration;
    if (result.status !== 200 || typeof value !== "string" || value.length < 8 || value.length > 16_384 ||
        !Number.isSafeInteger(duration) || duration < 1) throw new Error("VAULT_AUTHENTICATION_FAILED");
    cachedToken = value; tokenUsableUntil = nowMs() + Math.max(1, duration - 5) * 1000; return value;
  }

  return {
    async health() {
      try {
        const result = await request("GET", "/v1/sys/health");
        return [200, 429, 472, 473].includes(result.status) && result.payload?.initialized === true && result.payload?.sealed === false;
      } catch { return false; }
    },
    async readKvVersion(input) {
      const mount = required(input?.mount, "VAULT_KV_MOUNT_INVALID", 64);
      const path = required(input?.path, "VAULT_KV_PATH_INVALID", 512);
      if (!PATH_SEGMENTS.test(mount) || mount.includes("/") || !PATH_SEGMENTS.test(path) ||
          path.startsWith("/") || path.endsWith("/") || !Number.isSafeInteger(input.version) || input.version < 1) {
        throw new Error("VAULT_KV_REQUEST_INVALID");
      }
      const encodedPath = path.split("/").map(encodeURIComponent).join("/");
      const result = await request("GET", `/v1/${encodeURIComponent(mount)}/data/${encodedPath}?version=${input.version}`,
        undefined, await token());
      if (result.status === 403) throw new Error("VAULT_ACCESS_DENIED");
      if (result.status === 404) throw new Error("VAULT_SECRET_NOT_FOUND");
      if (result.status !== 200 || !result.payload?.data?.data || typeof result.payload.data.data !== "object" ||
          !Number.isSafeInteger(result.payload?.data?.metadata?.version) || result.payload.data.metadata.destroyed === true ||
          Boolean(result.payload.data.metadata.deletion_time)) throw new Error("VAULT_PROTOCOL_INVALID");
      return { version: result.payload.data.metadata.version, data: structuredClone(result.payload.data.data) };
    },
    async writeKvVersion(input) {
      const mount = required(input?.mount, "VAULT_KV_MOUNT_INVALID", 64);
      const path = required(input?.path, "VAULT_KV_PATH_INVALID", 512);
      const field = required(input?.field, "VAULT_KV_FIELD_INVALID", 128);
      const value = secretMaterial(input?.value);
      if (!PATH_SEGMENTS.test(mount) || mount.includes("/") || !PATH_SEGMENTS.test(path) ||
          path.startsWith("/") || path.endsWith("/") || !FIELD.test(field) ||
          !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) throw new Error("VAULT_KV_REQUEST_INVALID");
      const encodedPath = path.split("/").map(encodeURIComponent).join("/");
      const result = await request("POST", `/v1/${encodeURIComponent(mount)}/data/${encodedPath}`,
        { data: { [field]: value }, options: { cas: input.expectedVersion } }, await token());
      if (result.status === 403) throw new Error("VAULT_ACCESS_DENIED");
      if (result.status === 400) throw new Error("VAULT_KV_VERSION_CONFLICT");
      if (![200, 204].includes(result.status) || !Number.isSafeInteger(result.payload?.data?.version) ||
          result.payload.data.version < 1) throw new Error("VAULT_PROTOCOL_INVALID");
      return { version: result.payload.data.version };
    },
  };
}

export function createVaultLeaseBroker(options) {
  if (!isAbsolute(options?.stateFile ?? "") || !options?.vaultClient || typeof options.vaultClient.readKvVersion !== "function") {
    throw new Error("VAULT_BROKER_CONFIGURATION_INVALID");
  }
  if (!Array.isArray(options.references)) throw new Error("VAULT_BROKER_REFERENCES_REQUIRED");
  const initialReferences = options.references.map(validateReference);
  if (new Set(initialReferences.map(({ id }) => id)).size !== initialReferences.length) throw new Error("VAULT_BROKER_REFERENCE_DUPLICATE");
  const profiles = Array.isArray(options.managementProfiles) ? options.managementProfiles.map(validateManagementProfile) : [];
  if (new Set(profiles.map(({ purpose, providerAdapterId }) => `${purpose}:${providerAdapterId}`)).size !== profiles.length) {
    throw new Error("VAULT_MANAGEMENT_PROFILE_DUPLICATE");
  }
  if (!initialReferences.length && !profiles.length) throw new Error("VAULT_BROKER_REFERENCES_REQUIRED");
  const now = options.now ?? (() => new Date().toISOString());
  const maximumLeaseSeconds = options.maximumLeaseSeconds ?? 600;
  if (!Number.isSafeInteger(maximumLeaseSeconds) || maximumLeaseSeconds < 1 || maximumLeaseSeconds > 900) {
    throw new Error("VAULT_BROKER_LEASE_LIMIT_INVALID");
  }
  const store = new JsonLeaseStore(options.stateFile);
  const referenceStateFile = options.referenceStateFile ?? `${options.stateFile}.references`;
  if (!isAbsolute(referenceStateFile)) throw new Error("VAULT_REFERENCE_STATE_FILE_INVALID");
  const referenceStore = new JsonReferenceStore(referenceStateFile, initialReferences);
  const managementEnabled = profiles.length > 0;
  const managementOrigin = managementEnabled ? publicOrigin(options.managementPublicOrigin) : null;
  const managementSigningKey = managementEnabled
    ? required(options.managementSigningKey, "VAULT_MANAGEMENT_SIGNING_KEY_REQUIRED", 16_384) : null;
  if (managementEnabled && managementSigningKey.length < 32) throw new Error("VAULT_MANAGEMENT_SIGNING_KEY_REQUIRED");
  if (managementEnabled && typeof options.vaultClient.writeKvVersion !== "function") {
    throw new Error("VAULT_MANAGEMENT_WRITE_CLIENT_REQUIRED");
  }
  const managementSessionSeconds = options.managementSessionSeconds ?? 600;
  if (!Number.isSafeInteger(managementSessionSeconds) || managementSessionSeconds < 60 || managementSessionSeconds > 900) {
    throw new Error("VAULT_MANAGEMENT_SESSION_LIMIT_INVALID");
  }
  const getReference = async (referenceId) => referenceStore.query((state) => {
    const value = state.references[referenceId]; return value ? validateReference(value) : null;
  });
  const managementToken = (sessionId) => createHmac("sha256", managementSigningKey).update(sessionId).digest("base64url");

  return {
    async capabilities() {
      return { brokerId: "vault-secret-broker", displayName: "HashiCorp Vault Secret Broker",
        protocolVersion: "1.0", supportedPurposes: [...PURPOSES], maximumLeaseSeconds };
    },
    async health() { try { return await options.vaultClient.health() ? "HEALTHY" : "UNAVAILABLE"; } catch { return "UNAVAILABLE"; } },
    async describe(companyId, referenceId) {
      const company = identifier(companyId, "SECRET_BROKER_COMPANY_ID_INVALID");
      const reference = await getReference(identifier(referenceId, "SECRET_BROKER_REFERENCE_ID_INVALID"));
      return reference?.companyId === company ? publicReference(reference) : null;
    },
    async issueLease(intent, authorizationReceiptId) {
      try {
        if (!intent || typeof intent !== "object") throw new Error("SECRET_LEASE_INTENT_INVALID");
        const normalized = { companyId: identifier(intent.companyId, "SECRET_LEASE_INTENT_INVALID"),
          secretReferenceId: identifier(intent.secretReferenceId, "SECRET_LEASE_INTENT_INVALID"),
          expectedVersion: intent.expectedVersion, consumerId: identifier(intent.consumerId, "SECRET_LEASE_INTENT_INVALID"),
          workAttemptId: identifier(intent.workAttemptId, "SECRET_LEASE_INTENT_INVALID"),
          reasonCode: required(intent.reasonCode, "SECRET_LEASE_INTENT_INVALID", 64), expiresAt: required(intent.expiresAt, "SECRET_LEASE_INTENT_INVALID", 64) };
        identifier(authorizationReceiptId, "SECRET_LEASE_AUTHORIZATION_INVALID");
        if (!CODE.test(normalized.reasonCode) || !Number.isSafeInteger(normalized.expectedVersion) || normalized.expectedVersion < 1) {
          throw new Error("SECRET_LEASE_INTENT_INVALID");
        }
        const issuedAt = now(); const issuedTime = Date.parse(issuedAt); const expiresTime = Date.parse(normalized.expiresAt);
        if (!Number.isFinite(issuedTime) || !Number.isFinite(expiresTime) || expiresTime <= issuedTime ||
            expiresTime - issuedTime > maximumLeaseSeconds * 1000) throw new Error("SECRET_LEASE_EXPIRY_INVALID");
        const reference = await getReference(normalized.secretReferenceId);
        if (!reference || reference.companyId !== normalized.companyId) {
          return { ok: false, error: { code: "SECRET_REFERENCE_NOT_FOUND", retryable: false } };
        }
        if (reference.status !== "ACTIVE") return { ok: false, error: { code: "SECRET_REFERENCE_INACTIVE", retryable: false } };
        if (reference.currentVersion !== normalized.expectedVersion) {
          return { ok: false, error: { code: "SECRET_REFERENCE_VERSION_MISMATCH", retryable: false } };
        }
        if (reference.providerAdapterId !== normalized.consumerId) {
          return { ok: false, error: { code: "SECRET_REFERENCE_CONSUMER_MISMATCH", retryable: false } };
        }
        const id = leaseId(normalized, authorizationReceiptId);
        return await store.mutate((state) => {
          const prior = state.leases[id];
          if (prior) return { ok: true, value: structuredClone(prior.grant) };
          const subject = { id, secretReferenceId: normalized.secretReferenceId, version: normalized.expectedVersion,
            consumerId: normalized.consumerId, workAttemptId: normalized.workAttemptId, issuedAt, expiresAt: normalized.expiresAt };
          const grant = { ...subject, attestationDigest: sha({ subject, authorizationReceiptDigest: sha(authorizationReceiptId) }) };
          state.leases[id] = { grant, companyId: normalized.companyId, status: "ACTIVE", redemptions: 0,
            reasonCode: normalized.reasonCode, authorizationReceiptDigest: sha(authorizationReceiptId) };
          return { ok: true, value: structuredClone(grant) };
        });
      } catch (error) {
        const code = error instanceof Error && /^[A-Z][A-Z0-9_]{2,95}$/.test(error.message)
          ? error.message : "SECRET_BROKER_UNAVAILABLE";
        return { ok: false, error: { code, retryable: code === "SECRET_BROKER_UNAVAILABLE" } };
      }
    },
    async redeemLease(input) {
      if (!input || typeof input !== "object") throw new Error("SECRET_LEASE_REDEMPTION_INVALID");
      const lease = identifier(input.leaseId, "SECRET_LEASE_REDEMPTION_INVALID");
      const company = identifier(input.companyId, "SECRET_LEASE_REDEMPTION_INVALID");
      const consumer = identifier(input.consumerId, "SECRET_LEASE_REDEMPTION_INVALID");
      const workAttempt = identifier(input.workAttemptId, "SECRET_LEASE_REDEMPTION_INVALID");
      if (input.expectedVersion !== undefined &&
          (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1)) {
        throw new Error("SECRET_LEASE_REDEMPTION_INVALID");
      }
      return store.mutate(async (state) => {
        const record = state.leases[lease]; if (!record || record.companyId !== company) throw new Error("SECRET_LEASE_NOT_FOUND");
        if (record.status === "REVOKED") throw new Error("SECRET_LEASE_REVOKED");
        if (Date.parse(record.grant.expiresAt) <= Date.parse(now())) throw new Error("SECRET_LEASE_EXPIRED");
        if (record.grant.consumerId !== consumer || record.grant.workAttemptId !== workAttempt) {
          throw new Error("SECRET_LEASE_BINDING_MISMATCH");
        }
        if (input.expectedVersion !== undefined && record.grant.version !== input.expectedVersion) {
          throw new Error("SECRET_LEASE_VERSION_MISMATCH");
        }
        const reference = await getReference(record.grant.secretReferenceId);
        if (!reference || reference.status !== "ACTIVE" || reference.currentVersion !== record.grant.version) {
          throw new Error("SECRET_REFERENCE_CHANGED");
        }
        const response = await options.vaultClient.readKvVersion({ mount: reference.vault.mount,
          path: reference.vault.path, version: reference.vault.version });
        if (response?.version !== record.grant.version) throw new Error("VAULT_SECRET_VERSION_MISMATCH");
        const value = response?.data?.[reference.vault.field];
        if (typeof value !== "string" || !value || value.length > 32_768 || value.includes("\0")) {
          throw new Error("VAULT_SECRET_MATERIAL_INVALID");
        }
        record.redemptions += 1; record.lastRedeemedAt = now();
        return { environmentVariable: reference.vault.environmentVariable, value, expiresAt: record.grant.expiresAt };
      });
    },
    async beginReferenceManagement(intent, authorizationReceiptId, originOverride) {
      if (!managementEnabled) throw new Error("SECRET_BROKER_MANAGEMENT_UNAVAILABLE");
      if (!intent || typeof intent !== "object" || !MANAGEMENT_OPERATIONS.has(intent.operation) ||
          !PURPOSES.has(intent.purpose)) throw new Error("SECRET_MANAGEMENT_INTENT_INVALID");
      const normalized = { companyId: identifier(intent.companyId, "SECRET_MANAGEMENT_INTENT_INVALID"),
        referenceId: identifier(intent.referenceId, "SECRET_MANAGEMENT_INTENT_INVALID"), operation: intent.operation,
        purpose: intent.purpose, providerAdapterId: identifier(intent.providerAdapterId, "SECRET_MANAGEMENT_INTENT_INVALID"),
        expectedVersion: intent.expectedVersion };
      const authorization = identifier(authorizationReceiptId, "SECRET_MANAGEMENT_AUTHORIZATION_INVALID");
      if (normalized.operation === "CREATE" ? normalized.expectedVersion !== null :
          !Number.isSafeInteger(normalized.expectedVersion) || normalized.expectedVersion < 1) {
        throw new Error("SECRET_MANAGEMENT_INTENT_INVALID");
      }
      const id = `management-${createHash("sha256").update(canonical({ normalized, authorization })).digest("hex").slice(0, 32)}`;
      const issuedAt = now(); const issuedTime = Date.parse(issuedAt);
      if (!Number.isFinite(issuedTime)) throw new Error("VAULT_BROKER_TIME_INVALID");
      const expiresAt = new Date(issuedTime + managementSessionSeconds * 1000).toISOString();
      await referenceStore.mutate((state) => {
        const existing = state.references[normalized.referenceId];
        if (normalized.operation === "CREATE") {
          if (existing) throw new Error("SECRET_REFERENCE_ALREADY_EXISTS");
          if (!profiles.some((profile) => profile.purpose === normalized.purpose &&
              profile.providerAdapterId === normalized.providerAdapterId)) throw new Error("SECRET_MANAGEMENT_PROFILE_NOT_FOUND");
        } else {
          if (!existing || existing.companyId !== normalized.companyId) throw new Error("SECRET_REFERENCE_NOT_FOUND");
          if (existing.purpose !== normalized.purpose || existing.providerAdapterId !== normalized.providerAdapterId) {
            throw new Error("SECRET_REFERENCE_BINDING_MISMATCH");
          }
          if (existing.currentVersion !== normalized.expectedVersion) throw new Error("SECRET_REFERENCE_VERSION_MISMATCH");
          if (existing.status === "REVOKED") throw new Error("SECRET_REFERENCE_REVOKED");
        }
        const prior = state.sessions[id];
        if (prior && canonical(prior.intent) !== canonical(normalized)) throw new Error("SECRET_MANAGEMENT_SESSION_CONFLICT");
        if (!prior) state.sessions[id] = { id, intent: normalized, status: "PENDING", issuedAt, expiresAt,
          tokenDigest: sha(managementToken(id)), authorizationReceiptDigest: sha(authorization) };
      });
      const origin = originOverride === undefined ? managementOrigin : publicOrigin(originOverride);
      const url = new URL(`/manage/${id}`, origin); url.searchParams.set("token", managementToken(id));
      return { id, companyId: normalized.companyId, referenceId: normalized.referenceId,
        operation: normalized.operation, managementUrl: url.href, expiresAt };
    },
    async inspectReferenceManagement(sessionId, tokenValue) {
      if (!managementEnabled) throw new Error("SECRET_BROKER_MANAGEMENT_UNAVAILABLE");
      const id = identifier(sessionId, "SECRET_MANAGEMENT_SESSION_INVALID");
      const token = required(tokenValue, "SECRET_MANAGEMENT_TOKEN_INVALID", 256);
      return referenceStore.query((state) => {
        const session = state.sessions[id]; if (!session) throw new Error("SECRET_MANAGEMENT_SESSION_NOT_FOUND");
        if (!authorized(`Bearer ${token}`, managementToken(id)) || session.tokenDigest !== sha(token)) {
          throw new Error("SECRET_MANAGEMENT_TOKEN_INVALID");
        }
        if (Date.parse(session.expiresAt) <= Date.parse(now())) throw new Error("SECRET_MANAGEMENT_SESSION_EXPIRED");
        return { id, operation: session.intent.operation, referenceId: session.intent.referenceId,
          status: session.status, expiresAt: session.expiresAt };
      });
    },
    async completeReferenceManagement(sessionId, tokenValue, materialValue) {
      if (!managementEnabled) throw new Error("SECRET_BROKER_MANAGEMENT_UNAVAILABLE");
      const id = identifier(sessionId, "SECRET_MANAGEMENT_SESSION_INVALID");
      const token = required(tokenValue, "SECRET_MANAGEMENT_TOKEN_INVALID", 256);
      return referenceStore.mutate(async (state) => {
        const session = state.sessions[id]; if (!session) throw new Error("SECRET_MANAGEMENT_SESSION_NOT_FOUND");
        if (!authorized(`Bearer ${token}`, managementToken(id)) || session.tokenDigest !== sha(token)) {
          throw new Error("SECRET_MANAGEMENT_TOKEN_INVALID");
        }
        if (Date.parse(session.expiresAt) <= Date.parse(now())) throw new Error("SECRET_MANAGEMENT_SESSION_EXPIRED");
        if (session.status === "COMPLETED") return { ok: true, reference: structuredClone(session.result) };
        if (session.status !== "PENDING") throw new Error(session.code ?? "SECRET_MANAGEMENT_SESSION_FAILED");
        const intent = session.intent; const existing = state.references[intent.referenceId];
        try {
          let reference;
          if (intent.operation === "CREATE") {
            const profile = profiles.find((item) => item.purpose === intent.purpose &&
              item.providerAdapterId === intent.providerAdapterId);
            if (!profile || existing) throw new Error(existing ? "SECRET_REFERENCE_ALREADY_EXISTS" : "SECRET_MANAGEMENT_PROFILE_NOT_FOUND");
            const material = secretMaterial(materialValue);
            const path = `${profile.pathPrefix}/${intent.companyId}/${intent.referenceId}`;
            const written = await options.vaultClient.writeKvVersion({ mount: profile.mount, path, field: profile.field,
              value: material, expectedVersion: 0 });
            if (written?.version !== 1) throw new Error("VAULT_SECRET_VERSION_MISMATCH");
            reference = validateReference({ id: intent.referenceId, companyId: intent.companyId, purpose: intent.purpose,
              providerAdapterId: intent.providerAdapterId, currentVersion: 1, status: "ACTIVE",
              vault: { mount: profile.mount, path, version: 1, field: profile.field,
                environmentVariable: profile.environmentVariable } });
          } else {
            if (!existing || existing.companyId !== intent.companyId || existing.currentVersion !== intent.expectedVersion) {
              throw new Error("SECRET_REFERENCE_CHANGED");
            }
            if (intent.operation === "ROTATE") {
              const material = secretMaterial(materialValue);
              const written = await options.vaultClient.writeKvVersion({ mount: existing.vault.mount,
                path: existing.vault.path, field: existing.vault.field, value: material,
                expectedVersion: intent.expectedVersion });
              if (written?.version !== intent.expectedVersion + 1) throw new Error("VAULT_SECRET_VERSION_MISMATCH");
              reference = validateReference({ ...existing, currentVersion: written.version, status: "ACTIVE",
                vault: { ...existing.vault, version: written.version } });
            } else {
              reference = validateReference({ ...existing, status: intent.operation === "SUSPEND" ? "SUSPENDED" : "REVOKED" });
            }
          }
          state.references[intent.referenceId] = reference;
          session.status = "COMPLETED"; session.completedAt = now(); session.result = publicReference(reference);
          return { ok: true, reference: structuredClone(session.result) };
        } catch (error) {
          const code = error instanceof Error && /^[A-Z][A-Z0-9_]{2,95}$/.test(error.message)
            ? error.message : "SECRET_MANAGEMENT_FAILED";
          session.status = "FAILED"; session.failedAt = now(); session.code = code;
          session.retryable = ["VAULT_UNAVAILABLE", "VAULT_PROTOCOL_INVALID"].includes(code);
          return { ok: false, error: { code, retryable: session.retryable } };
        }
      });
    },
    async referenceManagementResult(companyId, sessionId) {
      const company = identifier(companyId, "SECRET_BROKER_COMPANY_ID_INVALID");
      const id = identifier(sessionId, "SECRET_MANAGEMENT_SESSION_INVALID");
      return referenceStore.query((state) => {
        const session = state.sessions[id];
        if (!session || session.intent.companyId !== company) throw new Error("SECRET_MANAGEMENT_SESSION_NOT_FOUND");
        if (session.status === "PENDING" && Date.parse(session.expiresAt) <= Date.parse(now())) {
          return { status: "FAILED", code: "SECRET_MANAGEMENT_SESSION_EXPIRED", retryable: false };
        }
        if (session.status === "PENDING") return { status: "PENDING" };
        if (session.status === "FAILED") return { status: "FAILED", code: session.code, retryable: session.retryable === true };
        return { status: "COMPLETED", reference: structuredClone(session.result) };
      });
    },
    async revokeLease(companyId, leaseIdValue, reasonCode) {
      const company = identifier(companyId, "SECRET_BROKER_COMPANY_ID_INVALID");
      const lease = identifier(leaseIdValue, "SECRET_BROKER_LEASE_ID_INVALID");
      const reason = required(reasonCode, "SECRET_BROKER_REASON_INVALID", 64);
      if (!CODE.test(reason)) throw new Error("SECRET_BROKER_REASON_INVALID");
      await store.mutate((state) => {
        const record = state.leases[lease]; if (!record || record.companyId !== company) throw new Error("SECRET_LEASE_NOT_FOUND");
        if (record.status !== "REVOKED") { record.status = "REVOKED"; record.revokedAt = now(); record.revocationReason = reason; }
      });
    },
  };
}

/**
 * One origin, two non-interchangeable bearer authorities. Only the execution
 * authority can reach the material-returning redemption route.
 */
export function createVaultSecretBrokerHttpService(options) {
  if (!options?.broker || typeof options.broker.issueLease !== "function" ||
      required(options.controlBearerToken, "VAULT_BROKER_CONTROL_TOKEN_REQUIRED", 16_384).length < 16 ||
      required(options.executionBearerToken, "VAULT_BROKER_EXECUTION_TOKEN_REQUIRED", 16_384).length < 16 ||
      options.controlBearerToken === options.executionBearerToken) {
    throw new Error("VAULT_BROKER_HTTP_CONFIGURATION_INVALID");
  }
  return createServer(async (request, response) => {
    const method = request.method ?? "GET";
    const requestUrl = new URL(request.url ?? "/", "http://vault-broker.invalid");
    const path = requestUrl.pathname;
    const managementView = method === "GET" ? path.match(/^\/manage\/(management-[a-f0-9]{32})$/) : null;
    const managementComplete = method === "POST" ? path.match(/^\/manage\/(management-[a-f0-9]{32})\/complete$/) : null;
    if (managementView || managementComplete) {
      try {
        if (managementView) {
          const token = requestUrl.searchParams.get("token");
          const session = await options.broker.inspectReferenceManagement(managementView[1], token);
          return sendHtml(response, 200, managementPage(session, token));
        }
        const form = await requestForm(request); const token = form.get("token");
        const completion = await options.broker.completeReferenceManagement(managementComplete[1], token,
          form.get("material") ?? undefined);
        if (completion?.ok === false) throw new Error(completion.error.code);
        return sendHtml(response, 200, managementCompletedPage());
      } catch (error) {
        const code = error instanceof Error ? error.message : "SECRET_MANAGEMENT_FAILED";
        const status = code === "SECRET_MANAGEMENT_TOKEN_INVALID" ? 401 : code.endsWith("_EXPIRED") ? 410 :
          code.endsWith("_NOT_FOUND") ? 404 : code === "VAULT_BROKER_REQUEST_TOO_LARGE" ? 413 : 422;
        return sendHtml(response, status, "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Secret operation failed</title></head><body><main><h1>Secret operation failed</h1><p>Return to Company OS and check the Broker status.</p></main></body></html>");
      }
    }
    const executionRoute = method === "POST" && path === "/v1/redemptions";
    const expectedToken = executionRoute ? options.executionBearerToken : options.controlBearerToken;
    if (!authorized(request.headers.authorization, expectedToken)) {
      return sendJson(response, 401, { error: { code: "AUTHENTICATION_REQUIRED" } });
    }
    try {
      if (method === "GET" && path === "/v1/health") {
        return sendJson(response, 200, { status: await options.broker.health() });
      }
      const reference = path.match(/^\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/references\/([a-z0-9][a-z0-9-]{0,63})$/);
      if (method === "GET" && reference) {
        const value = await options.broker.describe(reference[1], reference[2]);
        return value ? sendJson(response, 200, { reference: value })
          : sendJson(response, 404, { error: { code: "SECRET_REFERENCE_NOT_FOUND", retryable: false } });
      }
      if (method === "POST" && path === "/v1/leases") {
        const body = await requestJson(request);
        if (body?.schemaVersion !== 1) throw new Error("SECRET_LEASE_REQUEST_INVALID");
        const result = await options.broker.issueLease(body.intent, body.authorizationReceiptId);
        return result.ok ? sendJson(response, 201, { lease: result.value })
          : sendJson(response, result.error.retryable ? 503 : 422, { error: result.error });
      }
      if (method === "POST" && path === "/v1/reference-management-sessions") {
        const body = await requestJson(request);
        if (body?.schemaVersion !== 1) throw new Error("SECRET_MANAGEMENT_REQUEST_INVALID");
        const origin = options.managementPublicOriginFromRequest === true ? `http://${request.headers.host}` : undefined;
        const session = await options.broker.beginReferenceManagement(body.intent, body.authorizationReceiptId, origin);
        return sendJson(response, 201, { session });
      }
      const managementResult = path.match(/^\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/reference-management-sessions\/(management-[a-f0-9]{32})$/);
      if (method === "GET" && managementResult) {
        return sendJson(response, 200, { result: await options.broker.referenceManagementResult(managementResult[1], managementResult[2]) });
      }
      const revocation = path.match(/^\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/leases\/(lease-[a-f0-9]{32})\/revocations$/);
      if (method === "POST" && revocation) {
        const body = await requestJson(request);
        if (body?.schemaVersion !== 1) throw new Error("SECRET_LEASE_REVOCATION_INVALID");
        await options.broker.revokeLease(revocation[1], revocation[2], body.reasonCode);
        return sendJson(response, 202, { revoked: true });
      }
      if (executionRoute) {
        const body = await requestJson(request);
        if (body?.schemaVersion !== 1) throw new Error("SECRET_LEASE_REDEMPTION_INVALID");
        const material = await options.broker.redeemLease(body);
        return sendJson(response, 200, { material });
      }
      return sendJson(response, 404, { error: { code: "NOT_FOUND" } });
    } catch (error) {
      const code = error instanceof Error && /^[A-Z][A-Z0-9_]{2,95}$/.test(error.message)
        ? error.message : "VAULT_BROKER_OPERATION_FAILED";
      const status = code.endsWith("_NOT_FOUND") ? 404 : code === "VAULT_BROKER_REQUEST_TOO_LARGE" ? 413 :
        code === "VAULT_UNAVAILABLE" ? 503 : 422;
      return sendJson(response, status, { error: { code } });
    }
  });
}
