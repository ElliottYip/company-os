import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createReleaseCutoverPlan } from "../scripts/plan-release-cutover.mjs";
import { createStagingUpgradePreparationPlan } from "../scripts/plan-staging-upgrade.ts";

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
  const cutover = createReleaseCutoverPlan(active, candidate);
  const authorization = { schemaVersion: 1, product: "company-os", environment: "STAGING",
    operation: { id: "upgrade-rc4-to-rc5", siteId: "company-os-hong-kong",
      accountableOperatorReference: "human:release-owner", expiresAt: "2026-08-28T00:00:00.000Z" },
    active: { releaseId: activeId, sourceRevision: active.sourceRevision,
      releaseManifestDigest: sha256(activeRaw), startupStateDigest: sha256(startupRaw) },
    candidate: { releaseId: candidateId, sourceRevision: candidate.sourceRevision,
      releaseManifestDigest: sha256(candidateRaw), siteContractDigest: sha256(siteContractRaw) },
    cutover: { planId: cutover.cutoverId, planDigest: sha256(JSON.stringify(cutover)) },
    authorization: { preparation: "change:upgrade-preparation-01",
      trafficCutover: "change:traffic-cutover-01", rollback: "change:upgrade-rollback-01" } };
  return { authorization, activeRaw, candidateRaw, startupRaw, siteContractRaw };
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
    { ...value, candidateRaw: value.candidateRaw.replace("0.1.0-rc.5", "0.1.0-rc.6") }, options),
  /STAGING_UPGRADE_CANDIDATE_RELEASE_MISMATCH/);
});
