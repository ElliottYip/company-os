import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const BILLING_TYPES = new Set(["metered_api", "subscription_included", "subscription_overage", "credits", "fixed", "unknown"]);
const FORBIDDEN_KEY = /(?:^|_)(?:credential|password|secret|token|private[_-]?reasoning|chain[_-]?of[_-]?thought|external[_-]?session|session[_-]?id)(?:$|_)/i;

function secretFree(value) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return;
  if (Array.isArray(value)) return value.forEach(secretFree);
  if (!value || typeof value !== "object") throw new Error("REFERENCE_NODE_PAYLOAD_INVALID");
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) throw new Error("REFERENCE_NODE_PRIVATE_MATERIAL_FORBIDDEN");
    secretFree(nested);
  }
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`).join(",")}}`;
}

function digest(value) { return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`; }
function portableId(value, code) {
  if (typeof value !== "string" || !ID.test(value)) throw new Error(code);
  return value;
}
function newId(prefix) { return `${prefix}-${randomUUID()}`; }

function initialState() { return { schemaVersion: 1, deployments: {}, executions: {} }; }

export class JsonFileReferenceNodeStore {
  #queue = Promise.resolve();
  constructor(filePath) {
    if (typeof filePath !== "string" || !filePath.trim()) throw new Error("REFERENCE_NODE_STORE_PATH_REQUIRED");
    this.filePath = filePath;
  }
  async #read() {
    try {
      const value = JSON.parse(await readFile(this.filePath, "utf8"));
      if (value?.schemaVersion !== 1 || !value.deployments || !value.executions) throw new Error();
      return value;
    } catch (error) {
      if (error?.code === "ENOENT") return initialState();
      throw new Error("REFERENCE_NODE_STORE_CORRUPT");
    }
  }
  async #write(state) {
    const temporary = `${this.filePath}.tmp-${process.pid}-${randomUUID()}`;
    await writeFile(temporary, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.filePath);
  }
  #mutate(operation) {
    const run = this.#queue.then(async () => {
      const state = await this.#read();
      const result = await operation(state);
      await this.#write(state);
      return result;
    });
    this.#queue = run.then(() => undefined, () => undefined);
    return run;
  }
  deployment(agent) {
    return this.#mutate((state) => {
      const prior = Object.values(state.deployments).find((entry) => entry.agentId === agent.id);
      if (prior) {
        if (prior.agentDigest !== digest(agent)) throw new Error("REFERENCE_NODE_DEPLOYMENT_CONFLICT");
        return { deploymentId: prior.id, created: false };
      }
      const id = newId("deployment");
      state.deployments[id] = { id, agentId: agent.id, agentDigest: digest(agent) };
      return { deploymentId: id, created: true };
    });
  }
  acceptWork(submission) {
    return this.#mutate((state) => {
      const prior = state.executions[submission.workId];
      const submissionDigest = digest(submission);
      if (prior) {
        if (prior.submissionDigest !== submissionDigest) throw new Error("REFERENCE_NODE_WORK_CONFLICT");
        return { executionId: prior.executionId, created: false };
      }
      const executionId = newId("execution");
      state.executions[submission.workId] = { executionId, submissionDigest, observations: [], commands: [] };
      return { executionId, created: true };
    });
  }
  appendObservation(workId, observation) {
    return this.#mutate((state) => {
      const execution = state.executions[workId];
      if (!execution) throw new Error("REFERENCE_NODE_WORK_NOT_FOUND");
      const prior = execution.observations.find((item) => item.sequence === observation.sequence);
      if (prior) {
        if (canonical(prior) !== canonical(observation)) throw new Error("REFERENCE_NODE_OBSERVATION_CONFLICT");
        return false;
      }
      if (observation.sequence !== execution.observations.length + 1) throw new Error("REFERENCE_NODE_OBSERVATION_GAP");
      execution.observations.push(structuredClone(observation));
      return true;
    });
  }
  acceptCommand(workId, command) {
    return this.#mutate((state) => {
      const execution = state.executions[workId];
      if (!execution) throw new Error("REFERENCE_NODE_WORK_NOT_FOUND");
      const commandDigest = digest(command);
      if (execution.commands.includes(commandDigest)) return false;
      execution.commands.push(commandDigest);
      return true;
    });
  }
  async observations(workId) {
    await this.#queue;
    const state = await this.#read();
    const execution = state.executions[workId];
    if (!execution) throw new Error("REFERENCE_NODE_WORK_NOT_FOUND");
    return structuredClone(execution.observations);
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
    if (size > maximumBytes) throw new Error("REFERENCE_NODE_REQUEST_TOO_LARGE");
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("REFERENCE_NODE_JSON_INVALID"); }
}

function send(response, status, body) {
  const encoded = JSON.stringify(body);
  response.writeHead(status, { "cache-control": "no-store", "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(encoded), "x-content-type-options": "nosniff" });
  response.end(encoded);
}

export function createReferenceAgentNode(options) {
  if (!options?.store || !options?.driver || typeof options.bearerToken !== "string" || options.bearerToken.length < 16) {
    throw new Error("REFERENCE_NODE_CONFIGURATION_INVALID");
  }
  const maximumBytes = options.maximumRequestBytes ?? 262_144;
  const context = {
    recordObservation: async (workId, observation) => {
      portableId(workId, "REFERENCE_NODE_WORK_ID_INVALID");
      secretFree(observation);
      if (observation?.workId !== workId || !Number.isSafeInteger(observation.sequence) || observation.sequence < 1 ||
          typeof observation.summary !== "string" || !observation.summary.trim() ||
          !Array.isArray(observation.evidenceRefs) || !Number.isFinite(Date.parse(observation.recordedAt)) ||
          observation.evidenceOutputs?.some((item) => !DIGEST.test(item.contentDigest))) {
        throw new Error("REFERENCE_NODE_OBSERVATION_INVALID");
      }
      if (observation.usageOutputs !== undefined && (!Array.isArray(observation.usageOutputs) ||
          observation.usageOutputs.length > 128 || observation.usageOutputs.some((usage) =>
            !usage || !ID.test(usage.usageReference) || !ID.test(usage.biller) ||
            !BILLING_TYPES.has(usage.billingType) || !["reported", "unpriced"].includes(usage.costStatus) ||
            ![usage.inputTokens, usage.cachedInputTokens, usage.outputTokens, usage.costCents]
              .every((count) => Number.isSafeInteger(count) && count >= 0) ||
            usage.costStatus === "unpriced" && usage.costCents !== 0 ||
            !Number.isFinite(Date.parse(usage.occurredAt))))) {
        throw new Error("REFERENCE_NODE_OBSERVATION_INVALID");
      }
      return options.store.appendObservation(workId, observation);
    },
  };
  return createServer(async (request, response) => {
    try {
      if (!authorized(request.headers.authorization, options.bearerToken)) return send(response, 401, { error: { code: "AUTHENTICATION_REQUIRED" } });
      const method = request.method ?? "GET";
      const path = new URL(request.url ?? "/", "http://reference.node").pathname;
      if (method === "GET" && path === "/v1/health") {
        const status = await options.driver.health();
        return send(response, 200, { status: ["HEALTHY", "DEGRADED", "UNAVAILABLE"].includes(status) ? status : "UNAVAILABLE" });
      }
      if (method === "POST" && path === "/v1/deployments") {
        const body = await jsonBody(request, maximumBytes); secretFree(body);
        if (body?.schemaVersion !== 1 || !body.agent) throw new Error("REFERENCE_NODE_DEPLOYMENT_INVALID");
        portableId(body.agent.id, "REFERENCE_NODE_AGENT_ID_INVALID");
        const accepted = await options.store.deployment(body.agent);
        if (accepted.created) await options.driver.deploy?.(structuredClone(body.agent));
        return send(response, accepted.created ? 201 : 200, { deploymentId: accepted.deploymentId });
      }
      if (method === "POST" && path === "/v1/work") {
        const body = await jsonBody(request, maximumBytes); secretFree(body);
        if (body?.schemaVersion !== 1 || !body.request || !body.deployment || !body.runtimeProof) {
          throw new Error("REFERENCE_NODE_WORK_INVALID");
        }
        const workId = portableId(body.request.id, "REFERENCE_NODE_WORK_ID_INVALID");
        const accepted = await options.store.acceptWork({ workId, deployment: body.deployment,
          request: body.request, runtimeProof: body.runtimeProof });
        if (accepted.created) await options.driver.submit({ workId, deployment: structuredClone(body.deployment),
          request: structuredClone(body.request), runtimeProof: structuredClone(body.runtimeProof) }, context);
        return send(response, 202, { accepted: true, executionId: accepted.executionId });
      }
      const observations = path.match(/^\/v1\/work\/([a-z0-9][a-z0-9-]{0,63})\/observations$/);
      if (method === "GET" && observations) return send(response, 200, {
        observations: await options.store.observations(observations[1]),
      });
      const commands = path.match(/^\/v1\/work\/([a-z0-9][a-z0-9-]{0,63})\/commands$/);
      if (method === "POST" && commands) {
        const body = await jsonBody(request, maximumBytes); secretFree(body);
        if (body?.schemaVersion !== 1 || !["PAUSE", "RESUME", "CANCEL"].includes(body.operation)) {
          throw new Error("REFERENCE_NODE_COMMAND_INVALID");
        }
        const created = await options.store.acceptCommand(commands[1], body);
        if (created) await options.driver.command({ workId: commands[1], ...structuredClone(body) }, context);
        return send(response, 202, { accepted: true });
      }
      return send(response, 404, { error: { code: "NOT_FOUND" } });
    } catch (error) {
      const code = error instanceof Error && /^[A-Z][A-Z0-9_]{2,95}$/.test(error.message)
        ? error.message : "REFERENCE_NODE_OPERATION_FAILED";
      const status = code.endsWith("_NOT_FOUND") ? 404 : code.endsWith("_CONFLICT") ? 409
        : code === "REFERENCE_NODE_REQUEST_TOO_LARGE" ? 413 : 422;
      return send(response, status, { error: { code } });
    }
  });
}
