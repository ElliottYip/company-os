import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { createCodexExecDriver } from "../connectors/codex-exec-driver/index.mjs";

const execFile = promisify(execFileCallback);
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const REFERENCE = /^[a-z0-9][a-z0-9-]{15,127}$/;
const PRIVATE_MATERIAL = /(password|secret|token|cookie|credential|private reasoning|session id|thread id)/i;

export function validateLocalCodexAdmissionOptions(options = {}) {
  const binary = options.binary ?? "/usr/local/bin/codex";
  const timeoutSeconds = options.timeoutSeconds ?? 300;
  const model = options.model ?? null;
  if (typeof binary !== "string" || !isAbsolute(binary) || binary.includes("\0")) {
    throw new Error("LOCAL_CODEX_BINARY_INVALID");
  }
  if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 30 || timeoutSeconds > 3_600) {
    throw new Error("LOCAL_CODEX_TIMEOUT_INVALID");
  }
  if (model !== null && (typeof model !== "string" || !/^[a-zA-Z0-9._-]{1,128}$/.test(model))) {
    throw new Error("LOCAL_CODEX_MODEL_INVALID");
  }
  return { binary, timeoutSeconds, model };
}

export function createLocalCodexAdmissionRecord({ recordedAt, codexVersion, observation }) {
  const usage = observation?.usageOutputs?.[0];
  const resultDigest = observation?.evidenceOutputs?.[0]?.contentDigest;
  if (observation?.status !== "COMPLETED" || typeof observation.summary !== "string" ||
      !observation.summary.trim() || observation.summary.length > 2_000 ||
      !REFERENCE.test(observation.resultReference) || !DIGEST.test(resultDigest) ||
      !usage || ![usage.inputTokens, usage.cachedInputTokens, usage.outputTokens]
        .every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error("LOCAL_CODEX_ADMISSION_INCOMPLETE");
  }
  if (PRIVATE_MATERIAL.test(observation.summary)) {
    throw new Error("LOCAL_CODEX_ADMISSION_PRIVATE_MATERIAL");
  }
  if (typeof recordedAt !== "string" || !Number.isFinite(Date.parse(recordedAt)) ||
      typeof codexVersion !== "string" || !/^codex-cli [0-9]+\.[0-9]+\.[0-9]+$/.test(codexVersion)) {
    throw new Error("LOCAL_CODEX_ADMISSION_METADATA_INVALID");
  }
  return {
    schemaVersion: 1,
    recordType: "COMPANY_OS_LOCAL_CODEX_ADMISSION",
    recordedAt,
    codexVersion,
    authentication: "LOCAL_CODEX_SESSION",
    sandbox: "read-only",
    approvalPolicy: "never",
    ephemeral: true,
    outcome: "PASS",
    summary: observation.summary.trim(),
    resultReference: observation.resultReference,
    resultDigest,
    usage: {
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      outputTokens: usage.outputTokens,
    },
    notClaimed: ["customer staging acceptance", "production acceptance", "side-effecting execution"],
  };
}

function parseArguments(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--binary") options.binary = values[++index];
    else if (value === "--model") options.model = values[++index];
    else if (value === "--timeout-seconds") options.timeoutSeconds = Number(values[++index]);
    else throw new Error("LOCAL_CODEX_ARGUMENT_INVALID");
  }
  return validateLocalCodexAdmissionOptions(options);
}

async function terminalObservation(driver, submission, timeoutSeconds) {
  let timer;
  const terminal = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error("LOCAL_CODEX_ADMISSION_TIMEOUT")),
      (timeoutSeconds + 10) * 1_000);
    void driver.submit(submission, {
      async recordObservation(_workId, observation) {
        if (["COMPLETED", "FAILED", "CANCELLED"].includes(observation?.status)) resolve(observation);
      },
    }).catch(reject);
  });
  try { return await terminal; } finally { clearTimeout(timer); }
}

export async function runLocalCodexAdmission(options = {}) {
  const admitted = validateLocalCodexAdmissionOptions(options);
  const workspace = await mkdtemp(join(tmpdir(), "company-os-local-codex-"));
  const driver = createCodexExecDriver({
    binary: admitted.binary,
    workspaceRoot: workspace,
    stateDirectory: join(workspace, "state"),
    model: admitted.model ?? undefined,
    timeoutSeconds: admitted.timeoutSeconds,
  });
  try {
    const [{ stdout: codexVersion }, health] = await Promise.all([
      execFile(admitted.binary, ["--version"], { timeout: 5_000 }),
      driver.health(),
    ]);
    if (health !== "HEALTHY") throw new Error("LOCAL_CODEX_NOT_AUTHENTICATED");
    const observation = await terminalObservation(driver, {
      workId: "local-codex-admission",
      deployment: { id: "local-read-only" },
      runtimeProof: { digest: `sha256:${"0".repeat(64)}` },
      request: {
        id: "local-codex-admission",
        companyId: "local-company",
        agentId: "local-codex-agent",
        goal: "Verify the Company OS Codex Agent Node read-only execution boundary using synthetic non-production input.",
        input: { actionReferences: ["verify-read-only-boundary"] },
      },
    }, admitted.timeoutSeconds);
    return createLocalCodexAdmissionRecord({
      recordedAt: new Date().toISOString(),
      codexVersion: codexVersion.trim(),
      observation,
    });
  } finally {
    await driver.shutdown();
    await rm(workspace, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  try {
    const record = await runLocalCodexAdmission(parseArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
  } catch (error) {
    const code = error instanceof Error && /^(LOCAL_CODEX|CODEX)_[A-Z0-9_]+$/.test(error.message)
      ? error.message : "LOCAL_CODEX_ADMISSION_FAILED";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}
