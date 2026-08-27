import assert from "node:assert/strict";
import { chmod, lstat, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createStagingReleaseBundle } from "../scripts/create-staging-release-bundle.mjs";
import {
  adoptStagingSiteContract,
  installStagingReleaseBundle,
  planStagingReleaseInstall,
} from "../scripts/install-staging-release-bundle.mjs";
import { siteRuntimeFixture } from "./fixtures/site-runtime-fixture.ts";

const image = (name: string) => `ghcr.io/example/${name}@sha256:${"a".repeat(64)}`;
const release = { schemaVersion: 1, product: "company-os", releaseVersion: "0.1.0-rc.1",
  sourceRevision: "b".repeat(40), images: { api: image("api"), web: image("web"), ops: image("ops"),
    codexAgentNode: image("codex"), vaultSecretBroker: image("vault"),
    referenceDataNode: image("data") } };

async function fixture(prefix: string) {
  const temporary = await mkdtemp(join(tmpdir(), prefix));
  const source = join(temporary, "source");
  const root = join(temporary, "target");
  const releasePath = join(temporary, "release.json");
  await writeFile(releasePath, `${JSON.stringify(release)}\n`);
  await createStagingReleaseBundle({ root: new URL("../", import.meta.url).pathname,
    releaseManifestPath: releasePath, outputDirectory: source });
  await import("node:fs/promises").then(({ mkdir }) => mkdir(root, { mode: 0o750 }));
  return { temporary, source, root };
}

test("staging release install plans without mutation, then atomically retains a verified payload", async (context) => {
  const value = await fixture("company-os-staging-install-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));

  const plan = await planStagingReleaseInstall({ bundleDirectory: value.source, rootDirectory: value.root });
  assert.equal(plan.status, "PLANNED_NOT_APPLIED");
  assert.equal(plan.releaseId, `0.1.0-rc.1-${"b".repeat(12)}`);
  await assert.rejects(lstat(join(value.root, "releases")), /ENOENT/);

  const installed = await installStagingReleaseBundle({ bundleDirectory: value.source,
    rootDirectory: value.root });
  assert.equal(installed.status, "INSTALLED_NOT_STARTED");
  assert.equal(installed.reused, false);
  assert.equal((await lstat(installed.releaseDirectory)).isDirectory(), true);
  assert.equal((await lstat(installed.releaseDirectory)).isSymbolicLink(), false);
  assert.match(await readFile(join(installed.releaseDirectory, "bundle-manifest.json"), "utf8"),
    /COMPANY_OS_STAGING_RELEASE_BUNDLE/);
  const record = JSON.parse(await readFile(join(value.root, "release-store.json"), "utf8"));
  assert.equal(record.prepared.releaseId, plan.releaseId);
  assert.deepEqual(record.previous, []);
  assert.doesNotMatch(JSON.stringify(installed), /client.?secret|bearer.?token|database.?url/i);

  const reused = await installStagingReleaseBundle({ bundleDirectory: value.source,
    rootDirectory: value.root });
  assert.equal(reused.reused, true);
  assert.equal(reused.releaseDirectory, installed.releaseDirectory);
});

test("staging release install preserves the previous immutable release", async (context) => {
  const value = await fixture("company-os-staging-install-previous-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  const first = await installStagingReleaseBundle({ bundleDirectory: value.source, rootDirectory: value.root });

  const nextManifest = { ...release, releaseVersion: "0.1.0-rc.2", sourceRevision: "c".repeat(40) };
  const nextManifestPath = join(value.temporary, "next.json"); const nextSource = join(value.temporary, "next-source");
  await writeFile(nextManifestPath, `${JSON.stringify(nextManifest)}\n`);
  await createStagingReleaseBundle({ root: new URL("../", import.meta.url).pathname,
    releaseManifestPath: nextManifestPath, outputDirectory: nextSource });
  const second = await installStagingReleaseBundle({ bundleDirectory: nextSource, rootDirectory: value.root });

  assert.notEqual(second.releaseDirectory, first.releaseDirectory);
  assert.equal((await lstat(first.releaseDirectory)).isDirectory(), true);
  const record = JSON.parse(await readFile(join(value.root, "release-store.json"), "utf8"));
  assert.deepEqual(record.previous.map((item: { releaseId: string }) => item.releaseId), [first.releaseId]);
});

test("staging release install rejects unsafe roots, symlinks and changed retained payloads", async (context) => {
  const value = await fixture("company-os-staging-install-unsafe-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  await chmod(value.root, 0o777);
  await assert.rejects(planStagingReleaseInstall({ bundleDirectory: value.source,
    rootDirectory: value.root }), /STAGING_RELEASE_ROOT_MODE_UNSAFE/);
  await chmod(value.root, 0o750);

  const link = join(value.temporary, "target-link");
  await symlink(value.root, link);
  await assert.rejects(planStagingReleaseInstall({ bundleDirectory: value.source,
    rootDirectory: link }), /STAGING_RELEASE_ROOT_SYMLINK_FORBIDDEN/);

  const installed = await installStagingReleaseBundle({ bundleDirectory: value.source,
    rootDirectory: value.root });
  await writeFile(join(installed.releaseDirectory, "NOTICE"), "tampered\n");
  await assert.rejects(installStagingReleaseBundle({ bundleDirectory: value.source,
    rootDirectory: value.root }), /STAGING_BUNDLE_FILE_CHANGED/);
});

test("staging release install refuses an unmarked or redirected release store", async (context) => {
  const value = await fixture("company-os-staging-install-store-unsafe-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  await installStagingReleaseBundle({ bundleDirectory: value.source, rootDirectory: value.root });

  const marker = join(value.root, ".company-os-release-store");
  await unlink(marker);
  await assert.rejects(planStagingReleaseInstall({ bundleDirectory: value.source,
    rootDirectory: value.root }), /STAGING_RELEASE_STORE_MARKER_MISSING/);

  await writeFile(marker, "company-os staging release store v1\n", { mode: 0o600 });
  const storePath = join(value.root, "release-store.json");
  const store = JSON.parse(await readFile(storePath, "utf8"));
  store.prepared.releaseDirectory = join(value.temporary, "outside");
  await writeFile(storePath, `${JSON.stringify(store)}\n`);
  await assert.rejects(planStagingReleaseInstall({ bundleDirectory: value.source,
    rootDirectory: value.root }), /STAGING_RELEASE_STORE_INVALID/);
});

test("canonical store adopts one digest-bound site contract idempotently", async (context) => {
  const value = await fixture("company-os-staging-install-site-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  const installed = await installStagingReleaseBundle({ bundleDirectory: value.source,
    rootDirectory: value.root });
  const artifacts = siteRuntimeFixture({ root: value.root, releaseId: installed.releaseId,
    images: release.images });
  const paths = {
    siteRuntimeFile: join(value.temporary, "site-runtime.json"),
    publicEnvironmentFile: join(value.temporary, "staging.env"),
    dependencyManifestFile: join(value.temporary, "staging-dependencies.json"),
    dependencySecretMetadataFile: join(value.temporary, "dependency-secrets.json"),
  };
  await Promise.all([
    writeFile(paths.siteRuntimeFile, `${JSON.stringify(artifacts.site)}\n`, { mode: 0o600 }),
    writeFile(paths.publicEnvironmentFile, artifacts.publicEnvironment, { mode: 0o600 }),
    writeFile(paths.dependencyManifestFile, `${JSON.stringify(artifacts.dependencyManifest)}\n`, { mode: 0o600 }),
    writeFile(paths.dependencySecretMetadataFile,
      `${JSON.stringify(artifacts.dependencySecretMetadata)}\n`, { mode: 0o600 }),
  ]);
  const adopted = await adoptStagingSiteContract({ rootDirectory: value.root,
    releaseId: installed.releaseId, productSecretDirectory: artifacts.productSecretDirectory, ...paths });
  assert.equal(adopted.status, "SITE_CONTRACT_ADOPTED_NOT_STARTED");
  assert.equal(adopted.reused, false);
  assert.equal(Object.keys(adopted.digests).length, 4);
  assert.doesNotMatch(JSON.stringify(adopted), /client.?secret|bearer.?token|database.?url/i);
  const store = JSON.parse(await readFile(join(value.root, "release-store.json"), "utf8"));
  assert.equal(store.schemaVersion, 2);
  assert.equal(store.prepared.siteContract.siteId, "company-os-test-site");
  assert.equal(store.prepared.siteContract.releaseId, installed.releaseId);
  const reused = await adoptStagingSiteContract({ rootDirectory: value.root,
    releaseId: installed.releaseId, productSecretDirectory: artifacts.productSecretDirectory, ...paths });
  assert.equal(reused.reused, true);

  await writeFile(paths.publicEnvironmentFile, `${artifacts.publicEnvironment}EXTRA_PUBLIC_VALUE=changed\n`);
  await assert.rejects(adoptStagingSiteContract({ rootDirectory: value.root,
    releaseId: installed.releaseId, productSecretDirectory: artifacts.productSecretDirectory, ...paths }),
  /STAGING_SITE_PUBLIC_ENVIRONMENT_MISMATCH/);
});
