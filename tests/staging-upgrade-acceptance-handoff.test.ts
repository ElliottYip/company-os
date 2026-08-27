import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { bindStagingUpgradeAcceptanceHandoff, planStagingUpgradeAcceptanceHandoff } from
  "../scripts/run-staging-upgrade-acceptance-handoff.ts";
import { siteRuntimeFixture } from "./fixtures/site-runtime-fixture.ts";

const operationId = "upgrade-rc4-to-rc5"; const siteId = "company-os-test-site";
const releaseId = `0.1.0-rc.5-${"b".repeat(12)}`; const revision = "b".repeat(40);
const digest = (value: string) => `sha256:${value.repeat(64)}`;
const sha256 = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const image = (name: string, value: string) => `ghcr.io/example/${name}@sha256:${value.repeat(64)}`;
const images = { api: image("api", "1"), web: image("web", "2"), ops: image("ops", "3"),
  codexAgentNode: image("agent", "4"), vaultSecretBroker: image("broker", "5"),
  referenceDataNode: image("data", "6") };

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "company-os-upgrade-acceptance-")); await chmod(root, 0o750);
  const releaseDirectory = join(root, "releases", releaseId);
  const contractDirectory = join(root, "site-contracts", siteId, releaseId);
  const candidateDirectory = join(root, "candidates", operationId);
  await Promise.all([mkdir(releaseDirectory, { recursive: true, mode: 0o750 }),
    mkdir(contractDirectory, { recursive: true, mode: 0o700 }),
    mkdir(join(candidateDirectory, "step-evidence"), { recursive: true, mode: 0o700 })]);
  const manifestRaw = `${JSON.stringify({ schemaVersion: 1, product: "company-os",
    releaseVersion: "0.1.0-rc.5", sourceRevision: revision, images })}\n`;
  await writeFile(join(releaseDirectory, "release-manifest.json"), manifestRaw, { mode: 0o640 });
  const site = siteRuntimeFixture({ root, releaseId, images, authorization: {
    dependencyInitialization: "change:dependency", migrationProvision: "change:migration",
    productStart: "change:start", acceptance: "change:accept-upgrade" } }).site;
  const siteRaw = `${JSON.stringify(site)}\n`;
  await writeFile(join(contractDirectory, "site-runtime.json"), siteRaw, { mode: 0o600 });
  const siteContract = { schemaVersion: 1, siteId, releaseId, dependencyManifestDigest: digest("7"),
    contractDirectory, digests: { "dependency-secrets.json": digest("8"),
      "site-runtime.json": sha256(siteRaw), "staging-dependencies.json": digest("9"), "staging.env": digest("a") } };
  await writeFile(join(root, "release-store.json"), `${JSON.stringify({ schemaVersion: 2,
    product: "company-os", state: "PREPARED_NOT_STARTED", prepared: { releaseId,
      releaseVersion: "0.1.0-rc.5", sourceRevision: revision, bundleManifestDigest: digest("b"),
      releaseDirectory, siteContract }, previous: [] })}\n`, { mode: 0o600 });
  await writeFile(join(candidateDirectory, "candidate.env"), "CANDIDATE=1\n", { mode: 0o600 });
  const promotionRaw = `${JSON.stringify({ schemaVersion: 1, product: "company-os", operationId, siteId,
    candidateReleaseId: releaseId, step: "promote-active", outcome: "CANDIDATE_RECORDED_AS_ACTIVE_PENDING_ACCEPTANCE",
    acceptanceClaimed: false, customerRecordsIncluded: false, secretMaterialIncluded: false })}\n`;
  await writeFile(join(candidateDirectory, "step-evidence", "promote-active.json"), promotionRaw, { mode: 0o600 });
  await writeFile(join(root, "startup-state.json"), `${JSON.stringify({ schemaVersion: 1, product: "company-os",
    releaseId, releaseVersion: "0.1.0-rc.5", sourceRevision: revision, state: "STARTED_NOT_ACCEPTED",
    acceptanceClaimed: false, automaticRollbackAttempted: false,
    activation: { kind: "UPGRADE", operationId, evidenceDigest: sha256(promotionRaw) },
    activeConfiguration: { environmentFile: join(candidateDirectory, "candidate.env") } })}\n`, { mode: 0o600 });
  const completedEvidence = ["route-traffic", "observe", "promote-active"].map((step, index) =>
    ({ step, evidenceDigest: digest(String(index + 1)) }));
  await writeFile(join(root, "upgrade-traffic-state.json"), `${JSON.stringify({ schemaVersion: 1,
    product: "company-os", phase: "TRAFFIC_CUTOVER", status: "UPGRADE_OBSERVATION_COMPLETE_PENDING_ACCEPTANCE",
    operationId, siteId, candidate: { releaseId }, trafficMoved: true, automaticRollbackAttempted: false,
    completedEvidence })}\n`, { mode: 0o600 });
  const record = { schemaVersion: 2, recordId: "acceptance-upgrade-rc5", scope: "CUSTOMER_STAGING",
    release: { version: "0.1.0-rc.5", sourceRevision: revision, manifestDigest: sha256(manifestRaw) },
    owners: { acceptance: "human-acceptance", identity: "human-identity", agentRuntime: "human-agent",
      modelGovernance: "human-model", dataGovernance: "human-data", secretManagement: "human-secret",
      backupRecovery: "human-backup", incidentResponse: "human-incident" },
    stagingEvidence: Object.fromEntries(["boundaryPreflight", "browserIdentity", "responsibilityContract",
      "agentExecution", "modelExecution", "dataBoundary", "secretLifecycle", "idempotency", "restartRecovery"]
      .map((key, index) => [key, digest((index + 1).toString(16))])), productionEvidence: null,
    approvedAt: "2026-08-27T13:00:00.000Z", approvalEvidenceDigest: digest("f") };
  const recordFile = join(root, "acceptance-record.json");
  await writeFile(recordFile, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  return { root, recordFile, input: { rootDirectory: root, operationId,
    authorizationReference: "change:accept-upgrade", recordFile } };
}

test("upgrade acceptance binds exact evidence without claiming acceptance or reopening dispatch", async (context) => {
  const value = await fixture(); context.after(() => rm(value.root, { recursive: true, force: true }));
  const plan = await planStagingUpgradeAcceptanceHandoff(value.input);
  assert.equal(plan.status, "PLANNED_NOT_APPLIED"); assert.equal(plan.completion.dispatchReopened, false);
  const result = await bindStagingUpgradeAcceptanceHandoff(value.input,
    { now: () => "2026-08-27T13:05:00.000Z" });
  assert.equal(result.status, "UPGRADE_ACCEPTANCE_RECORD_BOUND_PENDING_EXTERNAL_VERIFICATION");
  assert.equal(result.acceptanceClaimed, false); assert.equal(result.dispatchReopened, false);
  const state = JSON.parse(await readFile(join(value.root, "upgrade-acceptance-handoff-state.json"), "utf8"));
  assert.equal(state.independentlyVerified, false); assert.equal(state.externalEvidenceRequired, true);
  assert.doesNotMatch(JSON.stringify(state), /password|secretValue|bearerToken|customerRecord/i);
  await assert.rejects(planStagingUpgradeAcceptanceHandoff(value.input), /STAGING_UPGRADE_ACCEPTANCE_REVIEW_REQUIRED/);
});

test("upgrade acceptance fails closed on authority and promotion drift", async (context) => {
  const value = await fixture(); context.after(() => rm(value.root, { recursive: true, force: true }));
  await assert.rejects(planStagingUpgradeAcceptanceHandoff({ ...value.input,
    authorizationReference: "change:traffic" }), /STAGING_UPGRADE_ACCEPTANCE_AUTHORIZATION_MISMATCH/);
  const promotion = join(value.root, "candidates", operationId, "step-evidence", "promote-active.json");
  await writeFile(promotion, `${JSON.stringify({ changed: true })}\n`, { mode: 0o600 });
  await assert.rejects(planStagingUpgradeAcceptanceHandoff(value.input),
    /STAGING_UPGRADE_ACCEPTANCE_PROMOTION_EVIDENCE_INVALID/);
});
