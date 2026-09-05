import type { Identifier } from "../core/control-plane.ts";
import { projectEvaluationTrends, validateAiEvaluationCatalog, type AiEvaluationCatalog,
  type EvaluationDataset, type EvaluationResult, type EvaluationTemplate } from "../core/ai-evaluation.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import { projectAiAssetGraph } from "./ai-asset-registry.ts";

async function project(events: EventDataStorePort, companyId: Identifier): Promise<AiEvaluationCatalog> {
  const records = await events.read(companyId, { types: ["ai-evaluation-catalog.revised"] });
  const catalog = (records.at(-1)?.payload as { catalog?: AiEvaluationCatalog } | undefined)?.catalog;
  return catalog ? validateAiEvaluationCatalog(catalog) : { companyId, revision: 0, templates: [], datasets: [], results: [] };
}

export class AiEvaluationRegistry {
  readonly #identity: IdentityPort; readonly #events: EventDataStorePort;
  readonly #now: () => string; readonly #nextId: () => Identifier;
  constructor(dependencies: { readonly identity: IdentityPort; readonly events: EventDataStorePort;
    readonly now: () => string; readonly nextId: () => Identifier }) {
    this.#identity = dependencies.identity; this.#events = dependencies.events;
    this.#now = dependencies.now; this.#nextId = dependencies.nextId;
  }
  async load(companyId: Identifier) {
    await this.#authorize(companyId, "ai-evaluations:read", "Read AI evaluations");
    const catalog = await project(this.#events, companyId);
    return { catalog, trends: projectEvaluationTrends(catalog) };
  }
  async upsertTemplate(companyId: Identifier, input: { readonly expectedCatalogRevision: number;
    readonly expectedTemplateRevision: number | null; readonly template: Omit<EvaluationTemplate, "companyId" | "revision"> }) {
    const actorId = await this.#authorize(companyId, "ai-evaluations:template-write", "Register an evaluation template");
    const current = await project(this.#events, companyId); this.#revision(current, input.expectedCatalogRevision);
    const existing = current.templates.find(({ id }) => id === input.template.id);
    if ((existing?.revision ?? null) !== input.expectedTemplateRevision) throw new Error("AI_EVALUATION_TEMPLATE_REVISION_CONFLICT");
    const template = { ...input.template, companyId, revision: (existing?.revision ?? -1) + 1 };
    return this.#save(actorId, current, { ...current, revision: current.revision + 1,
      templates: existing ? current.templates.map((item) => item.id === template.id ? template : item)
        : [...current.templates, template] });
  }
  async upsertDataset(companyId: Identifier, input: { readonly expectedCatalogRevision: number;
    readonly expectedDatasetRevision: number | null; readonly dataset: Omit<EvaluationDataset, "companyId" | "revision"> }) {
    const actorId = await this.#authorize(companyId, "ai-evaluations:dataset-write", "Register a digest-bound evaluation dataset");
    const current = await project(this.#events, companyId); this.#revision(current, input.expectedCatalogRevision);
    const assets = await projectAiAssetGraph(this.#events, companyId);
    if (!assets.assets.some(({ id }) => id === input.dataset.assetId)) throw new Error("AI_EVALUATION_ASSET_NOT_FOUND");
    const existing = current.datasets.find(({ id }) => id === input.dataset.id);
    if ((existing?.revision ?? null) !== input.expectedDatasetRevision) throw new Error("AI_EVALUATION_DATASET_REVISION_CONFLICT");
    const dataset = { ...input.dataset, companyId, revision: (existing?.revision ?? -1) + 1 };
    return this.#save(actorId, current, { ...current, revision: current.revision + 1,
      datasets: existing ? current.datasets.map((item) => item.id === dataset.id ? dataset : item)
        : [...current.datasets, dataset] });
  }
  async recordResult(companyId: Identifier, input: { readonly expectedCatalogRevision: number;
    readonly result: Omit<EvaluationResult, "companyId" | "evaluatorReference" | "evaluatorVersion" |
      "thresholdBps" | "outcome"> }) {
    const actorId = await this.#authorize(companyId, "ai-evaluations:result-write", "Record a provenance-bound evaluation result");
    const current = await project(this.#events, companyId); this.#revision(current, input.expectedCatalogRevision);
    if (current.results.some(({ id }) => id === input.result.id)) throw new Error("AI_EVALUATION_RESULT_EXISTS");
    const template = current.templates.find(({ id, status }) => id === input.result.templateId && status === "ACTIVE");
    if (!template) throw new Error("AI_EVALUATION_TEMPLATE_NOT_ACTIVE");
    const assets = await projectAiAssetGraph(this.#events, companyId);
    if (!assets.assets.some(({ id }) => id === input.result.assetId)) throw new Error("AI_EVALUATION_ASSET_NOT_FOUND");
    if (input.result.datasetId) {
      const dataset = current.datasets.find(({ id }) => id === input.result.datasetId);
      if (!dataset || dataset.assetId !== input.result.assetId) throw new Error("AI_EVALUATION_DATASET_NOT_FOUND");
    }
    if (input.result.traceId) {
      const traces = await this.#events.read(companyId, { types: ["operational-risk.assessed"] });
      if (!traces.some((event) => (event.payload as { trace?: { id?: Identifier } }).trace?.id === input.result.traceId)) {
        throw new Error("AI_EVALUATION_TRACE_NOT_FOUND");
      }
    }
    const result: EvaluationResult = { ...input.result, companyId,
      evaluatorReference: template.evaluatorReference, evaluatorVersion: template.evaluatorVersion,
      thresholdBps: template.passThresholdBps,
      outcome: input.result.scoreBps >= template.passThresholdBps ? "PASS" : "FAIL" };
    return this.#save(actorId, current, { ...current, revision: current.revision + 1,
      results: [...current.results, result] });
  }
  #revision(current: AiEvaluationCatalog, expected: number) { if (current.revision !== expected)
    throw new Error("AI_EVALUATION_CATALOG_REVISION_CONFLICT"); }
  async #authorize(companyId: Identifier, action: string, reason: string): Promise<Identifier> {
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== companyId) throw new Error("TENANT_MISMATCH");
    const receipt = await this.#identity.authorize({ companyId, action, resourceId: companyId, reason });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    return identity.actorId;
  }
  async #save(actorId: Identifier, current: AiEvaluationCatalog, next: AiEvaluationCatalog) {
    const catalog = validateAiEvaluationCatalog(next); const all = await this.#events.read(current.companyId);
    await this.#events.append({ id: this.#nextId(), companyId: current.companyId,
      type: "ai-evaluation-catalog.revised", actorId, occurredAt: this.#now(), provenance: "PRODUCTION",
      payload: { catalog } }, all.length);
    return { catalog, trends: projectEvaluationTrends(catalog) };
  }
}
