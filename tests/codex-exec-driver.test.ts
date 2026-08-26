import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";
import { createCodexExecDriver, createSecretLeaseRedemptionClient,
  parseCodexExecJsonl, signalCodexProcess } from "../connectors/codex-exec-driver/index.mjs";
import { createCodexAgentNodeService } from "../connectors/codex-exec-driver/service-entry.mjs";
import { createVaultLeaseBroker, createVaultSecretBrokerHttpService } from
  "../brokers/vault-secret-broker/index.mjs";
import { once } from "node:events";

const FIXTURE_MATERIAL = ["synthetic", "provider", "material"].join("-");

function fakeCodex(output: string, calls: Array<{ args: string[]; input: string; env: Record<string, string> }>) {
  return (_binary: string, args: string[], options: { env: Record<string, string> }) => {
    const child = new EventEmitter() as EventEmitter & {
      stdin: Writable; stdout: PassThrough; stderr: PassThrough; kill(signal: string): void;
    };
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    let input = "";
    child.stdin = new Writable({ write(chunk, _encoding, callback) { input += chunk.toString(); callback(); },
      final(callback) {
        calls.push({ args, input, env: options.env });
        queueMicrotask(() => { child.stdout.end(output); child.emit("exit", 0, null); }); callback();
      } });
    child.kill = (signal) => { queueMicrotask(() => child.emit("exit", null, signal)); };
    return child;
  };
}

async function observationsUntil(values: unknown[], count: number) {
  for (let index = 0; index < 100 && values.length < count; index += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(values.length, count);
}

test("Codex JSONL admits one schema-bound final result and bounded usage", () => {
  const source = [
    JSON.stringify({ type: "thread.started", thread_id: "private-session" }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify({
      schemaVersion: 1, outcome: "PASS", summary: "Acceptance completed", evidenceSummary: "Read-only checks passed",
    }) } }),
    JSON.stringify({ type: "turn.completed", usage: { input_tokens: 120, cached_input_tokens: 20, output_tokens: 30 } }),
  ].join("\n");
  assert.deepEqual(parseCodexExecJsonl(source).usage, { inputTokens: 120, cachedInputTokens: 20, outputTokens: 30 });
  assert.throws(() => parseCodexExecJsonl(`${source}\nnot-json`), /CODEX_JSONL_INVALID/);
  assert.throws(() => parseCodexExecJsonl(`${source}\n${JSON.stringify({ type: "turn.failed" })}`),
    /CODEX_EXEC_REPORTED_FAILURE/);
});

test("Codex termination signals the detached process group and safely falls back to the child", () => {
  const directSignals: string[] = []; const groupSignals: Array<[number, string]> = [];
  const child = { pid: 4242, kill(signal: string) { directSignals.push(signal); } };
  signalCodexProcess(child, "SIGTERM", {
    platform: "linux", signalProcess(pid: number, signal: string) { groupSignals.push([pid, signal]); },
  });
  assert.deepEqual(groupSignals, [[-4242, "SIGTERM"]]); assert.deepEqual(directSignals, []);
  signalCodexProcess(child, "SIGKILL", {
    platform: "linux", signalProcess() { throw new Error("process group unavailable"); },
  });
  assert.deepEqual(directSignals, ["SIGKILL"]);
});

test("Secret redemption client sends exact binding over authenticated bounded HTTP", async () => {
  const calls: Array<{ url: string; options: any }> = [];
  const client = createSecretLeaseRedemptionClient({ baseUrl: "http://127.0.0.1:4321",
    bearerToken: "synthetic-execution-token", allowInsecureLoopback: true, requestTimeoutMs: 2_000,
    fetch: async (url: string, options: any) => { calls.push({ url, options }); return new Response(JSON.stringify({ material: {
      environmentVariable: "OPENAI_API_KEY", value: FIXTURE_MATERIAL,
      expiresAt: "2026-08-26T12:05:00.000Z",
    } }), { status: 200, headers: { "content-type": "application/json" } }); } });
  assert.deepEqual(await client.redeem({ leaseId: "lease-one", companyId: "company-one",
    consumerId: "model-provider-one", workAttemptId: "attempt-one" }), {
    environmentVariable: "OPENAI_API_KEY", value: FIXTURE_MATERIAL,
    expiresAt: "2026-08-26T12:05:00.000Z",
  });
  assert.equal(calls[0].url, "http://127.0.0.1:4321/v1/redemptions");
  assert.equal(calls[0].options.headers.authorization, "Bearer synthetic-execution-token");
  assert.deepEqual(JSON.parse(calls[0].options.body), { schemaVersion: 1, leaseId: "lease-one",
    companyId: "company-one", consumerId: "model-provider-one", workAttemptId: "attempt-one" });
});

test("Codex driver executes through stdin in a read-only sandbox and publishes references instead of session data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-codex-driver-"));
  const calls: Array<{ args: string[]; input: string; env: Record<string, string> }> = [];
  const output = JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify({
    schemaVersion: 1, outcome: "PASS", summary: "Bounded acceptance passed", evidenceSummary: "No external side effect",
  }) } });
  const driver = createCodexExecDriver({ binary: "/usr/local/bin/codex", workspaceRoot: directory,
    stateDirectory: join(directory, "state"), model: "gpt-5.6-terra", spawn: fakeCodex(output, calls),
    now: () => "2026-08-26T12:00:00.000Z" });
  const observations: any[] = [];
  await driver.submit({ workId: "work-one", deployment: { id: "deployment-one" }, runtimeProof: { digest: `sha256:${"a".repeat(64)}` },
    request: { id: "work-one", companyId: "company-one", agentId: "agent-one", goal: "Verify the acceptance boundary",
      input: { actionReferences: ["inspect"] } } }, { async recordObservation(_workId: string, value: unknown) { observations.push(value); } });
  await observationsUntil(observations, 2);
  assert.equal(observations[0].status, "WORKING"); assert.equal(observations[1].status, "COMPLETED");
  assert.match(observations[1].evidenceOutputs[0].contentDigest, /^sha256:[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(observations), /private-session|Verify the acceptance boundary/);
  assert.deepEqual(calls[0].args.slice(0, 8), ["--ask-for-approval", "never", "exec", "--json", "--ephemeral",
    "--ignore-user-config", "--skip-git-repo-check", "--sandbox"]);
  assert.equal(calls[0].args[calls[0].args.indexOf("--sandbox") + 1], "read-only");
  assert.equal(calls[0].args.at(-1), "-");
  assert.match(calls[0].input, /Verify the acceptance boundary/);
  assert.ok(!calls[0].args.includes(calls[0].input));
  assert.equal(calls[0].env.COMPANY_OS_HTTP_AGENT_NODE_BEARER_TOKEN, undefined);
  const state = await readFile(join(directory, "state", "work-one.json"), "utf8");
  assert.doesNotMatch(state, /private-session/);
});

test("Codex driver redeems an exact model grant into child-only environment without persisting material", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-codex-redemption-"));
  const calls: Array<{ args: string[]; input: string; env: Record<string, string> }> = []; const redemptions: unknown[] = [];
  const output = JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify({
    schemaVersion: 1, outcome: "PASS", summary: "Provider call passed", evidenceSummary: "Bounded evidence",
  }) } });
  const driver = createCodexExecDriver({ binary: "/usr/local/bin/codex", workspaceRoot: directory,
    stateDirectory: join(directory, "state"), spawn: fakeCodex(output, calls),
    secretRedemption: { async redeem(input: unknown) { redemptions.push(input); return {
      environmentVariable: "OPENAI_API_KEY", value: FIXTURE_MATERIAL,
      expiresAt: "2026-08-26T12:05:00.000Z",
    }; } }, now: () => "2026-08-26T12:00:00.000Z" });
  const observations: unknown[] = [];
  await driver.submit({ workId: "work-one", deployment: { id: "deployment-one" },
    runtimeProof: { digest: `sha256:${"a".repeat(64)}` }, request: {
      id: "work-one", companyId: "company-one", agentId: "agent-one", goal: "Run one provider check",
      idempotencyKey: "attempt-one", input: { actionReferences: [], executionGrantReferences: ["lease-one"],
        modelBinding: { policyId: "policy-one", routeId: "route-one", providerAdapterId: "model-provider-one",
          modelReference: "model-one", classification: "INTERNAL", residency: "LOCAL",
          executionGrantReference: "lease-one" } },
    } }, { async recordObservation(_workId: string, value: unknown) { observations.push(value); } });
  await observationsUntil(observations, 2);
  assert.deepEqual(redemptions, [{ leaseId: "lease-one", companyId: "company-one",
    consumerId: "model-provider-one", workAttemptId: "attempt-one" }]);
  assert.equal(calls[0].env.OPENAI_API_KEY, FIXTURE_MATERIAL);
  assert.doesNotMatch(await readFile(join(directory, "state", "work-one.json"), "utf8"), /synthetic-provider-material/);
});

test("Codex driver redeems a Vault-backed lease through the execution-only HTTP boundary", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-codex-vault-chain-"));
  const broker = createVaultLeaseBroker({ stateFile: join(directory, "broker-state.json"), now: () =>
    "2026-08-26T12:00:00.000Z", references: [{ id: "secret-model-one", companyId: "company-one",
      purpose: "MODEL_PROVIDER", providerAdapterId: "model-provider-one", currentVersion: 4, status: "ACTIVE",
      vault: { mount: "company-os", path: "staging/company-one/model-provider-one", version: 4,
        field: "api_key", environmentVariable: "OPENAI_API_KEY" } }], vaultClient: {
      async health() { return true; }, async readKvVersion() {
        return { version: 4, data: { api_key: FIXTURE_MATERIAL } };
      },
    } });
  const issued = await broker.issueLease({ companyId: "company-one", secretReferenceId: "secret-model-one",
    expectedVersion: 4, consumerId: "model-provider-one", workAttemptId: "attempt-one",
    reasonCode: "MODEL_INFERENCE", expiresAt: "2026-08-26T12:05:00.000Z" }, "authorization-one");
  assert.equal(issued.ok, true);
  const service = createVaultSecretBrokerHttpService({ broker, controlBearerToken: "synthetic-control-token",
    executionBearerToken: "synthetic-execution-token" });
  service.listen(0, "127.0.0.1"); await once(service, "listening");
  const address = service.address(); assert.ok(address && typeof address !== "string");
  const redemption = createSecretLeaseRedemptionClient({ baseUrl: `http://127.0.0.1:${address.port}`,
    bearerToken: "synthetic-execution-token", allowInsecureLoopback: true, requestTimeoutMs: 2_000 });
  const calls: Array<{ args: string[]; input: string; env: Record<string, string> }> = [];
  const output = JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify({
    schemaVersion: 1, outcome: "PASS", summary: "Provider call passed", evidenceSummary: "Bounded evidence",
  }) } });
  const driver = createCodexExecDriver({ binary: "/usr/local/bin/codex", workspaceRoot: directory,
    stateDirectory: join(directory, "driver-state"), spawn: fakeCodex(output, calls), secretRedemption: redemption,
    now: () => "2026-08-26T12:00:00.000Z" });
  const observations: unknown[] = [];
  try {
    await driver.submit({ workId: "work-one", deployment: { id: "deployment-one" },
      runtimeProof: { digest: `sha256:${"a".repeat(64)}` }, request: { id: "work-one", companyId: "company-one",
        agentId: "agent-one", goal: "Run one provider check", idempotencyKey: "attempt-one", input: {
          actionReferences: [], executionGrantReferences: [issued.value.id], modelBinding: { policyId: "policy-one",
            routeId: "route-one", providerAdapterId: "model-provider-one", modelReference: "model-one",
            classification: "INTERNAL", residency: "LOCAL", executionGrantReference: issued.value.id },
        } } }, { async recordObservation(_workId: string, value: unknown) { observations.push(value); } });
    await observationsUntil(observations, 2);
    assert.equal(calls[0].env.OPENAI_API_KEY, FIXTURE_MATERIAL);
    assert.doesNotMatch(await readFile(join(directory, "driver-state", "work-one.json"), "utf8"),
      /synthetic-provider-material|api_key|OPENAI_API_KEY/);
    assert.doesNotMatch(await readFile(join(directory, "broker-state.json"), "utf8"),
      /synthetic-provider-material|api_key|OPENAI_API_KEY|staging\/company-one/);
  } finally { service.close(); await once(service, "close"); }
});

test("Codex Agent Node service requires file-injected authentication and absolute execution boundaries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-codex-service-"));
  const token = join(directory, "token"); await writeFile(token, "opaque-node-bearer-token", { mode: 0o600 });
  const redemptionToken = join(directory, "redemption-token");
  await writeFile(redemptionToken, "opaque-redemption-bearer-token", { mode: 0o600 });
  const service = createCodexAgentNodeService({
    COMPANY_OS_CODEX_BINARY: "/usr/local/bin/codex",
    COMPANY_OS_CODEX_WORKSPACE: directory,
    COMPANY_OS_CODEX_STATE_DIRECTORY: join(directory, "state"),
    COMPANY_OS_CODEX_NODE_BEARER_TOKEN_FILE: token,
  });
  assert.equal(service.listening, false);
  assert.equal(typeof (service as any).shutdownAgentDriver, "function");
  assert.doesNotThrow(() => createCodexAgentNodeService({
    COMPANY_OS_CODEX_BINARY: "/usr/local/bin/codex", COMPANY_OS_CODEX_WORKSPACE: directory,
    COMPANY_OS_CODEX_STATE_DIRECTORY: join(directory, "state-with-redemption"),
    COMPANY_OS_CODEX_NODE_BEARER_TOKEN_FILE: token,
    COMPANY_OS_CODEX_SECRET_BROKER_BASE_URL: "http://127.0.0.1:4321",
    COMPANY_OS_CODEX_SECRET_BROKER_ALLOW_INSECURE_LOOPBACK: "true",
    COMPANY_OS_CODEX_SECRET_BROKER_REDEMPTION_BEARER_TOKEN_FILE: redemptionToken,
  }));
  assert.throws(() => createCodexAgentNodeService({
    COMPANY_OS_CODEX_BINARY: "/usr/local/bin/codex", COMPANY_OS_CODEX_WORKSPACE: directory,
    COMPANY_OS_CODEX_STATE_DIRECTORY: join(directory, "state-ambiguous"),
    COMPANY_OS_CODEX_NODE_BEARER_TOKEN_FILE: token,
    COMPANY_OS_CODEX_SECRET_BROKER_REDEMPTION_BEARER_TOKEN_FILE: redemptionToken,
  }), /COMPANY_OS_CODEX_SECRET_BROKER_BASE_URL_REQUIRED/);
  assert.throws(() => createCodexAgentNodeService({
    COMPANY_OS_CODEX_BINARY: "codex", COMPANY_OS_CODEX_WORKSPACE: directory,
    COMPANY_OS_CODEX_STATE_DIRECTORY: join(directory, "state"), COMPANY_OS_CODEX_NODE_BEARER_TOKEN_FILE: token,
  }), /CODEX_BINARY_INVALID/);
  assert.throws(() => createCodexAgentNodeService({
    COMPANY_OS_CODEX_BINARY: "/usr/local/bin/codex", COMPANY_OS_CODEX_WORKSPACE: directory,
    COMPANY_OS_CODEX_STATE_DIRECTORY: "relative", COMPANY_OS_CODEX_NODE_BEARER_TOKEN_FILE: token,
  }), /STATE_DIRECTORY_INVALID/);
});
