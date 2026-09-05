import type { Identifier } from "./control-plane.ts";

export type EvaluationDimension = "TASK_COMPLETION" | "CORRECTNESS" | "RELEVANCE" | "TOOL_USE" |
  "PROMPT_INJECTION" | "SENSITIVE_DATA" | "ACCESS_SAFETY" | "OUTPUT_SAFETY" | "LATENCY";

export interface EvaluationTemplate {
  readonly id: Identifier; readonly companyId: Identifier; readonly name: string;
  readonly dimension: EvaluationDimension; readonly evaluatorKind: "RULE" | "HUMAN" | "CONNECTOR";
  readonly evaluatorReference: Identifier; readonly evaluatorVersion: string;
  readonly passThresholdBps: number; readonly regressionToleranceBps: number;
  readonly status: "DRAFT" | "ACTIVE" | "RETIRED"; readonly revision: number;
}
export interface EvaluationDataset {
  readonly id: Identifier; readonly companyId: Identifier; readonly name: string;
  readonly assetId: Identifier; readonly itemCount: number; readonly contentDigest: `sha256:${string}`;
  readonly evidenceReferences: readonly Identifier[]; readonly recordedAt: string; readonly revision: number;
}
export interface EvaluationResult {
  readonly id: Identifier; readonly companyId: Identifier; readonly templateId: Identifier;
  readonly assetId: Identifier; readonly datasetId: Identifier | null; readonly traceId: Identifier | null;
  readonly evaluatorReference: Identifier; readonly evaluatorVersion: string; readonly scoreBps: number;
  readonly thresholdBps: number; readonly outcome: "PASS" | "FAIL"; readonly evidenceReferences: readonly Identifier[];
  readonly observedAt: string;
}
export interface EvaluationTrend {
  readonly assetId: Identifier; readonly templateId: Identifier; readonly latestResultId: Identifier;
  readonly previousResultId: Identifier | null; readonly latestScoreBps: number;
  readonly deltaBps: number | null; readonly regression: boolean;
}
export interface AiEvaluationCatalog {
  readonly companyId: Identifier; readonly revision: number;
  readonly templates: readonly EvaluationTemplate[]; readonly datasets: readonly EvaluationDataset[];
  readonly results: readonly EvaluationResult[];
}

const ID = /^[a-z0-9][a-z0-9-]{0,127}$/; const DIGEST = /^sha256:[a-f0-9]{64}$/;
function id(value: string, code: string): Identifier { if (!ID.test(value)) throw new Error(code); return value; }
function text(value: string, maximum: number, code: string): string { const normalized = value.trim();
  if (!normalized || [...normalized].length > maximum) throw new Error(code); return normalized; }
function instant(value: string, code: string): string { if (!Number.isFinite(Date.parse(value))) throw new Error(code); return value; }
function basisPoints(value: number, code: string): number { if (!Number.isSafeInteger(value) || value < 0 || value > 10_000)
  throw new Error(code); return value; }

export function validateAiEvaluationCatalog(value: AiEvaluationCatalog): AiEvaluationCatalog {
  id(value.companyId, "AI_EVALUATION_COMPANY_INVALID");
  if (!Number.isSafeInteger(value.revision) || value.revision < 0 || value.templates.length > 500 ||
      value.datasets.length > 2_000 || value.results.length > 100_000) throw new Error("AI_EVALUATION_CATALOG_INVALID");
  const templateIds = new Set<string>();
  const templates = value.templates.map((record) => {
    if (record.companyId !== value.companyId || templateIds.has(record.id) ||
        !["TASK_COMPLETION", "CORRECTNESS", "RELEVANCE", "TOOL_USE", "PROMPT_INJECTION", "SENSITIVE_DATA",
          "ACCESS_SAFETY", "OUTPUT_SAFETY", "LATENCY"].includes(record.dimension) ||
        !["RULE", "HUMAN", "CONNECTOR"].includes(record.evaluatorKind) ||
        !["DRAFT", "ACTIVE", "RETIRED"].includes(record.status) || !Number.isSafeInteger(record.revision) || record.revision < 0) {
      throw new Error("AI_EVALUATION_TEMPLATE_INVALID");
    }
    templateIds.add(id(record.id, "AI_EVALUATION_TEMPLATE_ID_INVALID"));
    return { ...record, name: text(record.name, 160, "AI_EVALUATION_TEMPLATE_NAME_INVALID"),
      evaluatorReference: id(record.evaluatorReference, "AI_EVALUATION_EVALUATOR_INVALID"),
      evaluatorVersion: text(record.evaluatorVersion, 120, "AI_EVALUATION_VERSION_INVALID"),
      passThresholdBps: basisPoints(record.passThresholdBps, "AI_EVALUATION_THRESHOLD_INVALID"),
      regressionToleranceBps: basisPoints(record.regressionToleranceBps, "AI_EVALUATION_REGRESSION_INVALID") };
  });
  const datasetIds = new Set<string>();
  const datasets = value.datasets.map((record) => {
    if (record.companyId !== value.companyId || datasetIds.has(record.id) || !Number.isSafeInteger(record.itemCount) ||
        record.itemCount < 1 || record.itemCount > 1_000_000 || !DIGEST.test(record.contentDigest) ||
        !Number.isSafeInteger(record.revision) || record.revision < 0) throw new Error("AI_EVALUATION_DATASET_INVALID");
    datasetIds.add(id(record.id, "AI_EVALUATION_DATASET_ID_INVALID"));
    return { ...record, name: text(record.name, 160, "AI_EVALUATION_DATASET_NAME_INVALID"),
      assetId: id(record.assetId, "AI_EVALUATION_ASSET_INVALID"),
      evidenceReferences: record.evidenceReferences.map((item) => id(item, "AI_EVALUATION_EVIDENCE_INVALID")),
      recordedAt: instant(record.recordedAt, "AI_EVALUATION_DATASET_TIME_INVALID") };
  });
  const resultIds = new Set<string>();
  const results = value.results.map((record) => {
    const template = templates.find(({ id }) => id === record.templateId);
    if (record.companyId !== value.companyId || resultIds.has(record.id) || !template ||
        record.datasetId !== null && !datasetIds.has(record.datasetId) || !record.datasetId && !record.traceId ||
        record.datasetId && record.traceId || record.evaluatorReference !== template.evaluatorReference ||
        record.evaluatorVersion !== template.evaluatorVersion || record.thresholdBps !== template.passThresholdBps ||
        record.outcome !== (record.scoreBps >= record.thresholdBps ? "PASS" : "FAIL") || !record.evidenceReferences.length) {
      throw new Error("AI_EVALUATION_RESULT_INVALID");
    }
    resultIds.add(id(record.id, "AI_EVALUATION_RESULT_ID_INVALID"));
    return { ...record, assetId: id(record.assetId, "AI_EVALUATION_ASSET_INVALID"),
      traceId: record.traceId === null ? null : id(record.traceId, "AI_EVALUATION_TRACE_INVALID"),
      scoreBps: basisPoints(record.scoreBps, "AI_EVALUATION_SCORE_INVALID"),
      thresholdBps: basisPoints(record.thresholdBps, "AI_EVALUATION_THRESHOLD_INVALID"),
      evidenceReferences: record.evidenceReferences.map((item) => id(item, "AI_EVALUATION_EVIDENCE_INVALID")),
      observedAt: instant(record.observedAt, "AI_EVALUATION_RESULT_TIME_INVALID") };
  });
  return { companyId: value.companyId, revision: value.revision, templates, datasets, results };
}

export function projectEvaluationTrends(catalog: AiEvaluationCatalog): readonly EvaluationTrend[] {
  const admitted = validateAiEvaluationCatalog(catalog); const groups = new Map<string, EvaluationResult[]>();
  for (const result of admitted.results) { const key = `${result.assetId}|${result.templateId}`;
    groups.set(key, [...(groups.get(key) ?? []), result]); }
  return [...groups.values()].map((records) => {
    const ordered = records.slice().sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.id.localeCompare(b.id));
    const latest = ordered.at(-1)!; const previous = ordered.at(-2) ?? null;
    const tolerance = admitted.templates.find(({ id }) => id === latest.templateId)!.regressionToleranceBps;
    const delta = previous ? latest.scoreBps - previous.scoreBps : null;
    return { assetId: latest.assetId, templateId: latest.templateId, latestResultId: latest.id,
      previousResultId: previous?.id ?? null, latestScoreBps: latest.scoreBps, deltaBps: delta,
      regression: delta !== null && delta < -tolerance };
  }).sort((a, b) => `${a.assetId}|${a.templateId}`.localeCompare(`${b.assetId}|${b.templateId}`));
}
