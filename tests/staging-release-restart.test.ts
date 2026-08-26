import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createStagingReleaseBundle } from "../scripts/create-staging-release-bundle.mjs";
import { installStagingReleaseBundle } from "../scripts/install-staging-release-bundle.mjs";
import { planStagingRestart, restartStagingRelease } from "../scripts/restart-staging-release.mjs";

const image = (name: string, digest: string) =>
  `ghcr.io/example/${name}@sha256:${digest.repeat(64)}`;
const release = { schemaVersion: 1, product: "company-os", releaseVersion: "0.1.0-rc.1",
  sourceRevision: "b".repeat(40), images: { api: image("api", "a"), web: image("web", "c"),
    ops: image("ops", "d"), codexAgentNode: image("codex", "e"), vaultSecretBroker: image("vault", "f") } };

async function fixture(prefix: string) {
  const temporary = await mkdtemp(join(tmpdir(), prefix));
  const source = join(temporary, "source"); const root = join(temporary, "target");
  const releasePath = join(temporary, "release.json");
  await writeFile(releasePath, `${JSON.stringify(release)}\n`);
  await createStagingReleaseBundle({ root: new URL("../", import.meta.url).pathname,
    releaseManifestPath: releasePath, outputDirectory: source });
  await mkdir(root, { mode: 0o750 });
  const installed = await installStagingReleaseBundle({ bundleDirectory: source, rootDirectory: root });
  const environmentFile = join(root, "staging.env"); const secretDirectory = join(root, "synthetic-secrets");
  await mkdir(secretDirectory, { mode: 0o700 });
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
  await writeFile(join(root, "startup-state.json"), `${JSON.stringify({
    schemaVersion: 1, product: "company-os", state: "STARTED_NOT_ACCEPTED",
    releaseId: installed.releaseId, releaseVersion: release.releaseVersion,
    sourceRevision: release.sourceRevision, acceptanceClaimed: false,
  })}\n`, { mode: 0o600 });
  return { temporary, root, environmentFile, secretDirectory, releaseId: installed.releaseId };
}

const input = (value: Awaited<ReturnType<typeof fixture>>) => ({
  rootDirectory: value.root, environmentFile: value.environmentFile,
  secretDirectory: value.secretDirectory, releaseId: value.releaseId,
  operationId: "restart-staging-20260826-01",
  authorizationReference: "change:staging-restart-2026-08-26",
});

const drained = {
  schemaVersion: 1 as const, status: "DRAINED" as const, restartAllowed: true,
  observedAt: "2026-08-26T17:00:00.000Z", blockers: [],
  snapshot: { companyCount: 1, eventCount: 4, eventSequenceTotal: 4,
    terminalAttemptCount: 1, pendingPublicationCount: 0, pendingApprovalCount: 0,
    issuedLeaseCount: 1, revokedLeaseCount: 1 },
  exactSourceDigest: `sha256:${"a".repeat(64)}`,
};

test("restart plan is non-mutating and scopes Compose to API and Web only", async (context) => {
  const value = await fixture("company-os-restart-plan-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  const plan = await planStagingRestart(input(value), {
    inspectRuntime: async () => ({ status: "RUNNING_NOT_ACCEPTED" }),
  });
  assert.equal(plan.status, "PLANNED_NOT_APPLIED");
  assert.deepEqual(plan.steps.map(({ id }) => id), ["CAPTURE_DRAIN", "RESTART_API", "API_READY",
    "RESTART_WEB", "WEB_READY", "RUNTIME_RECONCILIATION", "STATE_ADOPTION"]);
  const commands = plan.steps.filter(({ kind }) => kind === "COMMAND")
    .map(({ argv }) => argv.join(" "));
  assert.equal(commands.length, 2);
  assert.match(commands[0], /restart --timeout 30 api$/);
  assert.match(commands[1], /restart --timeout 30 web$/);
  assert.doesNotMatch(commands.join("\n"), /\b(?:down|up|run|pull|migrate|provision-runtime)\b/);
  await assert.rejects(readFile(join(value.root, "restart-state.json")), /ENOENT/);
});

test("authorized restart drains, restarts exact services, reconciles runtime, and proves adoption", async (context) => {
  const value = await fixture("company-os-restart-success-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  const calls: string[] = [];
  const result = await restartStagingRelease(input(value), {
    now: () => "2026-08-26T17:00:00.000Z",
    inspectRuntime: async () => ({ status: "RUNNING_NOT_ACCEPTED" }),
    inspectDrain: async () => drained,
    verifyAdoption: async () => ({ status: "ADOPTION_VERIFIED", stateAdopted: true, findings: [] }),
    runCommand: async ({ id }) => { calls.push(id); return { ok: true }; },
    probe: async ({ id }) => { calls.push(id); return true; },
    wait: async () => undefined,
  });
  assert.equal(result.status, "RESTARTED_NOT_ACCEPTED");
  assert.deepEqual(calls, ["RESTART_API", "API_READY", "RESTART_WEB", "WEB_READY"]);
  const state = JSON.parse(await readFile(join(value.root, "restart-state.json"), "utf8"));
  assert.equal(state.state, "RESTARTED_NOT_ACCEPTED");
  assert.equal(state.preRestartDigest, drained.exactSourceDigest);
  assert.equal(state.automaticRollbackAttempted, false);
  const retained = JSON.parse(await readFile(join(value.root, "restart-records",
    "restart-staging-20260826-01.json"), "utf8"));
  assert.deepEqual(retained, state);
  const retainedDrain = JSON.parse(await readFile(join(value.root, "restart-records",
    "restart-staging-20260826-01.pre-drain.json"), "utf8"));
  assert.equal(retainedDrain.exactSourceDigest, drained.exactSourceDigest);
  assert.doesNotMatch(JSON.stringify(state), /company-one|attempt-one|database.?url|client.?secret/i);
});

test("restart fails before mutation when durable work is not drained", async (context) => {
  const value = await fixture("company-os-restart-blocked-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  let commands = 0;
  await assert.rejects(restartStagingRelease(input(value), {
    now: () => "2026-08-26T17:00:00.000Z",
    inspectRuntime: async () => ({ status: "RUNNING_NOT_ACCEPTED" }),
    inspectDrain: async () => ({ ...drained, status: "NOT_DRAINED", restartAllowed: false,
      blockers: [{ code: "NON_TERMINAL_WORK_ATTEMPTS", count: 1 }] }),
    verifyAdoption: async () => ({ status: "ADOPTION_VERIFIED", stateAdopted: true, findings: [] }),
    runCommand: async () => { commands += 1; return { ok: true }; },
    probe: async () => true, wait: async () => undefined,
  }), /STAGING_RESTART_DRAIN_REQUIRED/);
  assert.equal(commands, 0);
  const state = JSON.parse(await readFile(join(value.root, "restart-state.json"), "utf8"));
  assert.equal(state.state, "RESTART_FAILED_REQUIRES_REVIEW");
  assert.equal(state.failedStep, "CAPTURE_DRAIN");
  assert.equal(state.serviceRestartMayHaveRun, false);
});

test("restart retains partial mutation and never claims rollback when adoption fails", async (context) => {
  const value = await fixture("company-os-restart-adoption-failure-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  await assert.rejects(restartStagingRelease(input(value), {
    now: () => "2026-08-26T17:00:00.000Z",
    inspectRuntime: async () => ({ status: "RUNNING_NOT_ACCEPTED" }),
    inspectDrain: async () => drained,
    verifyAdoption: async () => ({ status: "ADOPTION_FAILED_REQUIRES_REVIEW",
      stateAdopted: false, findings: ["DURABLE_STATE_DIGEST_CHANGED"] }),
    runCommand: async () => ({ ok: true }), probe: async () => true, wait: async () => undefined,
  }), /STAGING_RESTART_ADOPTION_FAILED/);
  const state = JSON.parse(await readFile(join(value.root, "restart-state.json"), "utf8"));
  assert.equal(state.state, "RESTART_FAILED_REQUIRES_REVIEW");
  assert.equal(state.failedStep, "STATE_ADOPTION");
  assert.equal(state.serviceRestartMayHaveRun, true);
  assert.equal(state.automaticRollbackAttempted, false);
});

test("start and restart share one lifecycle lock and operation IDs cannot be replayed", async (context) => {
  const value = await fixture("company-os-restart-lock-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  const dependencies = {
    now: () => "2026-08-26T17:00:00.000Z",
    inspectRuntime: async () => ({ status: "RUNNING_NOT_ACCEPTED" }),
    inspectDrain: async () => drained,
    verifyAdoption: async () => ({ status: "ADOPTION_VERIFIED", stateAdopted: true, findings: [] }),
    runCommand: async () => ({ ok: true }), probe: async () => true, wait: async () => undefined,
  };
  await writeFile(join(value.root, ".staging-lifecycle.lock"), "occupied\n", { mode: 0o600 });
  await assert.rejects(restartStagingRelease(input(value), dependencies), /STAGING_RESTART_ALREADY_RUNNING/);
  await rm(join(value.root, ".staging-lifecycle.lock"));
  await restartStagingRelease(input(value), dependencies);
  await assert.rejects(restartStagingRelease(input(value), dependencies),
    /STAGING_RESTART_OPERATION_ALREADY_RECORDED/);
  await assert.rejects(readFile(join(value.root, ".staging-lifecycle.lock")), /ENOENT/);
});

test("active release remains restartable after a newer candidate is staged", async (context) => {
  const value = await fixture("company-os-restart-staged-candidate-");
  context.after(() => rm(value.temporary, { recursive: true, force: true }));
  const candidateManifest = { ...release, releaseVersion: "0.2.0-rc.1",
    sourceRevision: "9".repeat(40), images: { ...release.images,
      api: image("api", "8"), web: image("web", "7") } };
  const candidatePath = join(value.temporary, "candidate.json");
  const candidateBundle = join(value.temporary, "candidate-bundle");
  await writeFile(candidatePath, `${JSON.stringify(candidateManifest)}\n`);
  await createStagingReleaseBundle({ root: new URL("../", import.meta.url).pathname,
    releaseManifestPath: candidatePath, outputDirectory: candidateBundle });
  await installStagingReleaseBundle({ rootDirectory: value.root, bundleDirectory: candidateBundle });
  const plan = await planStagingRestart(input(value), {
    inspectRuntime: async () => ({ status: "RUNNING_NOT_ACCEPTED" }),
  });
  assert.equal(plan.releaseId, value.releaseId);
  assert.match(plan.steps.find(({ id }) => id === "RESTART_API")?.argv.join(" ") ?? "",
    new RegExp(`releases/${value.releaseId}/compose\\.staging\\.yml`));
});
