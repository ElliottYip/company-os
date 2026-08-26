import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateStagingRuntimeStatus,
  type StagingRuntimeSnapshot,
} from "../adapters/config/staging-runtime-status.ts";

const image = (name: string, digest: string) => `ghcr.io/example/${name}@sha256:${digest.repeat(64)}`;
const expected = { releaseId: `0.1.0-rc.1-${"a".repeat(12)}`, releaseVersion: "0.1.0-rc.1",
  sourceRevision: "a".repeat(40), images: { api: image("api", "b"), web: image("web", "c") } };

function snapshot(overrides: Partial<StagingRuntimeSnapshot> = {}): StagingRuntimeSnapshot {
  return {
    expected,
    startupState: { state: "STARTED_NOT_ACCEPTED", releaseId: expected.releaseId,
      sourceRevision: expected.sourceRevision, acceptanceClaimed: false },
    containers: [
      { service: "api", image: expected.images.api, status: "running", health: "healthy" },
      { service: "web", image: expected.images.web, status: "running", health: "healthy" },
    ],
    probes: { apiReady: true, webReachable: true },
    ...overrides,
  };
}

test("runtime status proves exact healthy API/Web without promoting customer acceptance", () => {
  const result = evaluateStagingRuntimeStatus(snapshot());
  assert.equal(result.status, "RUNNING_NOT_ACCEPTED");
  assert.equal(result.acceptanceClaimed, false);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.release, { id: expected.releaseId, version: expected.releaseVersion,
    sourceRevision: expected.sourceRevision });
});

test("runtime status distinguishes not-started, incomplete, and failed operator states", () => {
  assert.equal(evaluateStagingRuntimeStatus(snapshot({ startupState: null, containers: [],
    probes: { apiReady: false, webReachable: false } })).status, "NOT_STARTED");
  const incomplete = evaluateStagingRuntimeStatus(snapshot({ startupState: { state: "STARTING",
    releaseId: expected.releaseId, sourceRevision: expected.sourceRevision, acceptanceClaimed: false } }));
  assert.equal(incomplete.status, "START_INCOMPLETE_REQUIRES_REVIEW");
  assert.deepEqual(incomplete.findings.map(({ code }) => code), ["STARTUP_STATE_INCOMPLETE"]);
  const failed = evaluateStagingRuntimeStatus(snapshot({ startupState: { state: "START_FAILED_REQUIRES_REVIEW",
    releaseId: expected.releaseId, sourceRevision: expected.sourceRevision, acceptanceClaimed: false } }));
  assert.equal(failed.status, "START_FAILED_REQUIRES_REVIEW");
  assert.deepEqual(failed.findings.map(({ code }) => code), ["STARTUP_STATE_FAILED"]);
});

test("runtime status fails closed for image drift, duplicate services, health, and release mismatch", () => {
  const result = evaluateStagingRuntimeStatus(snapshot({
    startupState: { state: "STARTED_NOT_ACCEPTED", releaseId: `0.1.0-rc.9-${"9".repeat(12)}`,
      sourceRevision: "9".repeat(40), acceptanceClaimed: false },
    containers: [
      { service: "api", image: image("api", "9"), status: "running", health: "unhealthy" },
      { service: "api", image: expected.images.api, status: "exited", health: null },
    ],
    probes: { apiReady: false, webReachable: false },
  }));
  assert.equal(result.status, "DEGRADED_REQUIRES_REVIEW");
  assert.deepEqual(result.findings.map(({ code }) => code), [
    "STARTUP_RELEASE_MISMATCH", "STARTUP_SOURCE_MISMATCH", "CONTAINER_DUPLICATE",
    "CONTAINER_IMAGE_MISMATCH", "CONTAINER_NOT_HEALTHY", "CONTAINER_MISSING",
    "API_NOT_READY", "WEB_NOT_REACHABLE",
  ]);
  assert.doesNotMatch(JSON.stringify(result), /client.?secret|bearer.?token|database.?url/i);
});
