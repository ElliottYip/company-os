import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseDependencySecretMetadata, parseSiteRuntimeManifest,
  renderReferenceDependencyEnvironment } from "../adapters/config/site-runtime-contract.ts";
import { siteRuntimeFixture } from "./fixtures/site-runtime-fixture.ts";

test("reference dependencies are isolated, TLS-fronted, immutable and resource bounded", async () => {
  const [compose, caddy] = await Promise.all([
    readFile(new URL("../deploy/compose.staging-dependencies.yml", import.meta.url), "utf8"),
    readFile(new URL("../deploy/staging-dependencies.Caddyfile", import.meta.url), "utf8"),
  ]);
  for (const service of ["postgres", "oidc", "vault", "vault-secret-broker", "codex-agent-node",
    "tls-gateway"]) assert.match(compose, new RegExp(`^  ${service}:$`, "m"));
  assert.match(compose,
    /postgres:16\.15-bookworm@sha256:bb3e1a57e5407e0a5280b4211980a5e537f4abd234a87014ac979849a78dd825/);
  assert.match(compose,
    /caddy:2\.11\.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648/);
  for (const variable of ["COMPANY_OS_OIDC_IMAGE", "COMPANY_OS_VAULT_IMAGE",
    "COMPANY_OS_VAULT_SECRET_BROKER_IMAGE", "COMPANY_OS_CODEX_AGENT_NODE_IMAGE"]) {
    assert.match(compose, new RegExp(`\\$\\{${variable}:\\?`));
  }
  assert.match(compose, /name: \$\{COMPANY_OS_DEPENDENCY_COMPOSE_PROJECT:/);
  assert.match(compose, /name: \$\{COMPANY_OS_DEPENDENCY_NETWORK:/);
  assert.match(compose, /name: \$\{COMPANY_OS_PRODUCT_NETWORK:/);
  assert.match(compose, /external: true/);
  assert.doesNotMatch(compose,
    /COMPANY_OS_DEPENDENCY_SECRET_DIRECTORY:[^}]+\}:\/run\/dependency-secrets:ro/);
  for (const variable of ["POSTGRES", "VAULT", "BROKER", "AGENT", "TLS_GATEWAY"]) {
    assert.match(compose,
      new RegExp(`COMPANY_OS_${variable}_SECRET_PROJECTION_DIRECTORY:[^}]+\\}:/run/dependency-secrets:ro`));
  }
  assert.doesNotMatch(compose, /^\s+ports:/m);
  assert.doesNotMatch(compose, /start-dev|VAULT_DEV|POSTGRES_PASSWORD:\s|CLIENT_SECRET:\s|BEARER_TOKEN:\s/);
  assert.match(compose, /ssl=on/);
  assert.match(compose, /COMPANY_OS_OIDC_VOLUME:[^}]+\}/);
  assert.match(compose, /company_os_dependency_oidc:\/var\/dex/);
  assert.match(compose, /COMPANY_OS_VAULT_ADDRESS: https:\/\/\$\{COMPANY_OS_VAULT_TLS_HOST:[^}]+\}:8200/);
  assert.match(compose, /aliases: \["\$\{COMPANY_OS_VAULT_TLS_HOST:[^}]+\}"\]/);
  assert.match(caddy, /reverse_proxy oidc:5556/);
  assert.match(caddy, /reverse_proxy vault-secret-broker:4321/);
  assert.match(caddy, /reverse_proxy codex-agent-node:4320/);
  assert.match(caddy, /tls \/run\/dependency-secrets\/\{\$COMPANY_OS_INTERNAL_TLS_CERT_FILENAME\}/);
  const memoryMiB = [...compose.matchAll(/^\s+mem_limit: (\d+)m$/gm)]
    .reduce((total, match) => total + Number(match[1]), 0);
  assert.ok(memoryMiB <= 2_000, `dependency hard limit is ${memoryMiB} MiB`);
});

test("reference dependency Compose accepts the exact rendered site environment", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "company-os-dependency-compose-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const image = (name: string, value: string) => `ghcr.io/example/${name}@sha256:${value.repeat(64)}`;
  const images = { api: image("api", "1"), web: image("web", "2"), ops: image("ops", "3"),
    codexAgentNode: image("agent", "4"), vaultSecretBroker: image("broker", "5"),
    referenceDataNode: image("data", "6") };
  const artifacts = siteRuntimeFixture({ root, releaseId: `0.1.0-rc.5-${"b".repeat(12)}`, images });
  const manifest = parseSiteRuntimeManifest(artifacts.site);
  const metadata = parseDependencySecretMetadata(artifacts.dependencySecretMetadata, manifest.site.id);
  const environment = renderReferenceDependencyEnvironment(manifest, metadata,
    `${root}/dependency-public`, `${root}/dependency-private`);
  const path = join(root, "dependencies.env"); await writeFile(path, environment, { mode: 0o600 });
  const result = spawnSync("docker", ["compose", "--env-file", path, "-f",
    new URL("../deploy/compose.staging-dependencies.yml", import.meta.url).pathname,
    "config", "--quiet"], { encoding: "utf8" });
  if (result.error && "code" in result.error && result.error.code === "ENOENT") {
    context.skip("Docker is unavailable"); return;
  }
  assert.equal(result.status, 0, result.stderr);
});
