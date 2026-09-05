import { spawn as nodeSpawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const RESULT_SCHEMA = fileURLToPath(new URL("./result.schema.json", import.meta.url));
const MAX_JSONL_LINE = 1_048_576;
const MAX_STDERR = 64 * 1024;

function required(value, code, maximum = 4096) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || value.includes("\0")) throw new Error(code);
  return value.trim();
}
function absolute(value, code) { const path = required(value, code); if (!isAbsolute(path)) throw new Error(code); return path; }
function digest(value) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function stateFile(directory, workId) { if (!ID.test(workId)) throw new Error("CODEX_WORK_ID_INVALID"); return join(directory, `${workId}.json`); }
function artifactFile(directory, workId) { return join(directory, `${workId}.result.json`); }
function portableReference(prefix, workId) { return `${prefix}-${createHash("sha256").update(workId).digest("hex").slice(0, 32)}`; }
function loopback(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function codexEnvironment(environment = process.env) {
  const allowed = ["HOME", "PATH", "CODEX_HOME", "CODEX_ACCESS_TOKEN", "OPENAI_API_KEY", "HTTPS_PROXY", "HTTP_PROXY",
    "NO_PROXY", "SSL_CERT_FILE", "SSL_CERT_DIR", "NODE_EXTRA_CA_CERTS", "LANG", "LC_ALL"];
  return Object.fromEntries(allowed.flatMap((key) => environment[key] === undefined ? [] : [[key, environment[key]]]));
}

export function createSecretLeaseRedemptionClient(options) {
  let url;
  try { url = new URL(required(options?.baseUrl, "CODEX_REDEMPTION_BASE_URL_REQUIRED", 2_048)); }
  catch { throw new Error("CODEX_REDEMPTION_BASE_URL_INVALID"); }
  if (url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) {
    throw new Error("CODEX_REDEMPTION_BASE_URL_INVALID");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && options.allowInsecureLoopback === true && loopback(url.hostname))) {
    throw new Error("CODEX_REDEMPTION_TLS_REQUIRED");
  }
  const bearerToken = required(options.bearerToken, "CODEX_REDEMPTION_BEARER_TOKEN_REQUIRED", 16_384);
  if (bearerToken.length < 16) throw new Error("CODEX_REDEMPTION_BEARER_TOKEN_REQUIRED");
  const requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 250 || requestTimeoutMs > 60_000) {
    throw new Error("CODEX_REDEMPTION_TIMEOUT_INVALID");
  }
  const fetchImpl = options.fetch ?? fetch;
  return {
    async redeem(input) {
      for (const value of [input?.leaseId, input?.companyId, input?.consumerId, input?.workAttemptId]) {
        if (!ID.test(value)) throw new Error("CODEX_REDEMPTION_BINDING_INVALID");
      }
      let response;
      try {
        response = await fetchImpl(`${url.origin}/v1/redemptions`, { method: "POST", redirect: "error",
          signal: AbortSignal.timeout(requestTimeoutMs), headers: { accept: "application/json",
            authorization: `Bearer ${bearerToken}`, "content-type": "application/json" },
          body: JSON.stringify({ schemaVersion: 1, ...input }) });
      } catch { throw new Error("CODEX_SECRET_REDEMPTION_UNAVAILABLE"); }
      if (!(response.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
        throw new Error("CODEX_SECRET_REDEMPTION_PROTOCOL_INVALID");
      }
      const reader = response.body?.getReader(); if (!reader) throw new Error("CODEX_SECRET_REDEMPTION_PROTOCOL_INVALID");
      const chunks = []; let size = 0;
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength; if (size > 65_536) { await reader.cancel(); throw new Error("CODEX_SECRET_REDEMPTION_RESPONSE_TOO_LARGE"); }
        chunks.push(Buffer.from(value));
      }
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { throw new Error("CODEX_SECRET_REDEMPTION_PROTOCOL_INVALID"); }
      if (response.status !== 200) {
        const code = body?.error?.code;
        throw new Error(typeof code === "string" && /^SECRET_[A-Z0-9_]+$/.test(code) ? code : "CODEX_SECRET_REDEMPTION_FAILED");
      }
      const material = body?.material;
      if (!material || !["OPENAI_API_KEY", "CODEX_ACCESS_TOKEN"].includes(material.environmentVariable) ||
          typeof material.value !== "string" || !material.value || material.value.length > 32_768 || material.value.includes("\0") ||
          typeof material.expiresAt !== "string" || !Number.isFinite(Date.parse(material.expiresAt))) {
        throw new Error("CODEX_SECRET_REDEMPTION_PROTOCOL_INVALID");
      }
      return structuredClone(material);
    },
  };
}

function promptFor(submission, approvalId) {
  const request = submission?.request;
  if (!request || !ID.test(request.id) || !ID.test(request.companyId) || !ID.test(request.agentId) ||
      typeof request.goal !== "string" || !request.goal.trim() || request.goal.length > 4000) {
    throw new Error("CODEX_SUBMISSION_INVALID");
  }
  const actions = Array.isArray(request.input?.actionReferences) ? request.input.actionReferences : [];
  if (actions.length > 64 || actions.some((value) => typeof value !== "string" || value.length > 128)) {
    throw new Error("CODEX_SUBMISSION_INVALID");
  }
  return [
    "You are an acceptance Agent running inside a read-only customer execution node.",
    "Complete the bounded work below. Do not request credentials, expose private reasoning, or claim an external side effect.",
    `Goal: ${request.goal.trim()}`,
    `Allowed action references: ${actions.length ? actions.join(", ") : "none"}`,
    approvalId ? `A human approved resumption under opaque approval reference ${approvalId}.` : "No approval is attached.",
    "Return only the JSON object required by the supplied output schema.",
  ].join("\n");
}

function modelBindingFor(submission) {
  const request = submission?.request; const binding = request?.input?.modelBinding;
  if (binding === undefined) return null;
  const grants = request.input.executionGrantReferences;
  if (!binding || typeof binding !== "object" || !ID.test(binding.providerAdapterId) ||
      !ID.test(binding.modelReference) || !ID.test(binding.executionGrantReference) ||
      !ID.test(request.idempotencyKey) || !Array.isArray(grants) ||
      !grants.includes(binding.executionGrantReference)) throw new Error("CODEX_MODEL_BINDING_INVALID");
  return binding;
}

function runtimeTraceFor(state, recordedAt) {
  const request = state.submission?.request;
  const proof = state.submission?.runtimeProof;
  const attemptId = request?.input?.workAttemptId;
  if (!request || !ID.test(attemptId) || !ID.test(proof?.proofId)) return undefined;
  return { id: portableReference("trace", state.workId), companyId: request.companyId,
    workId: state.workId, attemptId, agentId: request.agentId,
    spans: [{ id: portableReference("span", state.workId), parentSpanId: null, kind: "TOOL",
      name: "Codex CLI read-only execution", startedAt: state.generationStartedAt ?? recordedAt,
      endedAt: recordedAt, status: "OK", resource: { type: "TOOL", id: "codex-cli",
        operation: "EXECUTE_READ_ONLY", authorityId: proof.proofId } }], recordedAt };
}

async function redeemedModelEnvironment(submission, redemption, now) {
  const binding = modelBindingFor(submission); if (!binding) return { environment: {}, modelReference: null };
  if (!redemption || typeof redemption.redeem !== "function") throw new Error("CODEX_SECRET_REDEMPTION_REQUIRED");
  const material = await redemption.redeem({ leaseId: binding.executionGrantReference,
    companyId: submission.request.companyId, consumerId: binding.providerAdapterId,
    workAttemptId: submission.request.idempotencyKey });
  if (!material || !["OPENAI_API_KEY", "CODEX_ACCESS_TOKEN"].includes(material.environmentVariable) ||
      typeof material.value !== "string" || !material.value || material.value.length > 32_768 || material.value.includes("\0") ||
      typeof material.expiresAt !== "string" || Date.parse(material.expiresAt) <= Date.parse(now())) {
    throw new Error("CODEX_SECRET_REDEMPTION_INVALID");
  }
  return { environment: { [material.environmentVariable]: material.value }, modelReference: binding.modelReference };
}

export function parseCodexExecJsonl(source) {
  let finalText = null; let inputTokens = 0; let cachedInputTokens = 0; let outputTokens = 0; let turnFailed = false;
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (Buffer.byteLength(line) > MAX_JSONL_LINE) throw new Error("CODEX_JSONL_LINE_TOO_LARGE");
    let event; try { event = JSON.parse(line); } catch { throw new Error("CODEX_JSONL_INVALID"); }
    if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("CODEX_JSONL_INVALID");
    if (event.type === "turn.failed" || event.type === "error") turnFailed = true;
    if (event.type === "item.completed" && event.item?.type === "agent_message" && typeof event.item.text === "string") {
      finalText = event.item.text;
    }
    const usage = event.usage ?? event.turn?.usage;
    if (usage && typeof usage === "object") {
      inputTokens = Number.isSafeInteger(usage.input_tokens) ? usage.input_tokens : inputTokens;
      cachedInputTokens = Number.isSafeInteger(usage.cached_input_tokens) ? usage.cached_input_tokens : cachedInputTokens;
      outputTokens = Number.isSafeInteger(usage.output_tokens) ? usage.output_tokens : outputTokens;
    }
  }
  if (turnFailed) throw new Error("CODEX_EXEC_REPORTED_FAILURE");
  if (!finalText) throw new Error("CODEX_FINAL_MESSAGE_MISSING");
  let result; try { result = JSON.parse(finalText); } catch { throw new Error("CODEX_RESULT_INVALID"); }
  if (result?.schemaVersion !== 1 || !["PASS", "NEEDS_REVIEW", "FAIL"].includes(result.outcome) ||
      typeof result.summary !== "string" || !result.summary.trim() || result.summary.length > 2000 ||
      typeof result.evidenceSummary !== "string" || !result.evidenceSummary.trim() || result.evidenceSummary.length > 4000 ||
      Object.keys(result).some((key) => !["schemaVersion", "outcome", "summary", "evidenceSummary"].includes(key))) {
    throw new Error("CODEX_RESULT_INVALID");
  }
  return { result: structuredClone(result), usage: { inputTokens, cachedInputTokens, outputTokens } };
}

export function signalCodexProcess(child, signal, options = {}) {
  const platform = options.platform ?? process.platform;
  const signalProcess = options.signalProcess ?? process.kill;
  if (platform !== "win32" && Number.isSafeInteger(child.pid) && child.pid > 0) {
    try { signalProcess(-child.pid, signal); return; } catch { /* fall back to direct child */ }
  }
  child.kill(signal);
}

function waitForProcess(child, input, timeoutMs, stop) {
  return new Promise((resolve, reject) => {
    let stdout = ""; let stderrBytes = 0; let settled = false; let terminalError = null;
    const failAfterExit = (code) => { if (!terminalError) terminalError = new Error(code); stop(); };
    const timer = setTimeout(() => failAfterExit("CODEX_EXEC_TIMEOUT"), timeoutMs);
    const finish = (value, ok = false) => {
      if (settled) return; settled = true; clearTimeout(timer); ok ? resolve(value) : reject(value);
    };
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout) > 8 * 1024 * 1024) failAfterExit("CODEX_EXEC_OUTPUT_TOO_LARGE");
    });
    child.stderr?.on("data", (chunk) => {
      stderrBytes += Buffer.byteLength(chunk);
      if (stderrBytes > MAX_STDERR) failAfterExit("CODEX_EXEC_STDERR_TOO_LARGE");
    });
    child.once("error", () => finish(new Error("CODEX_EXEC_UNAVAILABLE")));
    child.once("exit", (code, signal) => {
      if (terminalError) return finish(terminalError);
      if (code === 0) finish({ stdout }, true);
      else finish(new Error(signal ? "CODEX_EXEC_INTERRUPTED" : "CODEX_EXEC_FAILED"));
    });
    child.stdin?.end(input);
  });
}

function probeProcess(child, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let settled = false; const finish = (healthy) => { if (settled) return; settled = true; clearTimeout(timer); resolve(healthy); };
    const timer = setTimeout(() => { child.kill("SIGTERM"); finish(false); }, timeoutMs);
    child.once("error", () => finish(false)); child.once("exit", (code) => finish(code === 0));
    child.stdout?.resume(); child.stderr?.resume(); child.stdin?.end();
  });
}

export function createCodexExecDriver(options) {
  const binary = absolute(options?.binary, "CODEX_BINARY_INVALID");
  const workspaceRoot = absolute(options?.workspaceRoot, "CODEX_WORKSPACE_INVALID");
  const stateDirectory = absolute(options?.stateDirectory, "CODEX_STATE_DIRECTORY_INVALID");
  const model = options?.model === undefined ? undefined : required(options.model, "CODEX_MODEL_INVALID", 128);
  const timeoutSeconds = options?.timeoutSeconds ?? 900;
  if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 30 || timeoutSeconds > 3600) throw new Error("CODEX_TIMEOUT_INVALID");
  const terminationGraceSeconds = options?.terminationGraceSeconds ?? 5;
  if (!Number.isSafeInteger(terminationGraceSeconds) || terminationGraceSeconds < 1 || terminationGraceSeconds > 30) {
    throw new Error("CODEX_TERMINATION_GRACE_INVALID");
  }
  const spawn = options?.spawn ?? nodeSpawn;
  const secretRedemption = options?.secretRedemption ?? null;
  const platform = options?.platform ?? process.platform;
  const signalProcess = options?.signalProcess ?? process.kill;
  const now = options?.now ?? (() => new Date().toISOString());
  const active = new Map();
  let healthCache = { checkedAt: 0, value: "UNAVAILABLE" };

  async function persist(workId, state) {
    await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
    const target = stateFile(stateDirectory, workId); const temporary = `${target}.tmp-${randomUUID()}`;
    await writeFile(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 }); await rename(temporary, target);
  }
  async function load(workId) {
    try { const value = JSON.parse(await readFile(stateFile(stateDirectory, workId), "utf8"));
      if (value?.schemaVersion !== 1 || value.workId !== workId || !value.submission) throw new Error(); return value;
    } catch { throw new Error("CODEX_EXECUTION_STATE_UNAVAILABLE"); }
  }
  async function recordFailure(workId, state, context, code) {
    const current = await load(workId);
    if (current.status !== "WORKING" || current.sequence !== state.sequence) return;
    current.status = "FAILED"; current.sequence += 1; await persist(workId, current);
    await context.recordObservation(workId, { workId, sequence: current.sequence, status: "FAILED",
      summary: code, evidenceRefs: [], recordedAt: now() });
  }
  async function run(workId, state, context, approvalId) {
    let redeemed;
    try { redeemed = await redeemedModelEnvironment(state.submission, secretRedemption, now); }
    catch (error) {
      const code = error instanceof Error && /^CODEX_[A-Z0-9_]+$/.test(error.message)
        ? error.message : "CODEX_SECRET_REDEMPTION_FAILED";
      await recordFailure(workId, state, context, code); return;
    }
    const args = ["--ask-for-approval", "never", "exec", "--json", "--ephemeral", "--ignore-user-config",
      "--skip-git-repo-check", "--sandbox", "read-only", "--output-schema", RESULT_SCHEMA, "--cd", workspaceRoot];
    const effectiveModel = model ?? redeemed.modelReference;
    if (effectiveModel) args.push("--model", effectiveModel); args.push("-");
    const child = spawn(binary, args, { cwd: workspaceRoot, env: { ...codexEnvironment(), ...redeemed.environment },
      detached: platform !== "win32", shell: false, stdio: ["pipe", "pipe", "pipe"] });
    let forceKillTimer = null;
    const stop = () => {
      signalCodexProcess(child, "SIGTERM", { platform, signalProcess });
      if (!forceKillTimer) forceKillTimer = setTimeout(() => {
        forceKillTimer = null;
        if (active.get(workId)?.child === child) signalCodexProcess(child, "SIGKILL", { platform, signalProcess });
      }, terminationGraceSeconds * 1000);
    };
    active.set(workId, { child, stop });
    try {
      const { stdout } = await waitForProcess(child, promptFor(state.submission, approvalId), timeoutSeconds * 1000, stop);
      const current = await load(workId);
      if (current.status !== "WORKING" || current.sequence !== state.sequence) return;
      const parsed = parseCodexExecJsonl(stdout);
      const artifact = artifactFile(stateDirectory, workId);
      const encoded = `${JSON.stringify(parsed.result)}\n`; await writeFile(artifact, encoded, { mode: 0o600 });
      const reference = portableReference("codex-result", workId); current.status = "COMPLETED"; current.sequence += 1;
      current.resultDigest = digest(encoded); await persist(workId, current);
      const recordedAt = now();
      await context.recordObservation(workId, { workId, sequence: current.sequence, status: "COMPLETED",
        summary: parsed.result.summary, evidenceRefs: [reference], evidenceOutputs: [{ evidenceReference: reference,
          contentDigest: current.resultDigest }], resultReference: reference, runtimeTrace: runtimeTraceFor(current, recordedAt),
        recordedAt,
        usageOutputs: [{ usageReference: portableReference("codex-usage", workId), biller: "openai", billingType: "unknown",
          costStatus: "unpriced", inputTokens: parsed.usage.inputTokens, cachedInputTokens: parsed.usage.cachedInputTokens,
          outputTokens: parsed.usage.outputTokens, costCents: 0, occurredAt: recordedAt }] });
    } catch (error) {
      const code = error instanceof Error && /^CODEX_[A-Z0-9_]+$/.test(error.message) ? error.message : "CODEX_EXEC_FAILED";
      await recordFailure(workId, state, context, code);
    } finally {
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (active.get(workId)?.child === child) active.delete(workId);
    }
  }

  return {
    async health() {
      if (Date.now() - healthCache.checkedAt < 30_000) return healthCache.value;
      const child = spawn(binary, ["login", "status"], { cwd: workspaceRoot, env: codexEnvironment(),
        stdio: ["ignore", "pipe", "pipe"] });
      healthCache = { checkedAt: Date.now(), value: await probeProcess(child) ? "HEALTHY" : "UNAVAILABLE" };
      return healthCache.value;
    },
    async submit(submission, context) {
      const workId = submission?.workId; promptFor(submission);
      const state = { schemaVersion: 1, workId, status: "WORKING", sequence: 1, generationStartedAt: now(), submission };
      await persist(workId, state);
      await context.recordObservation(workId, { workId, sequence: 1, status: "WORKING",
        summary: "Codex accepted bounded read-only work", evidenceRefs: [], recordedAt: now() });
      void run(workId, state, context);
    },
    async command(command, context) {
      const state = await load(command?.workId); const running = active.get(command.workId);
      if (command.operation === "CANCEL") {
        state.status = "CANCELLED"; state.sequence += 1; await persist(command.workId, state); running?.stop();
        await context.recordObservation(command.workId, { workId: command.workId, sequence: state.sequence,
          status: "CANCELLED", summary: "Codex execution cancelled by accountable human", evidenceRefs: [], recordedAt: now() });
        return;
      }
      if (command.operation === "PAUSE") {
        state.status = "PAUSED"; state.sequence += 1; await persist(command.workId, state); running?.stop();
        await context.recordObservation(command.workId, { workId: command.workId, sequence: state.sequence,
          status: "AWAITING_APPROVAL", summary: "Codex execution paused for exact human approval", evidenceRefs: [], recordedAt: now() });
        return;
      }
      if (command.operation === "RESUME" && state.status === "PAUSED" && ID.test(command.approvalId)) {
        state.status = "WORKING"; state.sequence += 1; state.generationStartedAt = now(); await persist(command.workId, state);
        await context.recordObservation(command.workId, { workId: command.workId, sequence: state.sequence,
          status: "WORKING", summary: "Codex execution resumed after exact human approval", evidenceRefs: [], recordedAt: now() });
        void run(command.workId, state, context, command.approvalId); return;
      }
      throw new Error("CODEX_COMMAND_INVALID");
    },
    async shutdown() {
      for (const running of active.values()) running.stop();
    },
  };
}
