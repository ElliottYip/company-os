import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readSecretFileEnvironment } from "../adapters/config/secret-file-environment.ts";
import { createAgentExecutionPort } from "../connectors/http-agent-node/index.mjs";
import { createDataConnectorPort } from "../connectors/http-data-node/index.mjs";
import { createSecretBrokerRuntimePort } from "../brokers/http-secret-broker/index.mjs";

test("deployment secrets can be injected through an absolute file without exposing the value in configuration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-secret-"));
  const file = join(directory, "database-url");
  await writeFile(file, "postgres://runtime:opaque@database/company_os\n", { mode: 0o600 });
  const environment = { COMPANY_OS_DATABASE_URL_FILE: file };
  assert.equal(await readSecretFileEnvironment("COMPANY_OS_DATABASE_URL", environment),
    "postgres://runtime:opaque@database/company_os");
  assert.doesNotMatch(JSON.stringify(environment), /runtime:opaque/);
});

test("deployment secret sources fail closed when ambiguous, relative, empty, or oversized", async () => {
  await assert.rejects(readSecretFileEnvironment("KEY", { KEY: "inline", KEY_FILE: "/run/key" }),
    /KEY_SOURCE_AMBIGUOUS/);
  await assert.rejects(readSecretFileEnvironment("KEY", { KEY_FILE: "relative/key" }),
    /KEY_FILE_PATH_INVALID/);
  const directory = await mkdtemp(join(tmpdir(), "company-os-secret-invalid-"));
  const empty = join(directory, "empty");
  const oversized = join(directory, "oversized");
  await writeFile(empty, "");
  await writeFile(oversized, "x".repeat(16 * 1024 + 1));
  await assert.rejects(readSecretFileEnvironment("KEY", { KEY_FILE: empty }), /KEY_FILE_INVALID/);
  await assert.rejects(readSecretFileEnvironment("KEY", { KEY_FILE: oversized }), /KEY_FILE_INVALID/);
});

test("installed Agent, Data and Secret Broker packages consume bearer tokens by file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-edge-secret-"));
  const tokenFile = join(directory, "bearer");
  await writeFile(tokenFile, "opaque-staging-bearer", { mode: 0o600 });
  const agent = createAgentExecutionPort(undefined, {
    COMPANY_OS_HTTP_AGENT_NODE_BASE_URL: "https://agent.example.test",
    COMPANY_OS_HTTP_AGENT_NODE_BEARER_TOKEN_FILE: tokenFile,
  });
  const data = createDataConnectorPort(undefined, {
    COMPANY_OS_HTTP_DATA_NODE_BASE_URL: "https://data.example.test",
    COMPANY_OS_HTTP_DATA_NODE_SOURCES: "acceptance-fixtures",
    COMPANY_OS_HTTP_DATA_NODE_BEARER_TOKEN_FILE: tokenFile,
  });
  const broker = createSecretBrokerRuntimePort(undefined, {
    COMPANY_OS_HTTP_SECRET_BROKER_BASE_URL: "https://vault-broker.example.test",
    COMPANY_OS_HTTP_SECRET_BROKER_BEARER_TOKEN_FILE: tokenFile,
  });
  assert.equal((await agent.capabilities()).connectorId, "http-agent-node");
  assert.deepEqual((await data.capabilities()).dataSourceIds, ["acceptance-fixtures"]);
  assert.equal((await broker.capabilities()).brokerId, "http-secret-broker");
});
