import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createStagingReleaseBundle } from "../scripts/create-staging-release-bundle.mjs";
import { installStagingReleaseBundle } from "../scripts/install-staging-release-bundle.mjs";
import { inspectStagingRuntime } from "../scripts/inspect-staging-runtime.mjs";

const image = (name: string, digest: string) => `ghcr.io/example/${name}@sha256:${digest.repeat(64)}`;
const release = { schemaVersion: 1, product: "company-os", releaseVersion: "0.1.0-rc.1",
  sourceRevision: "b".repeat(40), images: { api: image("api", "a"), web: image("web", "c"),
    ops: image("ops", "d"), codexAgentNode: image("codex", "e"), vaultSecretBroker: image("vault", "f") } };
const candidate = { ...release, releaseVersion: "0.2.0-rc.1", sourceRevision: "9".repeat(40),
  images: { ...release.images, api: image("api", "8"), web: image("web", "7") } };

async function install(root: string, temporary: string, value: typeof release, name: string) {
  const source = join(temporary, name); const manifest = join(temporary, `${name}.json`);
  await writeFile(manifest, `${JSON.stringify(value)}\n`);
  await createStagingReleaseBundle({ root: new URL("../", import.meta.url).pathname,
    releaseManifestPath: manifest, outputDirectory: source });
  return installStagingReleaseBundle({ rootDirectory: root, bundleDirectory: source });
}

async function fixture(prefix: string) {
  const temporary = await mkdtemp(join(tmpdir(), prefix)); const source = join(temporary, "source");
  const root = join(temporary, "root"); const manifest = join(temporary, "release.json");
  await writeFile(manifest, `${JSON.stringify(release)}\n`);
  await createStagingReleaseBundle({ root: new URL("../", import.meta.url).pathname,
    releaseManifestPath: manifest, outputDirectory: source });
  await import("node:fs/promises").then(({ mkdir }) => mkdir(root, { mode: 0o750 }));
  const installed = await installStagingReleaseBundle({ rootDirectory: root, bundleDirectory: source });
  return { temporary, root, releaseId: installed.releaseId };
}

test("read-only runtime inspection binds retained startup state to exact container images", async (context) => {
  const value = await fixture("company-os-inspect-runtime-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  await writeFile(join(value.root, "startup-state.json"), `${JSON.stringify({ schemaVersion: 1,
    product: "company-os", state: "STARTED_NOT_ACCEPTED", releaseId: value.releaseId,
    sourceRevision: release.sourceRevision, acceptanceClaimed: false })}\n`, { mode: 0o600 });
  const calls: string[] = [];
  const result = await inspectStagingRuntime({ rootDirectory: value.root }, {
    listContainers: async () => { calls.push("containers"); return [
      { service: "api", image: release.images.api, status: "running", health: "healthy" },
      { service: "web", image: release.images.web, status: "running", health: "healthy" },
    ]; },
    probe: async ({ id }) => { calls.push(id); return true; },
  });
  assert.equal(result.status, "RUNNING_NOT_ACCEPTED");
  assert.deepEqual(calls, ["containers", "API_READY", "WEB_REACHABLE"]);
  assert.doesNotMatch(JSON.stringify(result), /stdout|stderr|client.?secret|bearer.?token|database.?url/i);
});

test("a staged candidate does not replace the startup-bound active runtime", async (context) => {
  const value = await fixture("company-os-inspect-candidate-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  await writeFile(join(value.root, "startup-state.json"), `${JSON.stringify({ schemaVersion: 1,
    product: "company-os", state: "STARTED_NOT_ACCEPTED", releaseId: value.releaseId,
    sourceRevision: release.sourceRevision, acceptanceClaimed: false })}\n`, { mode: 0o600 });
  const staged = await install(value.root, value.temporary, candidate, "candidate");
  assert.notEqual(staged.releaseId, value.releaseId);
  const result = await inspectStagingRuntime({ rootDirectory: value.root }, {
    listContainers: async () => [
      { service: "api", image: release.images.api, status: "running", health: "healthy" },
      { service: "web", image: release.images.web, status: "running", health: "healthy" },
    ],
    probe: async () => true,
  });
  assert.equal(result.status, "RUNNING_NOT_ACCEPTED");
  assert.equal(result.release.id, value.releaseId);
  assert.equal(result.candidate?.id, staged.releaseId);
  assert.equal(result.candidate?.sourceRevision, candidate.sourceRevision);
  assert.deepEqual(result.findings, []);
});

test("runtime inspection reports prepared-not-started without inventing Docker state", async (context) => {
  const value = await fixture("company-os-inspect-not-started-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  let listed = false;
  const result = await inspectStagingRuntime({ rootDirectory: value.root }, {
    listContainers: async () => { listed = true; return []; },
    probe: async () => false,
  });
  assert.equal(result.status, "NOT_STARTED");
  assert.equal(listed, false);
});

test("runtime inspection rejects redirected state instead of following it", async (context) => {
  const value = await fixture("company-os-inspect-unsafe-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  const outside = join(value.temporary, "outside.json");
  await writeFile(outside, "{}\n", { mode: 0o600 });
  await symlink(outside, join(value.root, "startup-state.json"));
  await assert.rejects(inspectStagingRuntime({ rootDirectory: value.root }, {
    listContainers: async () => [], probe: async () => false,
  }), /STAGING_STATUS_STATE_UNSAFE/);
  assert.equal(await readFile(outside, "utf8"), "{}\n");
});
