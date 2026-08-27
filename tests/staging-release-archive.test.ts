import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { createPortableStagingArchive, listPortableStagingArchive } from
  "../scripts/create-portable-staging-archive.mjs";
import { createStagingReleaseBundle, verifyStagingReleaseBundle } from
  "../scripts/create-staging-release-bundle.mjs";

const run = promisify(execFile);
const image = (name: string) => `ghcr.io/example/${name}@sha256:${"a".repeat(64)}`;
const release = { schemaVersion: 1, product: "company-os", releaseVersion: "0.1.0-rc.3",
  sourceRevision: "b".repeat(40), images: { api: image("api"), web: image("web"), ops: image("ops"),
    codexAgentNode: image("codex"), vaultSecretBroker: image("vault"),
    referenceDataNode: image("data") } };

test("portable staging archive contains only the verified handoff allowlist", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "company-os-staging-archive-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const releasePath = join(temporary, "release.json");
  const bundle = join(temporary, "bundle");
  const archive = join(temporary, "bundle.tgz");
  await writeFile(releasePath, `${JSON.stringify(release)}\n`);
  await createStagingReleaseBundle({ root: new URL("../", import.meta.url).pathname,
    releaseManifestPath: releasePath, outputDirectory: bundle });

  if (process.platform === "darwin") {
    await run("xattr", ["-w", "com.company-os.archive-test", "present", join(bundle, "NOTICE")]);
  }

  const created = await createPortableStagingArchive({ bundleDirectory: bundle, outputPath: archive });
  assert.equal(created.status, "PORTABLE_ARCHIVE_CREATED");
  assert.deepEqual(await listPortableStagingArchive(archive), [
    "LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md", "bundle-manifest.json",
    "compose.staging-dependencies.yml", "compose.staging-upgrade-candidate.yml",
    "compose.staging.yml", "customer-boundary-acceptance.md",
    "formal-identity-runbook.md", "release-manifest.json", "staging-dependencies.Caddyfile",
    "staging-raft-xin.md", "staging-upgrade-candidate.Caddyfile", "staging.env.example",
  ]);

  const extracted = join(temporary, "extracted");
  await run("mkdir", ["-m", "750", extracted]);
  await run("tar", ["-C", extracted, "-xzf", archive]);
  assert.equal((await verifyStagingReleaseBundle(extracted)).status, "VERIFIED");
  assert.equal(await readFile(join(extracted, "NOTICE"), "utf8"),
    await readFile(join(bundle, "NOTICE"), "utf8"));
});

test("portable staging archive refuses overwrite and output inside the bundle", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "company-os-staging-archive-guard-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const releasePath = join(temporary, "release.json");
  const bundle = join(temporary, "bundle");
  const archive = join(temporary, "bundle.tgz");
  await writeFile(releasePath, `${JSON.stringify(release)}\n`);
  await createStagingReleaseBundle({ root: new URL("../", import.meta.url).pathname,
    releaseManifestPath: releasePath, outputDirectory: bundle });
  await createPortableStagingArchive({ bundleDirectory: bundle, outputPath: archive });

  await assert.rejects(
    createPortableStagingArchive({ bundleDirectory: bundle, outputPath: archive }),
    /STAGING_ARCHIVE_OUTPUT_EXISTS/,
  );
  await assert.rejects(
    createPortableStagingArchive({ bundleDirectory: bundle, outputPath: join(bundle, "handoff.tgz") }),
    /STAGING_ARCHIVE_OUTPUT_INSIDE_BUNDLE_FORBIDDEN/,
  );
});
