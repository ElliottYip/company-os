import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createStagingUpgradeStateComparisonOperation } from
  "../scripts/staging-upgrade-state-comparison-operation.ts";

const sourceDigest = `sha256:${"a".repeat(64)}`;
const snapshot = { companyCount: 1, eventCount: 9, eventSequenceTotal: 9,
  terminalAttemptCount: 1, pendingPublicationCount: 0, pendingApprovalCount: 0,
  issuedLeaseCount: 1, revokedLeaseCount: 1, maintenanceRevision: 3 };
async function fixture(context: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), "company-os-state-comparison-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const candidate = join(root, "candidate"); const records = join(candidate, "step-evidence");
  await mkdir(records, { recursive: true, mode: 0o700 });
  await writeFile(join(records, "reconcile-attempts.json"), `${JSON.stringify({ schemaVersion: 1,
    product: "company-os", operationId: "upgrade-rc4-to-rc5", siteId: "company-os-test-site",
    candidateReleaseId: `0.1.0-rc.5-${"b".repeat(12)}`, step: "reconcile-attempts",
    outcome: "EVERY_IN_FLIGHT_ATTEMPT_DRAINED_CANCELLED_OR_DURABLY_RECOVERABLE",
    exactSourceDigest: sourceDigest, snapshot, blockers: [], customerRecordsIncluded: false,
    secretMaterialIncluded: false })}\n`, { mode: 0o600 });
  return candidate;
}
function candidate(overrides: Partial<Record<string, unknown>> = {}) {
  return { schemaVersion: 1, status: "DRAINED", restartAllowed: true,
    observedAt: "2026-08-27T13:00:00.000Z", exactSourceDigest: sourceDigest,
    blockers: [], snapshot, ...overrides } as any;
}

test("state comparison binds candidate totals to the frozen active source", async (context) => {
  const directory = await fixture(context);
  const operation = await createStagingUpgradeStateComparisonOperation({ candidateDirectory: directory,
    operationId: "upgrade-rc4-to-rc5", siteId: "company-os-test-site",
    candidateReleaseId: `0.1.0-rc.5-${"b".repeat(12)}` }, {
    inspectCandidate: async () => candidate(), now: () => "2026-08-27T13:00:01.000Z" });
  const result = await operation();
  assert.equal(result.outcome, "CONTROL_TOTALS_AND_RESPONSIBILITY_EVIDENCE_MATCHED");
  const evidence = JSON.parse(await readFile(join(directory, "step-evidence", "state-comparison.json"), "utf8"));
  assert.equal(evidence.exactSourceDigest, sourceDigest); assert.equal(evidence.customerRecordsIncluded, false);
});

test("state comparison fails closed for source digest or control-total drift", async (context) => {
  const directory = await fixture(context);
  const drifted = await createStagingUpgradeStateComparisonOperation({ candidateDirectory: directory,
    operationId: "upgrade-rc4-to-rc5", siteId: "company-os-test-site",
    candidateReleaseId: `0.1.0-rc.5-${"b".repeat(12)}` }, { inspectCandidate: async () => candidate({
      exactSourceDigest: `sha256:${"c".repeat(64)}` }) });
  await assert.rejects(drifted(), /STAGING_UPGRADE_STATE_COMPARISON_MISMATCH/);
  const totals = await createStagingUpgradeStateComparisonOperation({ candidateDirectory: directory,
    operationId: "upgrade-rc4-to-rc5", siteId: "company-os-test-site",
    candidateReleaseId: `0.1.0-rc.5-${"b".repeat(12)}` }, { inspectCandidate: async () => candidate({
      snapshot: { ...snapshot, eventCount: 10 } }) });
  await assert.rejects(totals(), /STAGING_UPGRADE_STATE_COMPARISON_MISMATCH/);
});
