import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createStagingUpgradeDrainOperation } from
  "../scripts/staging-upgrade-drain-operation.ts";

const digest = (value: string) => `sha256:${value.repeat(64)}`;
async function fixture(context: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), "company-os-upgrade-drain-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const candidate = join(root, "candidate"); await mkdir(candidate, { mode: 0o700 }); return candidate;
}
function drained() {
  return { schemaVersion: 1 as const, status: "DRAINED" as const, restartAllowed: true,
    observedAt: "2026-08-27T12:00:00.000Z", blockers: [],
    snapshot: { companyCount: 2, eventCount: 40, eventSequenceTotal: 40,
      terminalAttemptCount: 3, pendingPublicationCount: 0, pendingApprovalCount: 0,
      issuedLeaseCount: 1, revokedLeaseCount: 1, maintenanceRevision: 5 },
    exactSourceDigest: digest("a") };
}

test("drain operation binds aggregate accountable state without customer records", async (context) => {
  const candidateDirectory = await fixture(context);
  const operation = await createStagingUpgradeDrainOperation({ candidateDirectory,
    operationId: "upgrade-rc4-to-rc5", siteId: "company-os-test-site",
    candidateReleaseId: `0.1.0-rc.5-${"b".repeat(12)}` }, { inspectDrain: async () => drained() });
  const result = await operation();
  assert.equal(result.outcome, "EVERY_IN_FLIGHT_ATTEMPT_DRAINED_CANCELLED_OR_DURABLY_RECOVERABLE");
  const evidence = await readFile(join(candidateDirectory, "step-evidence", "reconcile-attempts.json"), "utf8");
  assert.equal(JSON.parse(evidence).customerRecordsIncluded, false);
  assert.doesNotMatch(evidence, /companyId|workId|attemptId|principalId|email/i);
});

test("drain operation fails closed for attempts, approvals, leases or invalid state", async (context) => {
  for (const status of ["NOT_DRAINED", "STATE_INVALID_REQUIRES_REVIEW"] as const) {
    const candidateDirectory = await fixture(context);
    const operation = await createStagingUpgradeDrainOperation({ candidateDirectory,
      operationId: "upgrade-rc4-to-rc5", siteId: "company-os-test-site",
      candidateReleaseId: `0.1.0-rc.5-${"b".repeat(12)}` }, { inspectDrain: async () => ({ ...drained(),
        status, restartAllowed: false, blockers: [{ code: status === "NOT_DRAINED"
          ? "NON_TERMINAL_WORK_ATTEMPTS" as const : "DRAIN_SOURCE_STATE_INVALID" as const, count: 1 }] }) });
    await assert.rejects(operation(), new RegExp(`STAGING_UPGRADE_DRAIN_NOT_READY:${status}`));
  }
});
