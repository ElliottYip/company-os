import assert from "node:assert/strict";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyDeploymentStateAdoption } from "../scripts/verify-deployment-state-adoption.ts";

const snapshot = {
  companyCount: 1, eventCount: 4, eventSequenceTotal: 4, terminalAttemptCount: 1,
  pendingPublicationCount: 0, pendingApprovalCount: 0, issuedLeaseCount: 1, revokedLeaseCount: 1,
};
const digest = `sha256:${"a".repeat(64)}`;

async function before(overrides: Record<string, unknown> = {}) {
  const directory = await mkdtemp(join(tmpdir(), "company-os-adoption-"));
  const path = join(directory, "before.json");
  await writeFile(path, JSON.stringify({
    schemaVersion: 1, status: "DRAINED", restartAllowed: true,
    observedAt: "2026-08-26T10:00:00.000Z", exactSourceDigest: digest, snapshot,
    ...overrides,
  }), { mode: 0o600 });
  await chmod(path, 0o600);
  return path;
}

test("post-restart adoption requires the exact drained durable state", async () => {
  const result = await verifyDeploymentStateAdoption(await before(), { inspect: async () => ({
    schemaVersion: 1 as const, status: "DRAINED" as const, restartAllowed: true,
    observedAt: "2026-08-26T10:02:00.000Z", blockers: [], snapshot, exactSourceDigest: digest,
  }) });
  assert.equal(result.status, "ADOPTION_VERIFIED");
  assert.equal(result.stateAdopted, true);
  assert.deepEqual(result.findings, []);
});

test("post-restart adoption fails closed for drift or a new blocker", async () => {
  const result = await verifyDeploymentStateAdoption(await before(), { inspect: async () => ({
    schemaVersion: 1 as const, status: "NOT_DRAINED" as const, restartAllowed: false,
    observedAt: "2026-08-26T10:02:00.000Z",
    blockers: [{ code: "PENDING_CONNECTOR_PUBLICATIONS" as const, count: 1 }],
    snapshot: { ...snapshot, pendingPublicationCount: 1 },
    exactSourceDigest: `sha256:${"b".repeat(64)}`,
  }) });
  assert.equal(result.status, "ADOPTION_FAILED_REQUIRES_REVIEW");
  assert.equal(result.stateAdopted, false);
  assert.deepEqual(result.findings, [
    "POST_RESTART_STATE_NOT_DRAINED", "DURABLE_STATE_DIGEST_CHANGED", "DURABLE_STATE_SUMMARY_CHANGED",
  ]);
});
