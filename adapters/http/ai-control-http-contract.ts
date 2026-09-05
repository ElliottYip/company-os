const ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: readonly string[]) { return Object.keys(value).every((key) => keys.includes(key)); }
function id(value: unknown) { return typeof value === "string" && ID.test(value); }
function text(value: unknown, maximum: number) { return typeof value === "string" && value.trim().length > 0 && [...value].length <= maximum; }
function revision(value: unknown) { return Number.isSafeInteger(value) && Number(value) >= 0; }
function optionalId(value: unknown) { return value === null || id(value); }
function ids(value: unknown) { return Array.isArray(value) && value.length <= 1_000 && value.every(id) && new Set(value).size === value.length; }
function instant(value: unknown) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }

export function aiAssetCommand(value: unknown): Record<string, unknown> | null {
  if (!record(value) || !exact(value, ["expectedGraphRevision", "expectedAssetRevision", "asset"]) ||
      !revision(value.expectedGraphRevision) || !(value.expectedAssetRevision === null || revision(value.expectedAssetRevision)) ||
      !record(value.asset)) return null;
  const asset = value.asset;
  if (!exact(asset, ["id", "type", "name", "provider", "ownerHumanId", "departmentId", "purpose", "goalIds",
    "projectIds", "environment", "version", "source", "riskLevel", "lifecycle", "governanceDepth"]) ||
      !id(asset.id) || !["AGENT", "MODEL", "PROMPT", "DATASET", "TOOL", "MCP_SERVER", "WORKFLOW", "KNOWLEDGE_BASE"].includes(String(asset.type)) ||
      !text(asset.name, 160) || !(asset.provider === null || text(asset.provider, 160)) || !optionalId(asset.ownerHumanId) ||
      !optionalId(asset.departmentId) || !text(asset.purpose, 2_000) || !ids(asset.goalIds) || !ids(asset.projectIds) ||
      !["DEVELOPMENT", "TEST", "PRODUCTION"].includes(String(asset.environment)) || !text(asset.version, 120) ||
      !record(asset.source) || !exact(asset.source, ["type", "referenceId", "observedAt"]) ||
      !["MANUAL", "CONNECTOR", "TRACE", "IMPORT", "FEDERATED"].includes(String(asset.source.type)) ||
      !id(asset.source.referenceId) || !instant(asset.source.observedAt) ||
      !["LOW", "MEDIUM", "HIGH", "CRITICAL", "NOT_ASSESSED"].includes(String(asset.riskLevel)) ||
      !["DISCOVERED", "REVIEW", "APPROVED", "ACTIVE", "PAUSED", "RETIRED"].includes(String(asset.lifecycle)) ||
      !["UNMANAGED", "OBSERVED", "GOVERNED", "FEDERATED"].includes(String(asset.governanceDepth))) return null;
  return structuredClone(value);
}

export function aiAssetRelationshipCommand(value: unknown): Record<string, unknown> | null {
  if (!record(value) || !exact(value, ["expectedGraphRevision", "relationship"]) || !revision(value.expectedGraphRevision) ||
      !record(value.relationship)) return null;
  const row = value.relationship;
  if (!exact(row, ["id", "fromAssetId", "toAssetId", "type", "evidenceReference", "observedAt"]) ||
      ![row.id, row.fromAssetId, row.toAssetId, row.evidenceReference].every(id) ||
      !["USES", "CALLS", "TRAINS", "EVALUATES", "READS", "WRITES", "DEPENDS_ON", "DEPLOYED_ON", "SYNCED_FROM"].includes(String(row.type)) ||
      !instant(row.observedAt)) return null;
  return structuredClone(value);
}

export function shadowReviewCommand(value: unknown, operation: string): Record<string, unknown> | null {
  if (!record(value) || !["ASSIGN", "ADMIT", "REJECT"].includes(operation) ||
      !exact(value, ["expectedGraphRevision", "expectedReviewRevision", "assignedHumanId", "governanceDepth", "reason"]) ||
      !revision(value.expectedGraphRevision) || !revision(value.expectedReviewRevision) || !text(value.reason, 1_000) ||
      !(value.assignedHumanId === undefined || id(value.assignedHumanId)) ||
      !(value.governanceDepth === undefined || ["OBSERVED", "GOVERNED", "FEDERATED"].includes(String(value.governanceDepth)))) return null;
  if (operation === "ASSIGN" && !id(value.assignedHumanId) || operation === "ADMIT" && !["OBSERVED", "GOVERNED", "FEDERATED"].includes(String(value.governanceDepth))) return null;
  return { operation, ...structuredClone(value) };
}

export function duplicateReviewCommand(value: unknown, operation: string): Record<string, unknown> | null {
  if (!record(value) || !["MERGE", "DISMISS"].includes(operation) ||
      !exact(value, ["expectedGraphRevision", "expectedReviewRevision", "canonicalAssetId", "reason"]) ||
      !revision(value.expectedGraphRevision) || !revision(value.expectedReviewRevision) || !text(value.reason, 1_000) ||
      !(value.canonicalAssetId === undefined || id(value.canonicalAssetId)) || operation === "MERGE" && !id(value.canonicalAssetId)) return null;
  return { operation, ...structuredClone(value) };
}

export function evaluationTemplateCommand(value: unknown): Record<string, unknown> | null {
  if (!record(value) || !exact(value, ["expectedCatalogRevision", "expectedTemplateRevision", "template"]) ||
      !revision(value.expectedCatalogRevision) || !(value.expectedTemplateRevision === null || revision(value.expectedTemplateRevision)) ||
      !record(value.template)) return null;
  const row = value.template;
  if (!exact(row, ["id", "name", "dimension", "evaluatorKind", "evaluatorReference", "evaluatorVersion",
    "passThresholdBps", "regressionToleranceBps", "status"]) || !id(row.id) || !text(row.name, 160) ||
      !["TASK_COMPLETION", "CORRECTNESS", "RELEVANCE", "TOOL_USE", "PROMPT_INJECTION", "SENSITIVE_DATA", "ACCESS_SAFETY", "OUTPUT_SAFETY", "LATENCY"].includes(String(row.dimension)) ||
      !["RULE", "HUMAN", "CONNECTOR"].includes(String(row.evaluatorKind)) || !id(row.evaluatorReference) ||
      !text(row.evaluatorVersion, 120) || !revision(row.passThresholdBps) || Number(row.passThresholdBps) > 10_000 ||
      !revision(row.regressionToleranceBps) || Number(row.regressionToleranceBps) > 10_000 ||
      !["DRAFT", "ACTIVE", "RETIRED"].includes(String(row.status))) return null;
  return structuredClone(value);
}

export function evaluationDatasetCommand(value: unknown): Record<string, unknown> | null {
  if (!record(value) || !exact(value, ["expectedCatalogRevision", "expectedDatasetRevision", "dataset"]) ||
      !revision(value.expectedCatalogRevision) || !(value.expectedDatasetRevision === null || revision(value.expectedDatasetRevision)) ||
      !record(value.dataset)) return null;
  const row = value.dataset;
  if (!exact(row, ["id", "name", "assetId", "itemCount", "contentDigest", "evidenceReferences", "recordedAt"]) ||
      !id(row.id) || !text(row.name, 160) || !id(row.assetId) || !Number.isSafeInteger(row.itemCount) ||
      Number(row.itemCount) < 1 || Number(row.itemCount) > 1_000_000 || typeof row.contentDigest !== "string" ||
      !DIGEST.test(row.contentDigest) || !ids(row.evidenceReferences) || !(row.evidenceReferences as unknown[]).length ||
      !instant(row.recordedAt)) return null;
  return structuredClone(value);
}

export function evaluationResultCommand(value: unknown): Record<string, unknown> | null {
  if (!record(value) || !exact(value, ["expectedCatalogRevision", "result"]) || !revision(value.expectedCatalogRevision) ||
      !record(value.result)) return null;
  const row = value.result;
  if (!exact(row, ["id", "templateId", "assetId", "datasetId", "traceId", "scoreBps", "evidenceReferences", "observedAt"]) ||
      ![row.id, row.templateId, row.assetId].every(id) || !optionalId(row.datasetId) || !optionalId(row.traceId) ||
      (row.datasetId === null) === (row.traceId === null) || !revision(row.scoreBps) || Number(row.scoreBps) > 10_000 ||
      !ids(row.evidenceReferences) || !(row.evidenceReferences as unknown[]).length || !instant(row.observedAt)) return null;
  return structuredClone(value);
}

export function valueMeasurementCommand(value: unknown): Record<string, unknown> | null {
  if (!record(value) || !exact(value, ["expectedRevision", "measurement"]) || !revision(value.expectedRevision) ||
      !record(value.measurement)) return null;
  const row = value.measurement;
  if (!exact(row, ["id", "scopeType", "scopeId", "metric", "numerator", "denominator", "method", "sourceReference",
    "sourceDigest", "confidence", "periodStart", "periodEnd", "recordedAt"]) || ![row.id, row.scopeId, row.sourceReference].every(id) ||
      !["COMPANY", "PROJECT", "AGENT", "ASSET"].includes(String(row.scopeType)) ||
      !["HOURS_SAVED_MINUTES", "ADOPTION", "OUTCOME_VALUE_CENTS"].includes(String(row.metric)) ||
      !revision(row.numerator) || !(row.denominator === null || Number.isSafeInteger(row.denominator) && Number(row.denominator) > 0) ||
      !text(row.method, 1_000) || typeof row.sourceDigest !== "string" || !DIGEST.test(row.sourceDigest) ||
      !["VERIFIED", "ESTIMATED"].includes(String(row.confidence)) ||
      ![row.periodStart, row.periodEnd, row.recordedAt].every(instant)) return null;
  return structuredClone(value);
}
