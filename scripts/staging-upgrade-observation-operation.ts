import { createHash } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { inspectDeploymentDrain } from "./inspect-deployment-drain.ts";

const DIGEST = /^sha256:[a-f0-9]{64}$/;

export async function createStagingUpgradeObservationOperation(input: {
  readonly candidateDirectory: string;
  readonly operationId: string;
  readonly siteId: string;
  readonly candidateReleaseId: string;
  readonly stablePorts: { readonly web: number; readonly api: number };
  readonly policy: {
    readonly sampleCount: number;
    readonly intervalMilliseconds: number;
    readonly maximumP95Milliseconds: number;
    readonly maximumFailures: number;
  };
}, supplied: {
  readonly fetch?: typeof fetch;
  readonly inspectCandidate?: typeof inspectDeploymentDrain;
  readonly wait?: (milliseconds: number) => Promise<void>;
  readonly monotonicNow?: () => number;
  readonly now?: () => string;
} = {}) {
  const directory = await privateDirectory(input.candidateDirectory);
  const evidenceDirectory = await privateDirectory(join(directory, "step-evidence"));
  const comparison = parseComparison(await privateFile(join(evidenceDirectory, "state-comparison.json")), input);
  validatePolicy(input);
  const request = supplied.fetch ?? fetch; const inspect = supplied.inspectCandidate ?? inspectDeploymentDrain;
  const wait = supplied.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const monotonicNow = supplied.monotonicNow ?? (() => performance.now());
  const now = supplied.now ?? (() => new Date().toISOString());

  return async () => {
    const latencies: number[] = []; let failures = 0; let releaseMismatches = 0;
    for (let sample = 0; sample < input.policy.sampleCount; sample += 1) {
      for (const [port, path] of [[input.stablePorts.web, "/"], [input.stablePorts.api, "/health"]] as const) {
        const started = monotonicNow();
        try {
          const response = await request(`http://127.0.0.1:${port}${path}`, { method: "GET", redirect: "error",
            signal: AbortSignal.timeout(5_000) });
          const matches = response.headers.get("x-company-os-release-id") === input.candidateReleaseId;
          if (!response.ok || !matches) { failures += 1; if (!matches) releaseMismatches += 1; }
          await response.body?.cancel();
        } catch { failures += 1; }
        latencies.push(Math.max(0, Math.ceil(monotonicNow() - started)));
      }
      if (sample + 1 < input.policy.sampleCount) await wait(input.policy.intervalMilliseconds);
    }
    const p95 = percentile95(latencies);
    const candidate = await inspect();
    const stateMatches = candidate.schemaVersion === 1 && candidate.status === "DRAINED" &&
      candidate.restartAllowed === true && candidate.blockers.length === 0 &&
      candidate.exactSourceDigest === comparison.exactSourceDigest &&
      JSON.stringify(candidate.snapshot) === JSON.stringify(comparison.snapshot);
    if (failures > input.policy.maximumFailures || releaseMismatches > 0 ||
        p95 > input.policy.maximumP95Milliseconds || !stateMatches) {
      throw new Error("STAGING_UPGRADE_OBSERVATION_THRESHOLD_FAILED");
    }
    const evidence = { schemaVersion: 1, product: "company-os", operationId: input.operationId,
      siteId: input.siteId, candidateReleaseId: input.candidateReleaseId, step: "observe",
      outcome: "BOUNDED_STABLE_ROUTE_AND_RESPONSIBILITY_STATE_OBSERVED", capturedAt: now(),
      sampleCount: input.policy.sampleCount, endpointProbeCount: latencies.length,
      failureCount: failures, releaseMismatchCount: releaseMismatches,
      p95Milliseconds: p95, maximumP95Milliseconds: input.policy.maximumP95Milliseconds,
      stateComparisonEvidenceDigest: comparison.evidenceDigest,
      exactSourceDigest: comparison.exactSourceDigest, snapshot: comparison.snapshot,
      customerRecordsIncluded: false, secretMaterialIncluded: false } as const;
    const raw = `${JSON.stringify(evidence, null, 2)}\n`; const evidenceDigest = sha256(raw);
    await writeFile(join(evidenceDirectory, "observe.json"), raw, { flag: "wx", mode: 0o600 });
    return { schemaVersion: 1 as const, product: "company-os" as const,
      operationId: input.operationId, siteId: input.siteId,
      candidateReleaseId: input.candidateReleaseId, step: "observe" as const,
      outcome: evidence.outcome, evidenceDigest, secretMaterialIncluded: false as const };
  };
}

function validatePolicy(input: { readonly stablePorts: { readonly web: number; readonly api: number };
  readonly policy: { readonly sampleCount: number; readonly intervalMilliseconds: number;
    readonly maximumP95Milliseconds: number; readonly maximumFailures: number } }) {
  const port = (value: number) => Number.isSafeInteger(value) && value >= 1024 && value <= 65535;
  const policy = input.policy;
  if (!port(input.stablePorts.web) || !port(input.stablePorts.api) || input.stablePorts.web === input.stablePorts.api ||
      !Number.isSafeInteger(policy.sampleCount) || policy.sampleCount < 3 || policy.sampleCount > 120 ||
      !Number.isSafeInteger(policy.intervalMilliseconds) || policy.intervalMilliseconds < 0 ||
      policy.intervalMilliseconds > 60_000 || !Number.isSafeInteger(policy.maximumP95Milliseconds) ||
      policy.maximumP95Milliseconds < 1 || policy.maximumP95Milliseconds > 30_000 ||
      !Number.isSafeInteger(policy.maximumFailures) || policy.maximumFailures < 0 ||
      policy.maximumFailures >= policy.sampleCount * 2) throw new Error("STAGING_UPGRADE_OBSERVATION_POLICY_INVALID");
}
function parseComparison(raw: string, input: { readonly operationId: string; readonly siteId: string;
  readonly candidateReleaseId: string }) {
  let value: unknown; try { value = JSON.parse(raw); } catch { invalidComparison(); }
  if (!record(value) || value.schemaVersion !== 1 || value.product !== "company-os" ||
      value.operationId !== input.operationId || value.siteId !== input.siteId ||
      value.candidateReleaseId !== input.candidateReleaseId || value.step !== "state-comparison" ||
      value.outcome !== "CONTROL_TOTALS_AND_RESPONSIBILITY_EVIDENCE_MATCHED" ||
      !DIGEST.test(String(value.exactSourceDigest)) || !validSnapshot(value.snapshot) ||
      value.customerRecordsIncluded !== false || value.secretMaterialIncluded !== false) invalidComparison();
  return { exactSourceDigest: String(value.exactSourceDigest), snapshot: value.snapshot as Record<string, number>,
    evidenceDigest: sha256(raw) };
}
function percentile95(values: readonly number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)] ?? Number.POSITIVE_INFINITY;
}
function validSnapshot(value: unknown): value is Record<string, number> {
  return record(value) && Object.keys(value).length === 9 &&
    Object.values(value).every((item) => Number.isSafeInteger(item) && Number(item) >= 0);
}
async function privateDirectory(value: string) {
  const path = resolve(value); const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) {
    throw new Error("STAGING_UPGRADE_OBSERVATION_DIRECTORY_UNSAFE");
  }
  return path;
}
async function privateFile(path: string) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o077) !== 0 || metadata.size < 2 || metadata.size > 1_048_576) {
    throw new Error("STAGING_UPGRADE_OBSERVATION_EVIDENCE_UNSAFE");
  }
  return readFile(path, "utf8");
}
function record(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function invalidComparison(): never { throw new Error("STAGING_UPGRADE_OBSERVATION_COMPARISON_INVALID"); }
function sha256(value: string) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
