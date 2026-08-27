import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createStagingReleaseBundle } from "../scripts/create-staging-release-bundle.mjs";
import { adoptStagingSiteContract, installStagingReleaseBundle } from
  "../scripts/install-staging-release-bundle.mjs";
import { createReleaseCutoverPlan } from "../scripts/plan-release-cutover.mjs";
import { materializeStagingUpgradeCandidate } from
  "../scripts/materialize-staging-upgrade-candidate.ts";
import { createStagingUpgradePreparationPlan, inspectStagingUpgradeBindings,
  parseStagingUpgradeArguments, planStagingUpgradeFromStore } from "../scripts/plan-staging-upgrade.ts";
import { siteRuntimeFixture } from "./fixtures/site-runtime-fixture.ts";

const digest = (value: string) => `sha256:${value.repeat(64)}`;
const image = (name: string, value: string) => `registry.example/${name}@${digest(value)}`;
const migration = (name: string, value: string) => ({ name, digest: digest(value) });
const sha256 = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const stable = (value: unknown) => `${JSON.stringify(value)}\n`;

function release(version: string, revision: string, value: string, migrations = [migration("0001_initial.sql", "1")]) {
  return { schemaVersion: 1, product: "company-os", releaseVersion: version,
    sourceRevision: revision.repeat(40), images: { api: image("api", value), web: image("web", value),
      ops: image("ops", value), codexAgentNode: image("agent", value),
      vaultSecretBroker: image("broker", value), referenceDataNode: image("data", value) },
    contracts: { formalApi: "v1", connectorEnvelope: "1.0", agentNode: "1.0", dataNode: "1.0",
      secretBroker: "1.0" }, runtime: { node: "22.12.0", codexCli: "0.144.1", postgresqlMajor: 16 },
    database: { engine: "postgresql", migrations } };
}

function fixture() {
  const active = release("0.1.0-rc.4", "a", "a");
  const candidate = release("0.1.0-rc.5", "b", "b",
    [migration("0001_initial.sql", "1"), migration("0002_outbox.sql", "2")]);
  const activeId = `${active.releaseVersion}-${active.sourceRevision.slice(0, 12)}`;
  const candidateId = `${candidate.releaseVersion}-${candidate.sourceRevision.slice(0, 12)}`;
  const activeRaw = stable(active); const candidateRaw = stable(candidate);
  const startupRaw = stable({ schemaVersion: 1, product: "company-os", state: "STARTED_NOT_ACCEPTED",
    releaseId: activeId, sourceRevision: active.sourceRevision, acceptanceClaimed: false,
    automaticRollbackAttempted: false });
  const siteContractRaw = stable({ schemaVersion: 1, siteId: "company-os-hong-kong",
    releaseId: candidateId, digests: { "site-runtime.json": digest("9") } });
  const runtimeContractRaw = stable(runtimeContract(activeId, candidateId, candidate.images));
  const cutover = createReleaseCutoverPlan(active, candidate);
  const authorization = { schemaVersion: 1, product: "company-os", environment: "STAGING",
    operation: { id: "upgrade-rc4-to-rc5", siteId: "company-os-hong-kong",
      accountableOperatorReference: "human:release-owner", expiresAt: "2026-08-28T00:00:00.000Z" },
    active: { releaseId: activeId, sourceRevision: active.sourceRevision,
      releaseManifestDigest: sha256(activeRaw), startupStateDigest: sha256(startupRaw) },
    candidate: { releaseId: candidateId, sourceRevision: candidate.sourceRevision,
      releaseManifestDigest: sha256(candidateRaw), siteContractDigest: sha256(siteContractRaw),
      runtimeContractDigest: sha256(runtimeContractRaw) },
    cutover: { planId: cutover.cutoverId, planDigest: sha256(JSON.stringify(cutover)) },
    authorization: { preparation: "change:upgrade-preparation-01",
      trafficCutover: "change:traffic-cutover-01", rollback: "change:upgrade-rollback-01" } };
  return { authorization, activeRaw, candidateRaw, startupRaw, siteContractRaw, runtimeContractRaw };
}

function runtimeContract(activeId: string, candidateId: string,
  images: ReturnType<typeof release>["images"], siteId = "company-os-hong-kong") {
  return { schemaVersion: 1, product: "company-os", environment: "STAGING",
    operationId: "upgrade-rc4-to-rc5", siteId,
    active: { releaseId: activeId, composeProject: `${siteId}-active`,
      productNetwork: `${siteId}-active-product`,
      ports: { api: 4601, web: 4600, referenceDataNode: 4322 } },
    candidate: { releaseId: candidateId, composeProject: `${siteId}-candidate-rc5`,
      productNetwork: `${siteId}-candidate-rc5`,
      ports: { api: 14601, web: 14600, referenceDataNode: 14322 },
      serviceIds: { api: "api-candidate-rc5", web: "web-candidate-rc5",
        secretBroker: "broker-candidate-rc5", agentNode: "agent-candidate-rc5",
        dataNode: "data-candidate-rc5" },
      parallelDatabaseReference: "database:upgrade-rc5-empty-target",
      secretProjectionReference: "secret-projection:upgrade-rc5",
      ingressRouteReference: `route:${siteId}-active`,
      resourceBudget: { maximumMemoryBytes: 2_147_483_648, maximumCpu: 2,
        maximumPids: 512, requiredHostHeadroomBytes: 536_870_912 }, images } };
}

test("upgrade preparation plan is non-mutating and separates traffic authority", () => {
  const value = fixture();
  const plan = createStagingUpgradePreparationPlan(value.authorization, value, {
    now: "2026-08-27T12:00:00.000Z",
    authorizationReference: "change:upgrade-preparation-01",
  });
  assert.equal(plan.status, "PLANNED_NOT_APPLIED");
  assert.equal(plan.phase, "UPGRADE_PREPARATION");
  assert.equal(plan.trafficMoved, false);
  assert.equal(plan.automaticRollbackAttempted, false);
  assert.ok(plan.steps.includes("encrypted-backup"));
  assert.ok(plan.steps.includes("start-candidate-web"));
  assert.equal(plan.steps.includes("route-traffic"), false);
  assert.equal(plan.steps.includes("observe"), false);
  assert.equal(plan.nextPhase.authorizationReference, "change:traffic-cutover-01");
  assert.equal(plan.candidate.runtimeContractDigest, value.authorization.candidate.runtimeContractDigest);
  assert.doesNotMatch(JSON.stringify(plan),
    /database.?url|password|client.?secret|bearer.?token|session.?cookie|oidc.?issuer/i);
});

test("upgrade preparation plan rejects expiry, wrong phase authority, and any digest drift", () => {
  const value = fixture();
  const options = { now: "2026-08-27T12:00:00.000Z",
    authorizationReference: "change:upgrade-preparation-01" };
  assert.throws(() => createStagingUpgradePreparationPlan(value.authorization, value,
    { ...options, now: "2026-08-28T00:00:00.000Z" }), /STAGING_UPGRADE_AUTHORIZATION_EXPIRED/);
  assert.throws(() => createStagingUpgradePreparationPlan(value.authorization, value,
    { ...options, authorizationReference: "change:traffic-cutover-01" }),
  /STAGING_UPGRADE_PREPARATION_AUTHORIZATION_MISMATCH/);
  assert.throws(() => createStagingUpgradePreparationPlan(value.authorization,
    { ...value, startupRaw: `${value.startupRaw} ` }, options), /STAGING_UPGRADE_ACTIVE_STATE_MISMATCH/);
  assert.throws(() => createStagingUpgradePreparationPlan(value.authorization,
    { ...value, siteContractRaw: `${value.siteContractRaw} ` }, options),
  /STAGING_UPGRADE_CANDIDATE_CONTRACT_MISMATCH/);
  assert.throws(() => createStagingUpgradePreparationPlan(value.authorization,
    { ...value, runtimeContractRaw: `${value.runtimeContractRaw} ` }, options),
  /STAGING_UPGRADE_RUNTIME_CONTRACT_MISMATCH/);
  assert.throws(() => createStagingUpgradePreparationPlan(value.authorization,
    { ...value, candidateRaw: value.candidateRaw.replace("0.1.0-rc.5", "0.1.0-rc.6") }, options),
  /STAGING_UPGRADE_CANDIDATE_RELEASE_MISMATCH/);
});

test("upgrade CLI keeps read-only inspection separate from authorized preparation planning", () => {
  assert.deepEqual(parseStagingUpgradeArguments(["--inspect-bindings", "--root", "/srv/company-os/staging",
    "--runtime-contract", "/run/company-os/upgrade-runtime.json"]),
  { rootDirectory: "/srv/company-os/staging", inspectBindings: true,
    runtimeContractFile: "/run/company-os/upgrade-runtime.json" });
  assert.deepEqual(parseStagingUpgradeArguments(["--root", "/srv/company-os/staging",
    "--runtime-contract", "/run/company-os/upgrade-runtime.json",
    "--authorization-file", "/run/company-os/upgrade-authorization.json",
    "--authorization", "change:upgrade-preparation-01"]), {
    rootDirectory: "/srv/company-os/staging", inspectBindings: false,
    authorizationFile: "/run/company-os/upgrade-authorization.json",
    authorizationReference: "change:upgrade-preparation-01",
    runtimeContractFile: "/run/company-os/upgrade-runtime.json",
  });
  assert.throws(() => parseStagingUpgradeArguments(["--inspect-bindings",
    "--runtime-contract", "/run/company-os/upgrade-runtime.json",
    "--authorization-file", "/run/company-os/upgrade-authorization.json"]),
  /STAGING_UPGRADE_INSPECTION_MUST_BE_UNAUTHORIZED/);
  assert.throws(() => parseStagingUpgradeArguments(["--root", "/srv/company-os/staging"]),
    /STAGING_UPGRADE_RUNTIME_CONTRACT_ARGUMENT_REQUIRED/);
});

test("store-bound upgrade inspection derives active and candidate authority without mutation", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "company-os-staging-upgrade-store-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const root = join(temporary, "target"); await mkdir(root, { mode: 0o750 });
  const active = release("0.1.0-rc.4", "a", "a");
  const candidate = release("0.1.0-rc.5", "b", "b",
    [migration("0001_initial.sql", "1"), migration("0002_outbox.sql", "2")]);
  const install = async (value: ReturnType<typeof release>, name: string) => {
    const manifestFile = join(temporary, `${name}.json`); const bundle = join(temporary, `${name}-bundle`);
    await writeFile(manifestFile, stable(value));
    await createStagingReleaseBundle({ root: new URL("../", import.meta.url).pathname,
      releaseManifestPath: manifestFile, outputDirectory: bundle });
    return installStagingReleaseBundle({ bundleDirectory: bundle, rootDirectory: root });
  };
  const activeInstalled = await install(active, "active");
  const candidateInstalled = await install(candidate, "candidate");
  const site = siteRuntimeFixture({ root, releaseId: candidateInstalled.releaseId,
    images: candidate.images });
  const secretDirectory = join(root, "product-secrets"); await mkdir(secretDirectory, { mode: 0o700 });
  const inputs = { siteRuntimeFile: join(temporary, "site-runtime.json"),
    publicEnvironmentFile: join(temporary, "staging.env"),
    dependencyManifestFile: join(temporary, "staging-dependencies.json"),
    dependencySecretMetadataFile: join(temporary, "dependency-secrets.json") };
  const publicEnvironment = site.publicEnvironment.replace(site.productSecretDirectory, secretDirectory);
  await Promise.all([
    writeFile(inputs.siteRuntimeFile, stable(site.site), { mode: 0o600 }),
    writeFile(inputs.publicEnvironmentFile, publicEnvironment, { mode: 0o600 }),
    writeFile(inputs.dependencyManifestFile, stable(site.dependencyManifest), { mode: 0o600 }),
    writeFile(inputs.dependencySecretMetadataFile, stable(site.dependencySecretMetadata), { mode: 0o600 }),
  ]);
  await adoptStagingSiteContract({ rootDirectory: root, releaseId: candidateInstalled.releaseId,
    productSecretDirectory: secretDirectory, ...inputs });
  const startup = { schemaVersion: 1, product: "company-os", state: "STARTED_NOT_ACCEPTED",
    releaseId: activeInstalled.releaseId, sourceRevision: active.sourceRevision,
    acceptanceClaimed: false, automaticRollbackAttempted: false };
  await writeFile(join(root, "startup-state.json"), stable(startup), { mode: 0o600 });

  const runtimeContractFile = join(temporary, "upgrade-runtime.json");
  await writeFile(runtimeContractFile, stable(runtimeContract(activeInstalled.releaseId,
    candidateInstalled.releaseId, candidate.images, "company-os-test-site")), { mode: 0o600 });

  const bindings = await inspectStagingUpgradeBindings({ rootDirectory: root, runtimeContractFile });
  assert.equal(bindings.status, "UPGRADE_BINDINGS_INSPECTED_NOT_AUTHORIZED");
  assert.equal(bindings.active.releaseId, activeInstalled.releaseId);
  assert.equal(bindings.candidate.releaseId, candidateInstalled.releaseId);
  assert.equal(bindings.siteId, "company-os-test-site");
  const authorization = { schemaVersion: 1, product: "company-os", environment: "STAGING",
    operation: { id: "upgrade-rc4-to-rc5", siteId: bindings.siteId,
      accountableOperatorReference: "human:release-owner", expiresAt: "2026-08-28T00:00:00.000Z" },
    active: bindings.active, candidate: bindings.candidate, cutover: bindings.cutover,
    authorization: { preparation: "change:upgrade-preparation-01",
      trafficCutover: "change:traffic-cutover-01", rollback: "change:upgrade-rollback-01" } };
  const authorizationFile = join(temporary, "upgrade-authorization.json");
  await writeFile(authorizationFile, stable(authorization), { mode: 0o600 });
  const plan = await planStagingUpgradeFromStore({ rootDirectory: root, authorizationFile,
    runtimeContractFile,
    authorizationReference: "change:upgrade-preparation-01", now: "2026-08-27T12:00:00.000Z" });
  assert.equal(plan.status, "PLANNED_NOT_APPLIED");
  assert.equal(plan.active.releaseId, activeInstalled.releaseId);
  assert.equal(plan.candidate.releaseId, candidateInstalled.releaseId);
  const activeEnvironmentFile = join(temporary, "active.env");
  const activeEnvironment = publicEnvironment
    .replace(/^COMPANY_OS_COMPOSE_PROJECT=.*$/m, "COMPANY_OS_COMPOSE_PROJECT=company-os-test-site-active")
    .replace(/^COMPANY_OS_PRODUCT_NETWORK=.*$/m, "COMPANY_OS_PRODUCT_NETWORK=company-os-test-site-active-product")
    .replace(/^COMPANY_OS_API_LOOPBACK_PORT=.*$/m, "COMPANY_OS_API_LOOPBACK_PORT=4601")
    .replace(/^COMPANY_OS_WEB_LOOPBACK_PORT=.*$/m, "COMPANY_OS_WEB_LOOPBACK_PORT=4600")
    .replace(/^COMPANY_OS_REFERENCE_DATA_NODE_PORT=.*$/m, "COMPANY_OS_REFERENCE_DATA_NODE_PORT=4322");
  await writeFile(activeEnvironmentFile, activeEnvironment, { mode: 0o600 });
  const candidateSecrets = join(temporary, "candidate-secrets");
  await mkdir(candidateSecrets, { mode: 0o700 });
  let composeArguments: readonly string[] = [];
  const materialized = await materializeStagingUpgradeCandidate({ rootDirectory: root,
    authorizationFile, runtimeContractFile, activeEnvironmentFile,
    secretProjectionDirectory: candidateSecrets,
    authorizationReference: "change:upgrade-preparation-01", now: "2026-08-27T12:00:00.000Z" }, {
    validateCompose: async (argv) => { composeArguments = argv; return true; },
  });
  assert.equal(materialized.status, "CANDIDATE_CONFIGURATION_MATERIALIZED_NOT_STARTED");
  assert.equal(materialized.runtimeObjectsCreated, false);
  assert.equal(materialized.trafficMoved, false);
  assert.deepEqual(composeArguments.slice(-2), ["config", "--quiet"]);
  assert.equal(JSON.parse(await readFile(join(materialized.candidateDirectory,
    "materialization-evidence.json"), "utf8")).secretMaterialIncluded, false);
  await assert.rejects(materializeStagingUpgradeCandidate({ rootDirectory: root,
    authorizationFile, runtimeContractFile, activeEnvironmentFile,
    secretProjectionDirectory: candidateSecrets,
    authorizationReference: "change:upgrade-preparation-01", now: "2026-08-27T12:00:00.000Z" }, {
    validateCompose: async () => true,
  }), /STAGING_UPGRADE_CANDIDATE_ALREADY_MATERIALIZED/);
  const store = JSON.parse(await readFile(join(root, "release-store.json"), "utf8"));
  const adoptedRuntime = join(store.prepared.siteContract.contractDirectory, "site-runtime.json");
  const adoptedRuntimeOriginal = await readFile(adoptedRuntime, "utf8");
  await writeFile(adoptedRuntime, `${adoptedRuntimeOriginal} `);
  await assert.rejects(planStagingUpgradeFromStore({ rootDirectory: root, authorizationFile,
    runtimeContractFile,
    authorizationReference: "change:upgrade-preparation-01", now: "2026-08-27T12:00:00.000Z" }),
  /STAGING_UPGRADE_CANDIDATE_CONTRACT_CHANGED/);
  await writeFile(adoptedRuntime, adoptedRuntimeOriginal);
  await writeFile(runtimeContractFile, `${await readFile(runtimeContractFile, "utf8")} `,
    { mode: 0o600 });
  await assert.rejects(planStagingUpgradeFromStore({ rootDirectory: root, authorizationFile,
    runtimeContractFile, authorizationReference: "change:upgrade-preparation-01",
    now: "2026-08-27T12:00:00.000Z" }), /STAGING_UPGRADE_RUNTIME_CONTRACT_MISMATCH/);
  await chmod(authorizationFile, 0o644);
  await assert.rejects(planStagingUpgradeFromStore({ rootDirectory: root, authorizationFile,
    runtimeContractFile,
    authorizationReference: "change:upgrade-preparation-01", now: "2026-08-27T12:00:00.000Z" }),
  /STAGING_UPGRADE_AUTHORIZATION_FILE_UNSAFE/);
  assert.equal(await readFile(join(root, "startup-state.json"), "utf8"), stable(startup));
});
