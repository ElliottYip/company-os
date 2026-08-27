import assert from "node:assert/strict";
import test from "node:test";

import { createStagingUpgradeTrafficStepAdapter } from
  "../scripts/create-staging-upgrade-traffic-adapter.ts";

const digest = `sha256:${"a".repeat(64)}`;
const operationId = "upgrade-rc4-to-rc5"; const siteId = "company-os-hong-kong";
const candidateReleaseId = `0.1.0-rc.5-${"b".repeat(12)}`;
const outcomes = { "route-traffic": "STABLE_WEB_AND_API_ROUTE_TO_CANDIDATE_RELEASE",
  observe: "BOUNDED_STABLE_ROUTE_AND_RESPONSIBILITY_STATE_OBSERVED",
  "promote-active": "CANDIDATE_RECORDED_AS_ACTIVE_PENDING_ACCEPTANCE" } as const;
function record(step: keyof typeof outcomes) { return { schemaVersion: 1 as const,
  product: "company-os" as const, operationId, siteId, candidateReleaseId, step,
  outcome: outcomes[step], evidenceDigest: digest, secretMaterialIncluded: false as const }; }

test("traffic adapter enforces route before bounded observation and forbids replay", async () => {
  const called: string[] = []; const adapter = createStagingUpgradeTrafficStepAdapter({ operationId, siteId,
    candidateReleaseId, operations: { "route-traffic": async () => { called.push("route"); return record("route-traffic"); },
      observe: async () => { called.push("observe"); return record("observe"); },
      "promote-active": async () => { called.push("promote"); return record("promote-active"); } } });
  await assert.rejects(adapter("observe"), /ROUTE_EVIDENCE_REQUIRED/);
  assert.equal((await adapter("route-traffic")).evidenceDigest, digest);
  assert.equal((await adapter("observe")).evidenceDigest, digest);
  assert.equal((await adapter("promote-active")).evidenceDigest, digest);
  assert.deepEqual(called, ["route", "observe", "promote"]);
  await assert.rejects(adapter("observe"), /STEP_REPLAY_FORBIDDEN/);
});

test("traffic adapter rejects a record bound to another release", async () => {
  const adapter = createStagingUpgradeTrafficStepAdapter({ operationId, siteId, candidateReleaseId,
    operations: { "route-traffic": async () => ({ ...record("route-traffic"),
      candidateReleaseId: `0.1.0-rc.6-${"c".repeat(12)}` }), observe: async () => record("observe"),
      "promote-active": async () => record("promote-active") } });
  await assert.rejects(adapter("route-traffic"), /STEP_EVIDENCE_INVALID/);
});
