import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createStagingReleaseBundle } from "../scripts/create-staging-release-bundle.mjs";
import { planStagingDependencyInitialization } from
  "../scripts/initialize-staging-dependencies.mjs";
import { adoptStagingSiteContract, installStagingReleaseBundle } from
  "../scripts/install-staging-release-bundle.mjs";
import { siteRuntimeFixture } from "./fixtures/site-runtime-fixture.ts";

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
  return { temporary, root, releaseId: installed.releaseId };
}

test("dependency initialization defaults to a canonical non-mutating plan", async (context) => {
  const value = await fixture("company-os-dependency-init-plan-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  const before = await readdir(value.root);
  const plan = await planStagingDependencyInitialization({ rootDirectory: value.root,
    releaseId: value.releaseId });
  assert.equal(plan.status, "PLANNED_NOT_APPLIED");
  assert.equal(plan.executable, false);
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
