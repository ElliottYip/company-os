import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createStagingReleaseBundle } from "../scripts/create-staging-release-bundle.mjs";
import { installStagingReleaseBundle } from "../scripts/install-staging-release-bundle.mjs";
import {
  planStagingReleaseStart,
  startStagingRelease,
} from "../scripts/start-staging-release.mjs";

const image = (name: string, digest = "a") => `ghcr.io/example/${name}@sha256:${digest.repeat(64)}`;
const release = { schemaVersion: 1, product: "company-os", releaseVersion: "0.1.0-rc.1",
  sourceRevision: "b".repeat(40), images: { api: image("api"), web: image("web", "c"),
    ops: image("ops", "d"), codexAgentNode: image("codex", "e"), vaultSecretBroker: image("vault", "f") } };

async function fixture(prefix: string) {
  const temporary = await mkdtemp(join(tmpdir(), prefix));
  const source = join(temporary, "source"); const root = join(temporary, "target");
  const releasePath = join(temporary, "release.json");
  await writeFile(releasePath, `${JSON.stringify(release)}\n`);
  await createStagingReleaseBundle({ root: new URL("../", import.meta.url).pathname,
    releaseManifestPath: releasePath, outputDirectory: source });
  await import("node:fs/promises").then(({ mkdir }) => mkdir(root, { mode: 0o750 }));
  const installed = await installStagingReleaseBundle({ bundleDirectory: source, rootDirectory: root });
  const environmentFile = join(root, "staging.env"); const secretDirectory = join(root, "synthetic-secrets");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(secretDirectory, { mode: 0o700 }));
  await writeFile(environmentFile, [
    `COMPANY_OS_API_IMAGE=${release.images.api}`,
    `COMPANY_OS_WEB_IMAGE=${release.images.web}`,
    `COMPANY_OS_OPS_IMAGE=${release.images.ops}`,
    `COMPANY_OS_SECRET_DIRECTORY=${secretDirectory}`,
    "COMPANY_OS_OIDC_CLIENT_ID=company-os-staging",
    "COMPANY_OS_OIDC_ISSUER=https://identity.example",
    "COMPANY_OS_OIDC_DISCOVERY_URL=https://identity.example/.well-known/openid-configuration",
    "COMPANY_OS_HTTP_AGENT_NODE_BASE_URL=https://agent.example",
    "COMPANY_OS_HTTP_DATA_NODE_BASE_URL=https://data.example",
    "COMPANY_OS_HTTP_SECRET_BROKER_BASE_URL=https://broker.example",
    "",
  ].join("\n"), { mode: 0o600 });
  const dependencyManifestFile = join(root, "staging-dependencies.json");
  await writeFile(dependencyManifestFile, `${JSON.stringify(dependencyManifest(root))}\n`, { mode: 0o600 });
  return { temporary, root, environmentFile, dependencyManifestFile, secretDirectory,
    releaseId: installed.releaseId };
}

function dependencyManifest(root: string) {
  return {
    schemaVersion: 1, environment: "STAGING", deploymentId: "company-os-staging-raft-xin",
    ingress: { webOrigin: "https://company-os.raft.xin", apiOrigin: "https://company-os-api.raft.xin",
      ownerReference: "team:infrastructure", dnsEvidenceReference: "evidence:dns-01",
      tlsEvidenceReference: "evidence:tls-01" },
    isolation: { deploymentRoot: root, composeProject: "company-os-staging",
      network: "company-os-staging_internal", webLoopbackPort: 4600, apiLoopbackPort: 4601 },
    postgres: { majorVersion: 16, ownership: "DEDICATED", tlsMode: "VERIFY_FULL",
      coordinateSource: "SECRET_FILES", ownerReference: "team:database",
      evidenceReference: "evidence:postgres-01" },
    oidc: { issuer: "https://identity.staging.example",
      discoveryUrl: "https://identity.staging.example/.well-known/openid-configuration",
      clientId: "company-os-staging", ownership: "PRODUCT_SCOPED_CLIENT", pkce: "S256",
      ownerReference: "team:identity", evidenceReference: "evidence:oidc-01" },
    vaultBroker: { baseUrl: "https://vault.staging.example", ownership: "DEDICATED",
      ownerReference: "team:secrets", evidenceReference: "evidence:vault-01" },
    agentNode: { baseUrl: "https://agent.staging.example", ownership: "DEDICATED",
      ownerReference: "team:agent", evidenceReference: "evidence:agent-01" },
    dataNode: { baseUrl: "https://data.staging.example", ownership: "DEDICATED",
      ownerReference: "team:data", evidenceReference: "evidence:data-01" },
    backup: { provider: "ZOS_S3_COMPATIBLE", endpoint: "https://hangzhou7.zos.ctyun.cn",
      region: "us-east-1", bucket: "company-os-staging-backup", ownership: "DEDICATED",
      versioning: true, objectLock: "DISABLED", credentialSource: "VAULT_RENDERED_FILES",
      ownerReference: "team:backup", evidenceReference: "evidence:backup-01" },
  };
}

const input = (value: Awaited<ReturnType<typeof fixture>>) => ({
  rootDirectory: value.root,
  releaseId: value.releaseId,
  authorizationReference: "change:staging-acceptance-2026-08-26",
  environmentFile: value.environmentFile,
  dependencyManifestFile: value.dependencyManifestFile,
  secretDirectory: value.secretDirectory,
});

test("staging start defaults to a non-mutating plan bound to one prepared release and authorization", async (context) => {
  const value = await fixture("company-os-staging-start-plan-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  const plan = await planStagingReleaseStart(input(value));
  assert.equal(plan.status, "PLANNED_NOT_APPLIED");
  assert.equal(plan.releaseId, value.releaseId);
  assert.equal(plan.authorizationReference, "change:staging-acceptance-2026-08-26");
  assert.deepEqual(plan.steps.map(({ id }) => id), [
    "VALIDATE_DEPENDENCIES", "DOCTOR", "COMPOSE_CONFIG", "PULL_IMAGES", "MIGRATE", "PROVISION_RUNTIME_ROLE",
    "START_API", "API_READY", "START_WEB", "WEB_SMOKE", "API_SMOKE",
  ]);
  await assert.rejects(readFile(join(value.root, "startup-state.json")), /ENOENT/);
});

test("authorized staging start runs the ordered path and records started-not-accepted without command output", async (context) => {
  const value = await fixture("company-os-staging-start-success-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  const calls: string[] = [];
  const result = await startStagingRelease(input(value), {
    now: () => "2026-08-26T16:00:00.000Z",
    runCommand: async ({ id }) => { calls.push(id); return { ok: true }; },
    probe: async ({ id }) => { calls.push(id); return true; },
    wait: async () => undefined,
  });
  assert.equal(result.status, "STARTED_NOT_ACCEPTED");
  assert.deepEqual(calls, ["VALIDATE_DEPENDENCIES", "DOCTOR", "COMPOSE_CONFIG", "PULL_IMAGES", "MIGRATE",
    "PROVISION_RUNTIME_ROLE", "START_API", "API_READY", "START_WEB", "WEB_SMOKE", "API_SMOKE"]);
  const state = JSON.parse(await readFile(join(value.root, "startup-state.json"), "utf8"));
  assert.equal(state.state, "STARTED_NOT_ACCEPTED");
  assert.equal(state.automaticRollbackAttempted, false);
  assert.equal(state.acceptanceClaimed, false);
  assert.doesNotMatch(JSON.stringify(state), /stdout|stderr|client.?secret|bearer.?token|database.?url/i);
});

test("a migration-stage failure is retained for review and never triggers automatic rollback", async (context) => {
  const value = await fixture("company-os-staging-start-failure-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  const calls: string[] = [];
  await assert.rejects(startStagingRelease(input(value), {
    now: () => "2026-08-26T16:00:00.000Z",
    runCommand: async ({ id }) => { calls.push(id); return { ok: id !== "MIGRATE", code: "EXIT_17" }; },
    probe: async () => true,
    wait: async () => undefined,
  }), /STAGING_START_STEP_FAILED:MIGRATE/);
  const state = JSON.parse(await readFile(join(value.root, "startup-state.json"), "utf8"));
  assert.equal(state.state, "START_FAILED_REQUIRES_REVIEW");
  assert.equal(state.failedStep, "MIGRATE");
  assert.equal(state.failureCode, "COMMAND_FAILED");
  assert.equal(state.databaseMigrationMayHaveRun, true);
  assert.equal(state.automaticRollbackAttempted, false);
  assert.deepEqual(calls, ["VALIDATE_DEPENDENCIES", "DOCTOR", "COMPOSE_CONFIG", "PULL_IMAGES", "MIGRATE"]);
  await assert.rejects(startStagingRelease(input(value), {
    runCommand: async () => ({ ok: true }), probe: async () => true, wait: async () => undefined,
  }), /STAGING_START_REVIEW_REQUIRED/);
});

test("staging start refuses concurrent writers and release-image drift", async (context) => {
  const value = await fixture("company-os-staging-start-guard-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  await writeFile(join(value.root, ".staging-lifecycle.lock"), "occupied\n", { mode: 0o600 });
  await assert.rejects(startStagingRelease(input(value), {
    runCommand: async () => ({ ok: true }), probe: async () => true, wait: async () => undefined,
  }), /STAGING_START_ALREADY_RUNNING/);
  await rm(join(value.root, ".staging-lifecycle.lock"));
  const source = await readFile(value.environmentFile, "utf8");
  await writeFile(value.environmentFile, source.replace(release.images.api, image("different", "9")));
  await assert.rejects(planStagingReleaseStart(input(value)), /STAGING_START_RELEASE_IMAGE_MISMATCH/);
  await writeFile(value.environmentFile, source.replace(
    `COMPANY_OS_SECRET_DIRECTORY=${value.secretDirectory}`,
    `COMPANY_OS_SECRET_DIRECTORY=${join(value.root, "different-secrets")}`,
  ));
  await assert.rejects(planStagingReleaseStart(input(value)), /STAGING_START_SECRET_DIRECTORY_MISMATCH/);
});
