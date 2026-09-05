import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const STATUS = new Set([
  "PENDING", "WORKING", "WAITING", "BLOCKED", "AWAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED",
]);
const BILLING_TYPES = new Set(["metered_api", "subscription_included", "subscription_overage", "credits", "fixed", "unknown"]);
const TRACE_KINDS = new Set(["WORKFLOW", "MODEL", "TOOL", "DATA"]);
const RESOURCE_TYPES = new Set(["MODEL", "TOOL", "DATA", "ASSET"]);
const RESOURCE_OPERATION = /^[A-Z][A-Z0-9:_-]{0,63}$/;
const FORBIDDEN_KEY = /(?:^|_)(?:credential|password|secret|token|private[_-]?reasoning|chain[_-]?of[_-]?thought|external[_-]?session|session[_-]?id)(?:$|_)/i;

function deploymentSecret(environment, name) {
  const inline = environment[name]?.trim();
  const path = environment[`${name}_FILE`]?.trim();
  if (inline && path) throw new Error(`${name}_SOURCE_AMBIGUOUS`);
  if (inline) return inline;
  if (!path) return undefined;
  if (!isAbsolute(path) || path.includes("\0")) throw new Error(`${name}_FILE_PATH_INVALID`);
  const metadata = statSync(path);
  if (!metadata.isFile() || metadata.size < 1 || metadata.size > 16_384) throw new Error(`${name}_FILE_INVALID`);
  const value = readFileSync(path, "utf8").trim();
  if (!value) throw new Error(`${name}_FILE_INVALID`);
  return value;
}

function requiredText(value, code, maximum = 256) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || /[\r\n]/.test(value)) throw new Error(code);
  return value.trim();
}

function portableId(value, code) {
  const normalized = requiredText(value, code, 64);
  if (!ID.test(normalized)) throw new Error(code);
  return normalized;
}

function isLoopback(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

function secretFree(value, path = "payload") {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return;
  if (Array.isArray(value)) {
    if (value.length > 1_000) throw new Error("HTTP_AGENT_NODE_PAYLOAD_INVALID");
    value.forEach((item, index) => secretFree(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") throw new Error("HTTP_AGENT_NODE_PAYLOAD_INVALID");
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) throw new Error("HTTP_AGENT_NODE_PRIVATE_MATERIAL_FORBIDDEN");
    secretFree(nested, `${path}.${key}`);
  }
}

export function validateHttpAgentNodeConfiguration(input) {
  const connectorId = portableId(input?.connectorId, "HTTP_AGENT_NODE_CONNECTOR_ID_INVALID");
  const displayName = requiredText(input?.displayName, "HTTP_AGENT_NODE_DISPLAY_NAME_INVALID", 120);
  let url;
  try { url = new URL(requiredText(input?.baseUrl, "HTTP_AGENT_NODE_BASE_URL_REQUIRED", 2_048)); }
  catch { throw new Error("HTTP_AGENT_NODE_BASE_URL_INVALID"); }
  if (url.username || url.password) throw new Error("HTTP_AGENT_NODE_URL_CREDENTIALS_FORBIDDEN");
  if (url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("HTTP_AGENT_NODE_BASE_URL_INVALID");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && input.allowInsecureLoopback === true && isLoopback(url.hostname))) {
    throw new Error("HTTP_AGENT_NODE_TLS_REQUIRED");
  }
  const bearerToken = requiredText(input?.bearerToken, "HTTP_AGENT_NODE_BEARER_TOKEN_REQUIRED", 16_384);
  const requestTimeoutMs = input?.requestTimeoutMs;
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 250 || requestTimeoutMs > 60_000) {
    throw new Error("HTTP_AGENT_NODE_TIMEOUT_INVALID");
  }
  const maximumTimeoutSeconds = input?.maximumTimeoutSeconds ?? 86_400;
  if (!Number.isSafeInteger(maximumTimeoutSeconds) || maximumTimeoutSeconds < 1 || maximumTimeoutSeconds > 86_400) {
    throw new Error("HTTP_AGENT_NODE_MAXIMUM_WORK_TIMEOUT_INVALID");
  }
  return Object.freeze({ connectorId, displayName, baseUrl: url.origin, bearerToken,
    allowInsecureLoopback: input.allowInsecureLoopback === true, requestTimeoutMs, maximumTimeoutSeconds });
}

function configurationFromEnvironment(environment = process.env) {
  const timeout = Number(environment.COMPANY_OS_HTTP_AGENT_NODE_TIMEOUT_MS ?? "10000");
  const maximumWorkTimeout = Number(environment.COMPANY_OS_HTTP_AGENT_NODE_MAXIMUM_TIMEOUT_SECONDS ?? "86400");
  return validateHttpAgentNodeConfiguration({
    connectorId: environment.COMPANY_OS_HTTP_AGENT_NODE_ID ?? "http-agent-node",
    displayName: environment.COMPANY_OS_HTTP_AGENT_NODE_NAME ?? "Enterprise HTTP Agent Node",
    baseUrl: environment.COMPANY_OS_HTTP_AGENT_NODE_BASE_URL,
    bearerToken: deploymentSecret(environment, "COMPANY_OS_HTTP_AGENT_NODE_BEARER_TOKEN"),
    allowInsecureLoopback: environment.COMPANY_OS_HTTP_AGENT_NODE_ALLOW_INSECURE_LOOPBACK === "true",
    requestTimeoutMs: timeout,
    maximumTimeoutSeconds: maximumWorkTimeout,
  });
}

async function boundedJson(response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) throw new Error("HTTP_AGENT_NODE_PROTOCOL_INVALID");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("HTTP_AGENT_NODE_PROTOCOL_INVALID");
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1_048_576) {
      await reader.cancel();
      throw new Error("HTTP_AGENT_NODE_RESPONSE_TOO_LARGE");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))));
  } catch {
    throw new Error("HTTP_AGENT_NODE_PROTOCOL_INVALID");
  }
}

function responseFailure(status) {
  if (status === 401 || status === 403) return "HTTP_AGENT_NODE_AUTHENTICATION_FAILED";
  if (status === 409) return "HTTP_AGENT_NODE_CONFLICT";
  if (status === 429) return "HTTP_AGENT_NODE_RATE_LIMITED";
  if (status >= 500) return "HTTP_AGENT_NODE_UNAVAILABLE";
  return "HTTP_AGENT_NODE_REQUEST_REJECTED";
}

function validateRuntimeTrace(trace, workId) {
  if (!trace || typeof trace !== "object" || Array.isArray(trace) || trace.workId !== workId ||
      ![trace.id, trace.companyId, trace.attemptId, trace.agentId].every((value) => typeof value === "string" && ID.test(value)) ||
      !Array.isArray(trace.spans) || trace.spans.length < 1 || trace.spans.length > 256 ||
      typeof trace.recordedAt !== "string" || !Number.isFinite(Date.parse(trace.recordedAt))) {
    throw new Error("HTTP_AGENT_NODE_RUNTIME_TRACE_INVALID");
  }
  const ids = new Set();
  for (const span of trace.spans) {
    if (!span || typeof span !== "object" || Array.isArray(span) || !ID.test(span.id) || ids.has(span.id) ||
        span.parentSpanId !== null && !ID.test(span.parentSpanId) || !TRACE_KINDS.has(span.kind) ||
        typeof span.name !== "string" || !span.name.trim() || span.name.length > 160 || !["OK", "ERROR"].includes(span.status) ||
        !Number.isFinite(Date.parse(span.startedAt)) || !Number.isFinite(Date.parse(span.endedAt)) ||
        Date.parse(span.endedAt) < Date.parse(span.startedAt) || Date.parse(span.endedAt) > Date.parse(trace.recordedAt)) {
      throw new Error("HTTP_AGENT_NODE_RUNTIME_TRACE_INVALID");
    }
    ids.add(span.id);
    if (span.resource !== null && (!span.resource || typeof span.resource !== "object" || Array.isArray(span.resource) ||
        !RESOURCE_TYPES.has(span.resource.type) || !ID.test(span.resource.id) || !ID.test(span.resource.authorityId) ||
        !RESOURCE_OPERATION.test(span.resource.operation))) throw new Error("HTTP_AGENT_NODE_RUNTIME_TRACE_INVALID");
  }
  if (trace.spans.some((span) => span.parentSpanId !== null && !ids.has(span.parentSpanId))) {
    throw new Error("HTTP_AGENT_NODE_RUNTIME_TRACE_INVALID");
  }
}

function validateObservation(value, workId) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.workId !== workId ||
      !Number.isSafeInteger(value.sequence) || value.sequence < 1 || !STATUS.has(value.status) ||
      typeof value.summary !== "string" || !value.summary.trim() || value.summary.length > 2_000 ||
      !Array.isArray(value.evidenceRefs) || value.evidenceRefs.some((item) => typeof item !== "string" || !ID.test(item)) ||
      typeof value.recordedAt !== "string" || !Number.isFinite(Date.parse(value.recordedAt))) {
    throw new Error("HTTP_AGENT_NODE_OBSERVATION_INVALID");
  }
  if (value.resultReference !== undefined && value.resultReference !== null &&
      (typeof value.resultReference !== "string" || !ID.test(value.resultReference))) {
    throw new Error("HTTP_AGENT_NODE_OBSERVATION_INVALID");
  }
  if (value.evidenceOutputs !== undefined && (!Array.isArray(value.evidenceOutputs) || value.evidenceOutputs.some((output) =>
    !output || typeof output !== "object" || !ID.test(output.evidenceReference) || !DIGEST.test(output.contentDigest)))) {
    throw new Error("HTTP_AGENT_NODE_OBSERVATION_INVALID");
  }
  if (value.usageOutputs !== undefined && (!Array.isArray(value.usageOutputs) || value.usageOutputs.length > 128 ||
      new Set(value.usageOutputs.map((usage) => usage?.usageReference)).size !== value.usageOutputs.length ||
      value.usageOutputs.some((usage) => !usage || typeof usage !== "object" || !ID.test(usage.usageReference) ||
        !ID.test(usage.biller) || !BILLING_TYPES.has(usage.billingType) ||
        !["reported", "unpriced"].includes(usage.costStatus) ||
        ![usage.inputTokens, usage.cachedInputTokens, usage.outputTokens, usage.costCents]
          .every((count) => Number.isSafeInteger(count) && count >= 0) ||
        usage.costStatus === "unpriced" && usage.costCents !== 0 ||
        typeof usage.occurredAt !== "string" || !Number.isFinite(Date.parse(usage.occurredAt))))) {
    throw new Error("HTTP_AGENT_NODE_OBSERVATION_INVALID");
  }
  if (value.runtimeTrace !== undefined) validateRuntimeTrace(value.runtimeTrace, workId);
  secretFree(value);
  return structuredClone(value);
}

class HttpAgentNodeConnector {
  #configuration;
  constructor(configuration) { this.#configuration = configuration; }

  async #request(method, path, body, acceptedStatuses) {
    if (body !== undefined) {
      secretFree(body);
      if (Buffer.byteLength(JSON.stringify(body)) > 262_144) throw new Error("HTTP_AGENT_NODE_REQUEST_TOO_LARGE");
    }
    let response;
    try {
      response = await fetch(new URL(path, this.#configuration.baseUrl), {
        method, redirect: "error", signal: AbortSignal.timeout(this.#configuration.requestTimeoutMs),
        headers: { accept: "application/json", authorization: `Bearer ${this.#configuration.bearerToken}`,
          "content-type": "application/json", "x-company-os-connector-protocol": "1.0" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("HTTP_AGENT_NODE_")) throw error;
      throw new Error("HTTP_AGENT_NODE_UNAVAILABLE");
    }
    const payload = await boundedJson(response);
    if (!acceptedStatuses.includes(response.status)) throw new Error(responseFailure(response.status));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("HTTP_AGENT_NODE_PROTOCOL_INVALID");
    return payload;
  }

  async capabilities() {
    return { connectorId: this.#configuration.connectorId, displayName: this.#configuration.displayName,
      protocolVersion: "1.0", supportsPause: true, supportsResume: true,
      supportsCancellation: true, supportsEvidence: true,
      maximumTimeoutSeconds: this.#configuration.maximumTimeoutSeconds };
  }

  async health() {
    try {
      const payload = await this.#request("GET", "/v1/health", undefined, [200]);
      return ["HEALTHY", "DEGRADED", "UNAVAILABLE"].includes(payload.status) ? payload.status : "UNAVAILABLE";
    } catch { return "UNAVAILABLE"; }
  }

  async deploy(agent) {
    if (!agent || agent.runtimeConnectorId !== this.#configuration.connectorId) throw new Error("HTTP_AGENT_NODE_AGENT_MISMATCH");
    secretFree(agent);
    const payload = await this.#request("POST", "/v1/deployments", { schemaVersion: 1, agent }, [200, 201]);
    const deploymentId = portableId(payload.deploymentId, "HTTP_AGENT_NODE_DEPLOYMENT_INVALID");
    return { id: deploymentId, agentId: portableId(agent.id, "HTTP_AGENT_NODE_AGENT_ID_INVALID"),
      connectorId: this.#configuration.connectorId };
  }

  async submit(deployment, request, proof) {
    if (!deployment || deployment.connectorId !== this.#configuration.connectorId || deployment.agentId !== request?.agentId ||
        proof?.connectorId !== this.#configuration.connectorId) throw new Error("HTTP_AGENT_NODE_SUBMIT_BINDING_MISMATCH");
    secretFree({ deployment, request, proof });
    const payload = await this.#request("POST", "/v1/work", {
      schemaVersion: 1, deployment: { id: deployment.id, agentId: deployment.agentId }, request, runtimeProof: proof,
    }, [200, 202]);
    if (payload.accepted !== true) throw new Error("HTTP_AGENT_NODE_SUBMIT_REJECTED");
    return { accepted: true, executionId: portableId(payload.executionId, "HTTP_AGENT_NODE_EXECUTION_ID_INVALID") };
  }

  async observe(workId) {
    const id = portableId(workId, "HTTP_AGENT_NODE_WORK_ID_INVALID");
    const payload = await this.#request("GET", `/v1/work/${encodeURIComponent(id)}/observations`, undefined, [200]);
    if (!Array.isArray(payload.observations) || payload.observations.length > 1_000) {
      throw new Error("HTTP_AGENT_NODE_OBSERVATION_INVALID");
    }
    const observations = payload.observations.map((value) => validateObservation(value, id));
    for (let index = 1; index < observations.length; index += 1) {
      if (observations[index].sequence !== observations[index - 1].sequence + 1) {
        throw new Error("HTTP_AGENT_NODE_OBSERVATION_SEQUENCE_INVALID");
      }
    }
    return observations;
  }

  async #command(workId, body) {
    const id = portableId(workId, "HTTP_AGENT_NODE_WORK_ID_INVALID");
    const payload = await this.#request("POST", `/v1/work/${encodeURIComponent(id)}/commands`,
      { schemaVersion: 1, ...body }, [200, 202]);
    if (payload.accepted !== true) throw new Error("HTTP_AGENT_NODE_COMMAND_REJECTED");
  }
  pause(workId, reason) { return this.#command(workId, { operation: "PAUSE",
    reason: requiredText(reason, "HTTP_AGENT_NODE_PAUSE_REASON_INVALID", 512) }); }
  resume(workId, approvalId) { return this.#command(workId, { operation: "RESUME",
    approvalId: portableId(approvalId, "HTTP_AGENT_NODE_APPROVAL_ID_INVALID") }); }
  cancel(workId, reason) { return this.#command(workId, { operation: "CANCEL",
    reason: requiredText(reason, "HTTP_AGENT_NODE_CANCEL_REASON_INVALID", 512) }); }
}

export function createAgentExecutionPort(options, environment = process.env) {
  return new HttpAgentNodeConnector(options ? validateHttpAgentNodeConfiguration(options) : configurationFromEnvironment(environment));
}
