const DIGEST = /^sha256:[a-f0-9]{64}$/;
const OPERATION = /^upgrade-[a-z0-9][a-z0-9-]{2,87}$/;
const PORTABLE = /^[a-z0-9][a-z0-9-]{2,95}$/;
const RELEASE = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?-[a-f0-9]{12}$/;
const OUTCOMES = {
  "route-traffic": "STABLE_WEB_AND_API_ROUTE_TO_CANDIDATE_RELEASE",
  observe: "BOUNDED_STABLE_ROUTE_AND_RESPONSIBILITY_STATE_OBSERVED",
  "promote-active": "CANDIDATE_RECORDED_AS_ACTIVE_PENDING_ACCEPTANCE",
} as const;
export type ConcreteStagingUpgradeTrafficStep = keyof typeof OUTCOMES;
export interface StagingUpgradeTrafficStepRecord {
  readonly schemaVersion: 1; readonly product: "company-os"; readonly operationId: string;
  readonly siteId: string; readonly candidateReleaseId: string;
  readonly step: ConcreteStagingUpgradeTrafficStep;
  readonly outcome: (typeof OUTCOMES)[ConcreteStagingUpgradeTrafficStep];
  readonly evidenceDigest: string; readonly secretMaterialIncluded: false;
}
export function createStagingUpgradeTrafficStepAdapter(input: {
  readonly operationId: string; readonly siteId: string; readonly candidateReleaseId: string;
  readonly operations: { readonly [Step in ConcreteStagingUpgradeTrafficStep]:
    () => Promise<StagingUpgradeTrafficStepRecord> };
}) {
  if (!OPERATION.test(input.operationId) || !PORTABLE.test(input.siteId) ||
      !RELEASE.test(input.candidateReleaseId)) invalid("CONTEXT_INVALID");
  let routed = false; let observed = false; const completed = new Set<string>();
  return async (step: ConcreteStagingUpgradeTrafficStep) => {
    if (!Object.hasOwn(OUTCOMES, step)) invalid("STEP_UNSUPPORTED");
    if (completed.has(step)) invalid("STEP_REPLAY_FORBIDDEN");
    if (step === "observe" && !routed) invalid("ROUTE_EVIDENCE_REQUIRED");
    if (step === "promote-active" && !observed) invalid("OBSERVATION_EVIDENCE_REQUIRED");
    const record = await input.operations[step]();
    if (!record || record.schemaVersion !== 1 || record.product !== "company-os" ||
        record.operationId !== input.operationId || record.siteId !== input.siteId ||
        record.candidateReleaseId !== input.candidateReleaseId || record.step !== step ||
        record.outcome !== OUTCOMES[step] || !DIGEST.test(record.evidenceDigest) ||
        record.secretMaterialIncluded !== false || Object.keys(record).length !== 9) {
      invalid("STEP_EVIDENCE_INVALID");
    }
    completed.add(step); if (step === "route-traffic") routed = true; if (step === "observe") observed = true;
    return { status: "PASS" as const, evidenceDigest: record.evidenceDigest };
  };
}
function invalid(suffix: string): never {
  throw new Error(`STAGING_UPGRADE_TRAFFIC_ADAPTER_${suffix}`);
}
