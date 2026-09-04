import { execFile as execFileCallback } from "node:child_process";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";
import { createAgentExecutionPort } from "../connectors/http-agent-node/index.mjs";
import { parseFormalConnectorPackages } from "../adapters/connectors/load-formal-connectors.ts";

const execFile = promisify(execFileCallback);
const PRIVATE_MATERIAL = /(password|secret|token|cookie|credential|private reasoning|session id|thread id)/i;

function check(id, status, code, detail) {
  return Object.freeze({ id, status, code, detail });
}

function safeErrorCode(error, fallback) {
  const code = error instanceof Error ? error.message : "";
  return /^[A-Z][A-Z0-9_]{2,127}$/.test(code) && !PRIVATE_MATERIAL.test(code) ? code : fallback;
}

function codexBinary(environment) {
  const value = environment.COMPANY_OS_CODEX_BINARY?.trim() || "/usr/local/bin/codex";
  if (!isAbsolute(value) || value.includes("\0")) throw new Error("LOCAL_AGENT_CODEX_BINARY_INVALID");
  return value;
}

export async function runLocalAgentPreflight(options = {}) {
  const environment = options.environment ?? process.env;
  const runVersion = options.runVersion ?? (async (binary) => {
    const { stdout } = await execFile(binary, ["--version"], { timeout: 5_000 });
    return stdout.trim();
  });
  const createConnector = options.createConnector ?? (() => createAgentExecutionPort(undefined, environment));
  const checks = [];

  try {
    const packages = parseFormalConnectorPackages(environment.COMPANY_OS_CONNECTOR_PACKAGES);
    checks.push(packages.includes("@company-os/http-agent-node-connector")
      ? check("connector-package", "PASS", "HTTP_AGENT_CONNECTOR_CONFIGURED", "Neutral HTTP Agent Connector is enabled.")
      : check("connector-package", "BLOCKED", "HTTP_AGENT_CONNECTOR_NOT_CONFIGURED", "Enable the installed neutral HTTP Agent Connector package."));
  } catch (error) {
    checks.push(check("connector-package", "BLOCKED",
      safeErrorCode(error, "HTTP_AGENT_CONNECTOR_CONFIGURATION_INVALID"), "Connector package configuration is invalid."));
  }

  const tokenSource = environment.COMPANY_OS_HTTP_AGENT_NODE_BEARER_TOKEN_FILE?.trim()
    ? "FILE" : environment.COMPANY_OS_HTTP_AGENT_NODE_BEARER_TOKEN?.trim() ? "ENV" : "MISSING";
  checks.push(tokenSource === "MISSING"
    ? check("authentication-source", "BLOCKED", "HTTP_AGENT_AUTHENTICATION_NOT_CONFIGURED", "Inject Agent Node authentication through a deployment secret.")
    : check("authentication-source", "PASS", `HTTP_AGENT_AUTHENTICATION_${tokenSource}`, `Authentication is injected by ${tokenSource.toLowerCase()} source; its value was not inspected or printed.`));

  try {
    const version = await runVersion(codexBinary(environment));
    if (typeof version !== "string" || !/^codex-cli [0-9]+\.[0-9]+\.[0-9]+$/.test(version)) {
      throw new Error("LOCAL_AGENT_CODEX_VERSION_INVALID");
    }
    checks.push(check("codex-cli", "PASS", "LOCAL_AGENT_CODEX_AVAILABLE", version));
  } catch (error) {
    checks.push(check("codex-cli", "BLOCKED", safeErrorCode(error, "LOCAL_AGENT_CODEX_UNAVAILABLE"),
      "Codex CLI is unavailable or returned an unsupported version."));
  }

  let runtime = null;
  try {
    const connector = createConnector();
    const capabilities = await connector.capabilities();
    const health = await connector.health();
    runtime = {
      connectorId: capabilities.connectorId,
      displayName: capabilities.displayName,
      protocolVersion: capabilities.protocolVersion,
      health,
    };
    checks.push(health === "HEALTHY"
      ? check("agent-node", "PASS", "HTTP_AGENT_NODE_HEALTHY", "Agent Node accepted the authenticated health check.")
      : check("agent-node", "BLOCKED", "HTTP_AGENT_NODE_UNAVAILABLE", "Agent Node did not report healthy."));
  } catch (error) {
    checks.push(check("agent-node", "BLOCKED", safeErrorCode(error, "HTTP_AGENT_NODE_CONFIGURATION_INVALID"),
      "Agent Node configuration is missing or invalid."));
  }

  const status = checks.every(({ status: value }) => value === "PASS") ? "READY" : "BLOCKED";
  return Object.freeze({
    schemaVersion: 1,
    recordType: "COMPANY_OS_LOCAL_AGENT_PREFLIGHT",
    recordedAt: (options.now ?? (() => new Date().toISOString()))(),
    status,
    checks: Object.freeze(checks),
    runtime,
    nextCommand: status === "READY" ? "npm start" : "npm run agent:preflight",
    notClaimed: Object.freeze(["company registration", "customer staging acceptance", "production acceptance"]),
  });
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  try {
    const record = await runLocalAgentPreflight();
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    if (record.status !== "READY") process.exitCode = 2;
  } catch {
    process.stderr.write("LOCAL_AGENT_PREFLIGHT_FAILED\n");
    process.exitCode = 1;
  }
}
