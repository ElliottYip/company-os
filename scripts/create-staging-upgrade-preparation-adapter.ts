const DIGEST = /^sha256:[a-f0-9]{64}$/;
const OPERATION = /^upgrade-[a-z0-9][a-z0-9-]{2,87}$/;
const PORTABLE = /^[a-z0-9][a-z0-9-]{2,95}$/;
const RELEASE = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?-[a-f0-9]{12}$/;

const OUTCOMES = {
  "freeze-dispatch": "NEW_DISPATCH_DISABLED",
  "reconcile-attempts": "EVERY_IN_FLIGHT_ATTEMPT_DRAINED_CANCELLED_OR_DURABLY_RECOVERABLE",
  "encrypted-backup": "PAIRED_BACKUP_AND_MANIFEST_RETAINED",
  "parallel-restore-rehearsal": "PREVIOUS_RELEASE_STATE_RESTORED_TO_EMPTY_PARALLEL_TARGET",
  "forward-migrate": "CURRENT_MIGRATIONS_APPLIED_ONCE",
  "start-candidate-api": "CURRENT_DIGEST_STARTED_WITH_INGRESS_CLOSED",
  "candidate-readiness": "DEPENDENCY_AWARE_READY",
  "start-candidate-secret-broker": "CURRENT_VAULT_SECRET_BROKER_DIGEST_READY",
  "start-candidate-agent-node": "CURRENT_CODEX_AGENT_NODE_DIGEST_READY",
  "start-candidate-data-node": "CURRENT_REFERENCE_DATA_NODE_DIGEST_READY_AND_FIXTURE_ONLY",
  "customer-smoke": "IDENTITY_COMPANY_WORK_APPROVAL_EVIDENCE_PATH_PASSED",
  "state-comparison": "CONTROL_TOTALS_AND_RESPONSIBILITY_EVIDENCE_MATCHED",
  "start-candidate-web": "CURRENT_WEB_DIGEST_SERVED",
} as const;

export type ConcreteStagingUpgradePreparationStep = keyof typeof OUTCOMES;

export interface StagingUpgradePreparationStepRecord {
  readonly schemaVersion: 1;
  readonly product: "company-os";
  readonly operationId: string;
  readonly siteId: string;
  readonly candidateReleaseId: string;
  readonly step: ConcreteStagingUpgradePreparationStep;
  readonly outcome: (typeof OUTCOMES)[ConcreteStagingUpgradePreparationStep];
  readonly evidenceDigest: string;
  readonly secretMaterialIncluded: false;
}

export function createStagingUpgradePreparationStepAdapter(input: {
  readonly operationId: string;
  readonly siteId: string;
  readonly candidateReleaseId: string;
  readonly readCapacityAdmission: () => Promise<{ readonly operationId: string;
    readonly siteId: string; readonly status: "READY_FOR_CANDIDATE_CREATION";
    readonly evidenceDigest: string }>;
  readonly operations: { readonly [Step in ConcreteStagingUpgradePreparationStep]:
    () => Promise<StagingUpgradePreparationStepRecord> };
}) {
  if (!OPERATION.test(input.operationId) || !PORTABLE.test(input.siteId) ||
      !RELEASE.test(input.candidateReleaseId)) invalid("CONTEXT_INVALID");
  let capacityAdmitted = false;
  const completed = new Set<string>();
  return async (step: string) => {
    if (completed.has(step)) invalid("STEP_REPLAY_FORBIDDEN");
    if (step === "capacity-admission") {
      const evidence = await input.readCapacityAdmission();
      if (evidence.operationId !== input.operationId || evidence.siteId !== input.siteId ||
          evidence.status !== "READY_FOR_CANDIDATE_CREATION" || !DIGEST.test(evidence.evidenceDigest)) {
        invalid("CAPACITY_EVIDENCE_INVALID");
      }
      capacityAdmitted = true; completed.add(step);
      return { status: "PASS" as const, evidenceDigest: evidence.evidenceDigest };
    }
    if (!capacityAdmitted) invalid("CAPACITY_ADMISSION_REQUIRED");
    if (!Object.hasOwn(OUTCOMES, step)) invalid("STEP_UNSUPPORTED");
    const typedStep = step as ConcreteStagingUpgradePreparationStep;
    const record = await input.operations[typedStep]();
    validateRecord(record, typedStep, input);
    completed.add(step);
    return { status: "PASS" as const, evidenceDigest: record.evidenceDigest };
  };
}

function validateRecord(record: StagingUpgradePreparationStepRecord,
  step: ConcreteStagingUpgradePreparationStep, input: {
    readonly operationId: string; readonly siteId: string; readonly candidateReleaseId: string }) {
  if (!record || record.schemaVersion !== 1 || record.product !== "company-os" ||
      record.operationId !== input.operationId || record.siteId !== input.siteId ||
      record.candidateReleaseId !== input.candidateReleaseId || record.step !== step ||
      record.outcome !== OUTCOMES[step] || !DIGEST.test(record.evidenceDigest) ||
      record.secretMaterialIncluded !== false || Object.keys(record).length !== 9) {
    invalid("STEP_EVIDENCE_INVALID");
  }
}

function invalid(suffix: string): never {
  throw new Error(`STAGING_UPGRADE_PREPARATION_ADAPTER_${suffix}`);
}
