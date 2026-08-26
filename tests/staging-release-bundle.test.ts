import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createStagingReleaseBundle, verifyStagingReleaseBundle } from "../scripts/create-staging-release-bundle.mjs";

const image = (name: string) => `ghcr.io/example/${name}@sha256:${"a".repeat(64)}`;
const release = { schemaVersion: 1, product: "company-os", releaseVersion: "0.1.0-rc.1",
  sourceRevision: "b".repeat(40), images: { api: image("api"), web: image("web"), ops: image("ops"),
    codexAgentNode: image("codex"), vaultSecretBroker: image("vault"),
    referenceDataNode: image("data") } };

test("staging release bundle is digest-bound, secret-free, verifiable and refuses overwrite", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "company-os-staging-bundle-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const releasePath = join(temporary, "input-release.json");
  const output = join(temporary, "bundle");
  await writeFile(releasePath, `${JSON.stringify(release)}\n`);
  const created = await createStagingReleaseBundle({ root: new URL("../", import.meta.url).pathname,
    releaseManifestPath: releasePath, outputDirectory: output });
  assert.equal(created.secretMaterialIncluded, false);
  assert.equal(created.files.length, 9);
  assert.deepEqual(await verifyStagingReleaseBundle(output), { schemaVersion: 1, status: "VERIFIED",
    releaseVersion: "0.1.0-rc.1", sourceRevision: "b".repeat(40),
    bundleManifestDigest: created.bundleManifestDigest });
  const serialized = await readFile(join(output, "bundle-manifest.json"), "utf8");
  assert.doesNotMatch(serialized, /client.?secret|bearer.?token|database.?password/i);
  await assert.rejects(createStagingReleaseBundle({ root: new URL("../", import.meta.url).pathname,
    releaseManifestPath: releasePath, outputDirectory: output }), /STAGING_BUNDLE_OUTPUT_EXISTS/);
});

test("staging release bundle detects a changed handoff file", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "company-os-staging-bundle-change-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const releasePath = join(temporary, "input-release.json"); const output = join(temporary, "bundle");
  await writeFile(releasePath, `${JSON.stringify(release)}\n`);
  await createStagingReleaseBundle({ root: new URL("../", import.meta.url).pathname,
    releaseManifestPath: releasePath, outputDirectory: output });
  await writeFile(join(output, "NOTICE"), "changed\n");
  await assert.rejects(verifyStagingReleaseBundle(output), /STAGING_BUNDLE_FILE_CHANGED/);
});

test("staging release bundle rejects undeclared files and duplicate file records", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "company-os-staging-bundle-shape-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const releasePath = join(temporary, "input-release.json"); const output = join(temporary, "bundle");
  await writeFile(releasePath, `${JSON.stringify(release)}\n`);
  await createStagingReleaseBundle({ root: new URL("../", import.meta.url).pathname,
    releaseManifestPath: releasePath, outputDirectory: output });

  await writeFile(join(output, "unlisted.env"), "SHOULD_NOT_BE_ACCEPTED=1\n");
  await assert.rejects(verifyStagingReleaseBundle(output), /STAGING_BUNDLE_UNDECLARED_FILE/);
  await rm(join(output, "unlisted.env"));

  const manifestPath = join(output, "bundle-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.files.push(manifest.files[0]);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await assert.rejects(verifyStagingReleaseBundle(output), /STAGING_BUNDLE_FILE_DUPLICATE/);
});
