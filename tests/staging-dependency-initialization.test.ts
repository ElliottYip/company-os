import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createStagingReleaseBundle } from "../scripts/create-staging-release-bundle.mjs";
import { materializePostBootstrapDependencyConfiguration, materializeStagingDependencyConfiguration,
  planStagingDependencyInitialization } from
  "../scripts/initialize-staging-dependencies.mjs";
import { adoptStagingSiteContract, installStagingReleaseBundle } from
  "../scripts/install-staging-release-bundle.mjs";
import { siteRuntimeFixture } from "./fixtures/site-runtime-fixture.ts";
import { planStagingDependencyPhase, runStagingDependencyPhase } from
  "../scripts/run-staging-dependency-phase.mjs";

const image = (name: string, digest: string) =>
  `ghcr.io/example/${name}@sha256:${digest.repeat(64)}`;
const release = { schemaVersion: 1, product: "company-os", releaseVersion: "0.1.0-rc.5",
  sourceRevision: "b".repeat(40), images: { api: image("api", "1"), web: image("web", "2"),
    ops: image("ops", "3"), codexAgentNode: image("agent", "4"),
    vaultSecretBroker: image("broker", "5"), referenceDataNode: image("data", "6") } };

async function fixture(prefix: string, authorized = true) {
  const temporary = await mkdtemp(join(tmpdir(), prefix));
  const source = join(temporary, "source"); const root = join(temporary, "target");
  const releasePath = join(temporary, "release.json");
  await writeFile(releasePath, `${JSON.stringify(release)}\n`);
  await createStagingReleaseBundle({ root: new URL("../", import.meta.url).pathname,
    releaseManifestPath: releasePath, outputDirectory: source });
  await mkdir(root, { mode: 0o750 });
  const installed = await installStagingReleaseBundle({ bundleDirectory: source, rootDirectory: root });
  const artifacts = siteRuntimeFixture({ root, releaseId: installed.releaseId, images: release.images,
    authorization: authorized ? {
      dependencyInitialization: "change:dependency-init-test-01",
      migrationProvision: "change:migration-test-01",
      productStart: "change:product-start-test-01",
      acceptance: "change:acceptance-test-01",
    } : undefined });
  const dependencySecretSource = join(temporary, "dependency-secret-source");
  artifacts.dependencySecretMetadata.directory = dependencySecretSource;
  const paths = {
    site: join(temporary, "site-runtime.json"), environment: join(temporary, "staging.env"),
    dependencies: join(temporary, "staging-dependencies.json"),
    secrets: join(temporary, "dependency-secrets.json"),
  };
  await Promise.all([
    writeFile(paths.site, `${JSON.stringify(artifacts.site)}\n`, { mode: 0o600 }),
    writeFile(paths.environment, artifacts.publicEnvironment, { mode: 0o600 }),
    writeFile(paths.dependencies, `${JSON.stringify(artifacts.dependencyManifest)}\n`, { mode: 0o600 }),
    writeFile(paths.secrets, `${JSON.stringify(artifacts.dependencySecretMetadata)}\n`, { mode: 0o600 }),
  ]);
  await adoptStagingSiteContract({ rootDirectory: root, releaseId: installed.releaseId,
    productSecretDirectory: artifacts.productSecretDirectory, siteRuntimeFile: paths.site,
    publicEnvironmentFile: paths.environment, dependencyManifestFile: paths.dependencies,
    dependencySecretMetadataFile: paths.secrets });
  return { temporary, root, releaseId: installed.releaseId, artifacts, dependencySecretSource };
}

async function writeSecretSources(value: Awaited<ReturnType<typeof fixture>>, includeBootstrapOutputs = false) {
  await mkdir(value.dependencySecretSource, { mode: 0o700 });
  const bootstrap = { schemaVersion: 1, email: "operator@company-os.test",
    username: "company-os-operator", displayName: "Company OS staging operator",
    userId: "company-os-staging-operator", passwordHash: `$2b$12$${"A".repeat(53)}` };
  for (const entry of value.artifacts.dependencySecretMetadata.entries.filter(
    ({ generationMethod }) => generationMethod === "GENERATED_ON_TARGET" ||
      (includeBootstrapOutputs && generationMethod === "BOOTSTRAP_OUTPUT"))) {
    const content = entry.purpose === "OIDC_BOOTSTRAP" ? `${JSON.stringify(bootstrap)}\n` :
      entry.purpose === "OIDC_CLIENT" ? "synthetic-client-secret-material-32-bytes\n" :
        `synthetic-${entry.purpose.toLowerCase()}\n`;
    await writeFile(join(value.dependencySecretSource, entry.filename), content, { mode: entry.mode });
  }
}

test("dependency initialization defaults to a canonical non-mutating plan", async (context) => {
  const value = await fixture("company-os-dependency-init-plan-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  const before = await readdir(value.root);
  const plan = await planStagingDependencyInitialization({ rootDirectory: value.root,
    releaseId: value.releaseId });
  assert.equal(plan.status, "PLANNED_NOT_APPLIED");
  assert.equal(plan.executable, true);
  assert.equal(plan.siteId, "company-os-test-site");
  assert.equal(plan.oidcRuntime, "DEX");
  assert.equal(plan.authorizationReference, "change:dependency-init-test-01");
  assert.deepEqual(Object.keys(plan.artifactDigests).sort(),
    ["dependencies.env", "secret-references.json", "vault.hcl"]);
  assert.deepEqual(plan.steps.map(({ id }) => id), [
    "VALIDATE_CANONICAL_SITE_CONTRACT", "VALIDATE_DEPENDENCY_SECRET_SOURCES",
    "RESOLVE_IMMUTABLE_IMAGE_USERS", "RENDER_PUBLIC_CONFIGURATION",
    "RENDER_PRIVATE_OIDC_CONFIGURATION", "MATERIALIZE_SECRET_PROJECTIONS",
    "CREATE_DEPENDENCY_RUNTIME", "INITIALIZE_POSTGRES", "INITIALIZE_OIDC",
    "INITIALIZE_VAULT_AND_APPROLE", "START_BROKER_AND_AGENT", "VERIFY_TLS_AND_HEALTH",
  ]);
  assert.equal(plan.secretProjectionPlan.status, "PLANNED_NOT_APPLIED");
  assert.deepEqual(await readdir(value.root), before);
  assert.doesNotMatch(JSON.stringify(plan), /secretValue|tokenValue|passwordValue|PRIVATE KEY/);
});

test("dependency phase initializes the isolated runtime and emits migration-admissible evidence",
  async (context) => {
    const value = await fixture("company-os-dependency-phase-success-");
    context.after(() => rm(value.temporary, { recursive: true, force: true }));
    await writeSecretSources(value);
    const input = { rootDirectory: value.root, releaseId: value.releaseId,
      authorizationReference: "change:dependency-init-test-01" };
    const plan = await planStagingDependencyPhase(input);
    assert.equal(plan.phase, "DEPENDENCY_INITIALIZATION");
    assert.deepEqual(plan.steps.map(({ id }) => id), ["PULL_DEPENDENCY_IMAGES",
      "INSPECT_IMMUTABLE_IMAGE_USERS", "MATERIALIZE_PRE_BOOTSTRAP", "COMPOSE_CONFIG_PRE_BOOTSTRAP",
      "CREATE_PRODUCT_NETWORK", "START_FOUNDATION_DEPENDENCIES", "BOOTSTRAP_VAULT_APPROLE",
      "MATERIALIZE_POST_BOOTSTRAP", "COMPOSE_CONFIG_POST_BOOTSTRAP",
      "START_BROKER_AGENT_AND_TLS", "VERIFY_DEPENDENCY_TLS_AND_HEALTH"]);
    const ownership = { resolveImageUser: async () => ({ uid: 1001, gid: 1001 }),
      applyOwnership: async () => undefined };
    const result = await runStagingDependencyPhase(input, {
      now: (() => { let tick = 0; return () => `2026-08-27T00:00:${String(tick++).padStart(2, "0")}Z`; })(),
      inspectImageUsers: async () => [{ synthetic: true }],
      materializePre: async () => materializeStagingDependencyConfiguration(input, ownership),
      materializePost: async () => materializePostBootstrapDependencyConfiguration(input, ownership),
      async runCommand(step: { id: string }) {
        if (step.id === "BOOTSTRAP_VAULT_APPROLE") {
          for (const entry of value.artifacts.dependencySecretMetadata.entries.filter(
            ({ generationMethod }) => generationMethod === "BOOTSTRAP_OUTPUT")) {
            await writeFile(join(value.dependencySecretSource, entry.filename),
              `synthetic-${entry.purpose.toLowerCase()}\n`, { mode: entry.mode });
          }
        }
        return { ok: true };
      },
    });
    assert.equal(result.status, "DEPENDENCIES_READY_NOT_PRODUCT_MIGRATED");
    const state = JSON.parse(await readFile(join(value.root, "dependency-runtime-state.json"), "utf8"));
    assert.equal(state.runtimeObjectsCreated, true); assert.equal(state.tlsAndHealthVerified, true);
    assert.equal(state.vaultInitializationMayHaveRun, true);
    assert.match(state.postBootstrapEvidenceDigest, /^sha256:[a-f0-9]{64}$/);
    assert.doesNotMatch(JSON.stringify(state), /synthetic-/);
  });

test("dependency phase retains a review state and never auto-cleans after a runtime mutation fails",
  async (context) => {
    const value = await fixture("company-os-dependency-phase-failure-");
    context.after(() => rm(value.temporary, { recursive: true, force: true }));
    await writeSecretSources(value);
    const input = { rootDirectory: value.root, releaseId: value.releaseId,
      authorizationReference: "change:dependency-init-test-01" };
    const ownership = { resolveImageUser: async () => ({ uid: 1001, gid: 1001 }),
      applyOwnership: async () => undefined };
    await assert.rejects(runStagingDependencyPhase(input, {
      inspectImageUsers: async () => [{ synthetic: true }],
      materializePre: async () => materializeStagingDependencyConfiguration(input, ownership),
      async materializePost() { throw new Error("must not reach post-bootstrap"); },
      async runCommand(step: { id: string }) {
        return { ok: step.id !== "START_FOUNDATION_DEPENDENCIES" };
      },
    }), /STAGING_DEPENDENCY_STEP_FAILED:START_FOUNDATION_DEPENDENCIES/);
    const state = JSON.parse(await readFile(join(value.root, "dependency-runtime-state.json"), "utf8"));
    assert.equal(state.status, "DEPENDENCY_INITIALIZATION_FAILED_REQUIRES_REVIEW");
    assert.equal(state.runtimeObjectsMayExist, true); assert.equal(state.vaultInitializationMayHaveRun, false);
    assert.equal(state.automaticCleanupAttempted, false); assert.equal(state.automaticRollbackAttempted, false);
  });

test("dependency initialization refuses missing phase authority", async (context) => {
  const value = await fixture("company-os-dependency-init-auth-", false);
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  await assert.rejects(planStagingDependencyInitialization({ rootDirectory: value.root,
    releaseId: value.releaseId }), /STAGING_DEPENDENCY_INITIALIZATION_AUTHORIZATION_MISSING/);
});

test("dependency initialization refuses canonical contract drift", async (context) => {
  const value = await fixture("company-os-dependency-init-drift-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  const canonical = join(value.root, "site-contracts", "company-os-test-site", value.releaseId,
    "dependency-secrets.json");
  await writeFile(canonical, '{"changed":true}\n', { mode: 0o600 });
  await assert.rejects(planStagingDependencyInitialization({ rootDirectory: value.root,
    releaseId: value.releaseId }), /STAGING_DEPENDENCY_SITE_CONTRACT_CHANGED/);
});

test("authorized materialization writes private config and least-privilege projections without runtime objects",
  async (context) => {
    const value = await fixture("company-os-dependency-materialize-");
    context.after(() => rm(value.temporary, { recursive: true, force: true }));
    await writeSecretSources(value);
    const ownership: Array<{ path: string; uid: number; gid: number }> = [];
    const result = await materializeStagingDependencyConfiguration({ rootDirectory: value.root,
      releaseId: value.releaseId, authorizationReference: "change:dependency-init-test-01" }, {
      resolveImageUser: async () => ({ uid: 1001, gid: 1001 }),
      applyOwnership: async (path: string, uid: number, gid: number) => {
        ownership.push({ path, uid, gid });
      },
    });
    assert.equal(result.status, "PRE_BOOTSTRAP_CONFIGURATION_MATERIALIZED_NOT_STARTED");
    assert.equal(result.runtimeObjectsCreated, false);
    const privateConfig = JSON.parse(await readFile(join(result.privateConfigDirectory, "dex.json"), "utf8"));
    assert.equal(privateConfig.staticClients[0].secret, "synthetic-client-secret-material-32-bytes");
    assert.equal((await stat(join(result.privateConfigDirectory, "dex.json"))).mode & 0o777, 0o400);
    const agentFiles = await readdir(join(result.candidateRoot, "secret-projections",
      "codex-agent-node"));
    assert.deepEqual(agentFiles.sort(),
      ["agent-node-token-10", "broker-execution-token-8", "internal-tls-cert-12"]);
    await assert.rejects(stat(join(result.candidateRoot, "secret-projections",
      "vault-secret-broker")), /ENOENT/);
    assert.deepEqual(result.pendingConsumers, ["VAULT_SECRET_BROKER"]);
    const evidence = await readFile(join(result.candidateRoot, "materialization-evidence.json"), "utf8");
    assert.doesNotMatch(evidence, /synthetic-|passwordHash|staticClients|secret-material/);
    assert.ok(ownership.length >= 6);
    assert.equal(ownership.every(({ uid, gid }) => uid === 1001 && gid === 1001), true);
  });

test("materialization fails before mutation when a required source file is unsafe", async (context) => {
  const value = await fixture("company-os-dependency-materialize-unsafe-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  await mkdir(value.dependencySecretSource, { mode: 0o700 });
  await assert.rejects(materializeStagingDependencyConfiguration({ rootDirectory: value.root,
    releaseId: value.releaseId, authorizationReference: "change:dependency-init-test-01" }, {
      resolveImageUser: async () => ({ uid: 1001, gid: 1001 }),
      applyOwnership: async () => undefined,
    }), /STAGING_DEPENDENCY_SECRET_SOURCE_INVALID/);
  await assert.rejects(stat(join(value.root, "dependency-runtime")), /ENOENT/);
});

test("post-bootstrap materialization creates a complete immutable candidate with Broker AppRole projection",
  async (context) => {
    const value = await fixture("company-os-dependency-post-bootstrap-");
    context.after(() => rm(value.temporary, { recursive: true, force: true }));
    await writeSecretSources(value);
    const ownership: Array<{ path: string; uid: number; gid: number }> = [];
    const supplied = { resolveImageUser: async () => ({ uid: 1001, gid: 1001 }),
      applyOwnership: async (path: string, uid: number, gid: number) => {
        ownership.push({ path, uid, gid });
      } };
    const input = { rootDirectory: value.root, releaseId: value.releaseId,
      authorizationReference: "change:dependency-init-test-01" };
    const pre = await materializeStagingDependencyConfiguration(input, supplied);
    const preEvidenceBefore = await readFile(join(pre.candidateRoot, "materialization-evidence.json"));
    for (const entry of value.artifacts.dependencySecretMetadata.entries.filter(
      ({ generationMethod }) => generationMethod === "BOOTSTRAP_OUTPUT")) {
      await writeFile(join(value.dependencySecretSource, entry.filename),
        `synthetic-${entry.purpose.toLowerCase()}\n`, { mode: entry.mode });
    }

    const result = await materializePostBootstrapDependencyConfiguration(input, supplied);
    assert.equal(result.status, "POST_BOOTSTRAP_CONFIGURATION_MATERIALIZED_NOT_STARTED");
    assert.equal(result.runtimeObjectsCreated, false);
    assert.deepEqual(result.pendingConsumers, []);
    assert.equal(result.candidateRoot, join(pre.candidateRoot, "post-bootstrap"));
    const broker = join(result.secretProjectionRootDirectory, "vault-secret-broker");
    assert.deepEqual((await readdir(broker)).sort(), ["broker-control-token-7",
      "broker-execution-token-8", "broker-signing-key-9", "internal-tls-cert-12",
      "vault-approle-role-id-5", "vault-approle-secret-id-6"]);
    assert.deepEqual(await readFile(join(pre.candidateRoot, "materialization-evidence.json")),
      preEvidenceBefore);
    const evidence = await readFile(join(result.candidateRoot, "materialization-evidence.json"), "utf8");
    assert.doesNotMatch(evidence, /synthetic-|passwordHash|staticClients|secret-material/);
    assert.match(evidence, /previousMaterializationEvidenceDigest/);
    assert.ok(ownership.length >= 13);
  });

test("post-bootstrap materialization fails before mutation when Vault outputs are incomplete",
  async (context) => {
    const value = await fixture("company-os-dependency-post-bootstrap-missing-");
    context.after(() => rm(value.temporary, { recursive: true, force: true }));
    await writeSecretSources(value);
    const supplied = { resolveImageUser: async () => ({ uid: 1001, gid: 1001 }),
      applyOwnership: async () => undefined };
    const input = { rootDirectory: value.root, releaseId: value.releaseId,
      authorizationReference: "change:dependency-init-test-01" };
    const pre = await materializeStagingDependencyConfiguration(input, supplied);
    await assert.rejects(materializePostBootstrapDependencyConfiguration(input, supplied),
      /STAGING_DEPENDENCY_SECRET_SOURCE_INVALID/);
    await assert.rejects(stat(join(pre.candidateRoot, "post-bootstrap")), /ENOENT/);
  });
