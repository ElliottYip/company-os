import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { createReferenceAgentNode, JsonFileReferenceNodeStore } from "../http-agent-node-reference/index.mjs";
import { createCodexExecDriver, createSecretLeaseRedemptionClient } from "./index.mjs";

function required(environment, name, maximum = 4096) {
  const value = environment[name]?.trim();
  if (!value || value.length > maximum || value.includes("\0")) throw new Error(`${name}_REQUIRED`);
  return value;
}
function secret(environment, name) {
  const inline = environment[name]?.trim(); const path = environment[`${name}_FILE`]?.trim();
  if (inline && path) throw new Error(`${name}_SOURCE_AMBIGUOUS`);
  if (inline) return inline;
  if (!path || !isAbsolute(path) || path.includes("\0")) throw new Error(`${name}_FILE_REQUIRED`);
  const metadata = statSync(path); if (!metadata.isFile() || metadata.size < 16 || metadata.size > 16_384) {
    throw new Error(`${name}_FILE_INVALID`);
  }
  const value = readFileSync(path, "utf8").trim(); if (value.length < 16) throw new Error(`${name}_FILE_INVALID`); return value;
}
function integer(environment, name, fallback, minimum, maximum) {
  const value = Number(environment[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${name}_INVALID`);
  return value;
}

export function createCodexAgentNodeService(environment = process.env) {
  const stateDirectory = required(environment, "COMPANY_OS_CODEX_STATE_DIRECTORY");
  if (!isAbsolute(stateDirectory)) throw new Error("COMPANY_OS_CODEX_STATE_DIRECTORY_INVALID");
  const redemptionBaseUrl = environment.COMPANY_OS_CODEX_SECRET_BROKER_BASE_URL?.trim();
  const redemptionConfigured = Boolean(redemptionBaseUrl ||
    environment.COMPANY_OS_CODEX_SECRET_BROKER_REDEMPTION_BEARER_TOKEN?.trim() ||
    environment.COMPANY_OS_CODEX_SECRET_BROKER_REDEMPTION_BEARER_TOKEN_FILE?.trim());
  if (redemptionConfigured && !redemptionBaseUrl) {
    throw new Error("COMPANY_OS_CODEX_SECRET_BROKER_BASE_URL_REQUIRED");
  }
  const secretRedemption = redemptionConfigured ? createSecretLeaseRedemptionClient({
    baseUrl: redemptionBaseUrl,
    bearerToken: secret(environment, "COMPANY_OS_CODEX_SECRET_BROKER_REDEMPTION_BEARER_TOKEN"),
    allowInsecureLoopback: environment.COMPANY_OS_CODEX_SECRET_BROKER_ALLOW_INSECURE_LOOPBACK === "true",
    requestTimeoutMs: integer(environment, "COMPANY_OS_CODEX_SECRET_BROKER_TIMEOUT_MS", 10_000, 250, 60_000),
  }) : null;
  const driver = createCodexExecDriver({
    binary: required(environment, "COMPANY_OS_CODEX_BINARY"),
    workspaceRoot: required(environment, "COMPANY_OS_CODEX_WORKSPACE"),
    stateDirectory,
    model: environment.COMPANY_OS_CODEX_MODEL?.trim() || undefined,
    timeoutSeconds: integer(environment, "COMPANY_OS_CODEX_TIMEOUT_SECONDS", 900, 30, 3600),
    terminationGraceSeconds: integer(environment, "COMPANY_OS_CODEX_TERMINATION_GRACE_SECONDS", 5, 1, 30),
    secretRedemption,
  });
  const service = createReferenceAgentNode({
    bearerToken: secret(environment, "COMPANY_OS_CODEX_NODE_BEARER_TOKEN"),
    store: new JsonFileReferenceNodeStore(`${stateDirectory}/protocol-state.json`),
    driver,
    maximumRequestBytes: integer(environment, "COMPANY_OS_CODEX_MAXIMUM_REQUEST_BYTES", 262_144, 16_384, 1_048_576),
  });
  service.shutdownAgentDriver = () => driver.shutdown();
  return service;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const host = process.env.COMPANY_OS_CODEX_NODE_HOST?.trim() || "127.0.0.1";
  const port = integer(process.env, "COMPANY_OS_CODEX_NODE_PORT", 4320, 1, 65_535);
  const server = createCodexAgentNodeService();
  server.listen(port, host, () => process.stdout.write(`${JSON.stringify({
    schemaVersion: 1, event: "company_os.codex_agent_node_started",
  })}\n`));
  const shutdown = async () => {
    await server.shutdownAgentDriver();
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown);
}
