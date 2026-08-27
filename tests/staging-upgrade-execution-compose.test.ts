import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("candidate execution Compose isolates Broker, Agent, Data and TLS without host ingress", async () => {
  const [compose, caddy] = await Promise.all([
    read("deploy/compose.staging-upgrade-candidate.yml"),
    read("deploy/staging-upgrade-candidate.Caddyfile"),
  ]);
  for (const service of ["vault-secret-broker", "codex-agent-node", "reference-data-node", "tls-gateway"]) {
    assert.match(compose, new RegExp(`^  ${service}:`, "m"));
  }
  assert.doesNotMatch(compose, /^\s+ports:/m);
  assert.match(compose, /COMPANY_OS_PRODUCT_NETWORK:[^\n]*candidate product network/);
  assert.match(compose, /external: true/);
  assert.match(compose, /COMPANY_OS_SECRET_DIRECTORY:[^\n]*candidate Secret projection/);
  assert.match(compose, /COMPANY_OS_CANDIDATE_VAULT_ADDRESS/);
  assert.match(compose, /COMPANY_OS_VAULT_SECRET_BROKER_IMAGE/);
  assert.match(compose, /COMPANY_OS_CODEX_AGENT_NODE_IMAGE/);
  assert.match(compose, /COMPANY_OS_REFERENCE_DATA_NODE_IMAGE/);
  assert.equal((compose.match(/no-new-privileges:true/g) ?? []).length, 4);
  assert.equal((compose.match(/cap_drop: \[ALL\]/g) ?? []).length, 4);
  assert.match(caddy, /reverse_proxy vault-secret-broker:4321/);
  assert.match(caddy, /reverse_proxy codex-agent-node:4320/);
  assert.match(caddy, /reverse_proxy reference-data-node:4321/);
  assert.doesNotMatch(`${compose}\n${caddy}`,
    /client.?secret=|bearer.?token=|database.?url=|password=/i);
});

test("candidate execution assets are immutable release-bundle inputs", async () => {
  const bundler = await read("scripts/create-staging-release-bundle.mjs");
  assert.match(bundler, /deploy\/compose\.staging-upgrade-candidate\.yml/);
  assert.match(bundler, /deploy\/staging-upgrade-candidate\.Caddyfile/);
});

test("candidate execution Compose accepts a complete Secret-free candidate environment", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "company-os-candidate-execution-compose-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const image = (name: string, value: string) => `ghcr.io/example/${name}@sha256:${value.repeat(64)}`;
  const environment = [
    "COMPANY_OS_CANDIDATE_EXECUTION_COMPOSE_PROJECT=company-os-candidate-execution",
    "COMPANY_OS_PRODUCT_NETWORK=company-os-candidate-product",
    `COMPANY_OS_VAULT_SECRET_BROKER_IMAGE=${image("broker", "1")}`,
    `COMPANY_OS_CODEX_AGENT_NODE_IMAGE=${image("agent", "2")}`,
    `COMPANY_OS_REFERENCE_DATA_NODE_IMAGE=${image("data", "3")}`,
    "COMPANY_OS_CANDIDATE_VAULT_ADDRESS=https://vault.internal",
    "COMPANY_OS_SECRET_DIRECTORY=/etc/company-os/candidate-secrets",
    "COMPANY_OS_CANDIDATE_PUBLIC_CONFIG_DIRECTORY=/srv/company-os/candidate-public",
    "COMPANY_OS_CANDIDATE_BROKER_HOST=broker-candidate",
    "COMPANY_OS_CANDIDATE_AGENT_HOST=agent-candidate",
    "COMPANY_OS_CANDIDATE_DATA_HOST=data-candidate",
    "COMPANY_OS_CANDIDATE_BROKER_VOLUME=company-os-candidate-broker",
    "COMPANY_OS_CANDIDATE_AGENT_STATE_VOLUME=company-os-candidate-agent-state",
    "COMPANY_OS_CANDIDATE_AGENT_WORK_VOLUME=company-os-candidate-agent-work",
    "COMPANY_OS_DATA_NODE_VOLUME=company-os-candidate-data",
    "",
  ].join("\n");
  const environmentFile = join(root, "candidate.env");
  await writeFile(environmentFile, environment, { mode: 0o600 });
  const result = spawnSync("docker", ["compose", "--env-file", environmentFile, "-f",
    new URL("../deploy/compose.staging-upgrade-candidate.yml", import.meta.url).pathname,
    "config", "--quiet"], { encoding: "utf8" });
  if (result.error && "code" in result.error && result.error.code === "ENOENT") {
    context.skip("Docker is unavailable"); return;
  }
  assert.equal(result.status, 0, result.stderr);
});
