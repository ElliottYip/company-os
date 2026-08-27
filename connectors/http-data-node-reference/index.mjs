import { createHash, timingSafeEqual } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const OPERATIONS = new Set(["READ", "WRITE", "EXPORT"]);
const CLASSIFICATIONS = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"];
const FORBIDDEN_KEY = /(?:^|_)(?:credential|password|secret|token|private[_-]?reasoning|chain[_-]?of[_-]?thought|external[_-]?session|record[_-]?content|raw[_-]?data)(?:$|_)/i;
const REQUEST_KEYS = new Set([
  "requestId", "companyId", "workId", "agentId", "dataSourceId", "authorizationContractId",
  "authorizationReceiptId", "operation", "purpose", "classification", "destinationId", "contentDigest",
  "requestedAt",
]);

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`).join(",")}}`;
}

function hash(value) { return createHash("sha256").update(canonical(value)).digest("hex"); }
function secretFree(value) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return;
  if (Array.isArray(value)) {
    if (value.length > 1_000) throw new Error("REFERENCE_DATA_NODE_PAYLOAD_INVALID");
    value.forEach(secretFree); return;
  }
  if (!value || typeof value !== "object") throw new Error("REFERENCE_DATA_NODE_PAYLOAD_INVALID");
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) throw new Error("REFERENCE_DATA_NODE_PRIVATE_MATERIAL_FORBIDDEN");
    secretFree(nested);
  }
}
function id(value, code = "REFERENCE_DATA_NODE_REQUEST_INVALID") {
  if (typeof value !== "string" || !ID.test(value)) throw new Error(code);
  return value;
}

function validateRequest(value) {
  secretFree(value);
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((key) => !REQUEST_KEYS.has(key)) ||
      Object.keys(value).length !== REQUEST_KEYS.size) throw new Error("REFERENCE_DATA_NODE_REQUEST_INVALID");
  for (const key of ["requestId", "companyId", "workId", "agentId", "dataSourceId",
    "authorizationContractId", "authorizationReceiptId"]) id(value[key]);
  if (!OPERATIONS.has(value.operation) || !CLASSIFICATIONS.includes(value.classification) ||
      typeof value.purpose !== "string" || !value.purpose.trim() || value.purpose.length > 256 ||
      /[\r\n]/.test(value.purpose) || typeof value.requestedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value.requestedAt) ||
      !Number.isFinite(Date.parse(value.requestedAt)) ||
      value.destinationId !== null && (typeof value.destinationId !== "string" || !ID.test(value.destinationId)) ||
      value.contentDigest !== null && (typeof value.contentDigest !== "string" || !DIGEST.test(value.contentDigest))) {
    throw new Error("REFERENCE_DATA_NODE_REQUEST_INVALID");
  }
  return structuredClone(value);
}

function validateSources(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 100) {
    throw new Error("REFERENCE_DATA_NODE_SOURCES_INVALID");
  }
  const result = values.map((value) => {
    id(value?.id, "REFERENCE_DATA_NODE_SOURCES_INVALID");
    if (!CLASSIFICATIONS.includes(value.classification) || !Array.isArray(value.allowedOperations) ||
        value.allowedOperations.length < 1 || value.allowedOperations.some((operation) => operation !== "READ") ||
        typeof value.contentDigest !== "string" || !DIGEST.test(value.contentDigest)) {
      throw new Error("REFERENCE_DATA_NODE_SOURCES_INVALID");
    }
    return Object.freeze({ id: value.id, classification: value.classification,
      allowedOperations: Object.freeze([...new Set(value.allowedOperations)]), contentDigest: value.contentDigest });
  });
  if (new Set(result.map(({ id: sourceId }) => sourceId)).size !== result.length) {
    throw new Error("REFERENCE_DATA_NODE_SOURCES_INVALID");
  }
  return Object.freeze(result);
}

export async function loadReferenceDataNodeFixtureCatalog(filePath) {
  let catalog;
  try { catalog = JSON.parse(await readFile(filePath, "utf8")); }
  catch { throw new Error("REFERENCE_DATA_NODE_CATALOG_INVALID"); }
  if (catalog?.schemaVersion !== 1 || catalog.fixtureOnly !== true || !Array.isArray(catalog.dataSources) ||
      Object.keys(catalog).some((key) => !["schemaVersion", "fixtureOnly", "dataSources"].includes(key))) {
    throw new Error("REFERENCE_DATA_NODE_CATALOG_INVALID");
  }
  return validateSources(catalog.dataSources.map((source) => {
    if (!source || typeof source !== "object" || Array.isArray(source) || !Array.isArray(source.records) ||
        source.records.length < 1 || source.records.length > 1_000 ||
        Object.keys(source).some((key) => !["id", "classification", "allowedOperations", "records"].includes(key))) {
      throw new Error("REFERENCE_DATA_NODE_CATALOG_INVALID");
    }
    secretFree(source.records);
    return { id: source.id, classification: source.classification, allowedOperations: source.allowedOperations,
      contentDigest: `sha256:${hash({ fixtureOnly: true, records: source.records })}` };
  }));
}

function initialState() { return { schemaVersion: 1, requests: {} }; }

export class JsonFileReferenceDataNodeStore {
  #queue = Promise.resolve();
  constructor(filePath) {
    if (typeof filePath !== "string" || !filePath.trim()) throw new Error("REFERENCE_DATA_NODE_STORE_PATH_REQUIRED");
    this.filePath = filePath;
  }
  async #read() {
    try {
      const value = JSON.parse(await readFile(this.filePath, "utf8"));
      if (value?.schemaVersion !== 1 || !value.requests || typeof value.requests !== "object" ||
          Array.isArray(value.requests)) throw new Error();
      return value;
    } catch (error) {
      if (error?.code === "ENOENT") return initialState();
      throw new Error("REFERENCE_DATA_NODE_STORE_CORRUPT");
    }
  }
  async #write(state) {
    const temporary = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporary, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.filePath);
  }
  grant(request, result) {
    const run = this.#queue.then(async () => {
      const state = await this.#read();
      const requestDigest = hash(request);
      const prior = state.requests[request.requestId];
      if (prior) {
        if (prior.requestDigest !== requestDigest) throw new Error("REFERENCE_DATA_NODE_REQUEST_CONFLICT");
        return { result: structuredClone(prior.result), created: false };
      }
      state.requests[request.requestId] = { requestDigest, result: structuredClone(result) };
      await this.#write(state);
      return { result: structuredClone(result), created: true };
    });
    this.#queue = run.then(() => undefined, () => undefined);
    return run;
  }
}

function authorized(header, expected) {
  const supplied = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : "";
  const left = createHash("sha256").update(supplied).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}
async function jsonBody(request, maximumBytes) {
  let size = 0; const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw new Error("REFERENCE_DATA_NODE_REQUEST_TOO_LARGE");
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("REFERENCE_DATA_NODE_JSON_INVALID"); }
}
function send(response, status, body) {
  const encoded = JSON.stringify(body);
  response.writeHead(status, { "cache-control": "no-store", "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(encoded), "x-content-type-options": "nosniff" });
  response.end(encoded);
}
function errorStatus(code) {
  if (code === "REFERENCE_DATA_NODE_PROTOCOL_UNSUPPORTED") return 400;
  if (code === "REFERENCE_DATA_NODE_AUTHENTICATION_REQUIRED") return 401;
  if (code === "REFERENCE_DATA_NODE_REQUEST_CONFLICT") return 409;
  if (code === "REFERENCE_DATA_NODE_REQUEST_TOO_LARGE") return 413;
  return 422;
}

export function createReferenceDataNode(options) {
  if (!options?.store || typeof options.bearerToken !== "string" || options.bearerToken.length < 16) {
    throw new Error("REFERENCE_DATA_NODE_CONFIGURATION_INVALID");
  }
  const sources = validateSources(options.dataSources);
  const maximumBytes = options.maximumRequestBytes ?? 262_144;
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 16_384 || maximumBytes > 1_048_576) {
    throw new Error("REFERENCE_DATA_NODE_CONFIGURATION_INVALID");
  }
  return createServer(async (request, response) => {
    try {
      if (request.headers["x-company-os-data-connector-protocol"] !== "1.0") {
        throw new Error("REFERENCE_DATA_NODE_PROTOCOL_UNSUPPORTED");
      }
      if (!authorized(request.headers.authorization, options.bearerToken)) {
        throw new Error("REFERENCE_DATA_NODE_AUTHENTICATION_REQUIRED");
      }
      const method = request.method ?? "GET";
      const path = new URL(request.url ?? "/", "http://reference.data.node").pathname;
      if (method === "GET" && path === "/v1/health") return send(response, 200, { status: "HEALTHY" });
      if (method === "POST" && path === "/v1/data-access") {
        const body = await jsonBody(request, maximumBytes);
        if (body?.schemaVersion !== 1 || !body.request || Object.keys(body).length !== 2) {
          throw new Error("REFERENCE_DATA_NODE_REQUEST_INVALID");
        }
        const dataRequest = validateRequest(body.request);
        const source = sources.find(({ id: sourceId }) => sourceId === dataRequest.dataSourceId);
        if (!source) return send(response, 403, { result: {
          type: "DENIED", policyCode: "DATA_SOURCE_UNKNOWN", retryable: false,
        } });
        if (!source.allowedOperations.includes(dataRequest.operation)) return send(response, 403, { result: {
          type: "DENIED", policyCode: "OPERATION_NOT_ALLOWED", retryable: false,
        } });
        if (CLASSIFICATIONS.indexOf(dataRequest.classification) < CLASSIFICATIONS.indexOf(source.classification)) {
          return send(response, 403, { result: {
            type: "DENIED", policyCode: "CLASSIFICATION_NOT_ALLOWED", retryable: false,
          } });
        }
        const grantDigest = hash({ schemaVersion: 1, request: dataRequest, source: source.id,
          sourceContentDigest: source.contentDigest });
        const grant = await options.store.grant(dataRequest, {
          type: "GRANTED", dataReference: `fixture-${grantDigest.slice(0, 24)}`,
          evidenceReference: `evidence-${grantDigest.slice(0, 24)}`, contentDigest: source.contentDigest,
        });
        return send(response, grant.created ? 201 : 200, { result: grant.result });
      }
      return send(response, 404, { error: { code: "NOT_FOUND", retryable: false } });
    } catch (error) {
      const code = error instanceof Error && /^[A-Z][A-Z0-9_]{2,95}$/.test(error.message)
        ? error.message : "REFERENCE_DATA_NODE_OPERATION_FAILED";
      return send(response, errorStatus(code), { error: { code, retryable: false } });
    }
  });
}
