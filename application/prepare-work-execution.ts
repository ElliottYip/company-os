import type { Identifier } from "../core/control-plane.ts";
import type { DataClassification, DataOperation } from "../core/data-governance.ts";
import type { SecretLeaseGrant, SecretLeaseIntent } from "../core/secret-governance.ts";
import type { WorkItem } from "../core/work.ts";
import type { WorkAttempt } from "../core/work-attempt.ts";
import type { ModelRoutingIntent } from "../core/model-governance.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { GovernedDataAccessOutcome } from "./access-governed-data.ts";

const IDENTIFIER = /^[a-z0-9][a-z0-9-]{0,63}$/;
const REASON_CODE = /^[A-Z][A-Z0-9_]{2,63}$/;

export interface WorkDataAccessPreparation {
  readonly requestId: Identifier;
  readonly contractId: Identifier;
  readonly dataSourceId: Identifier;
  readonly operation: DataOperation;
  readonly purpose: string;
  readonly classification: DataClassification;
  readonly destinationId: Identifier | null;
  readonly contentDigest: string | null;
}

export interface WorkSecretLeasePreparation {
  readonly secretReferenceId: Identifier;
  readonly expectedVersion: number;
  readonly reasonCode: string;
  readonly leaseDurationSeconds: number;
}

/** Secret-free preparation requested before a Work command may leave the control plane. */
export interface WorkExecutionPreparationPlan {
  readonly dataAccess: readonly WorkDataAccessPreparation[];
  readonly secretLeases: readonly WorkSecretLeasePreparation[];
  readonly modelRouting?: ModelRoutingIntent | null;
}

export interface PreparedModelBinding {
  readonly policyId: Identifier;
  readonly routeId: Identifier;
  readonly providerAdapterId: Identifier;
  readonly modelReference: Identifier;
  readonly classification: DataClassification;
  readonly residency: "MANAGED_CLOUD" | "LOCAL";
  /** Opaque Broker grant bound to this model provider and Work Attempt. */
  readonly executionGrantReference: Identifier;
}

export interface PreparedWorkExecution {
  readonly workId: Identifier;
  readonly workAttemptId: Identifier;
  readonly dataAuthorizationReferences: readonly Identifier[];
  readonly governedDataReferences: readonly Identifier[];
  readonly dataEvidenceReferences: readonly Identifier[];
  readonly executionGrantReferences: readonly Identifier[];
  readonly modelBinding?: PreparedModelBinding | null;
  readonly recordedAt: string;
}

interface DataAccessExecutor {
  execute(input: {
    readonly requestId: Identifier;
    readonly contractId: Identifier;
    readonly request: {
      readonly companyId: Identifier;
      readonly workId: Identifier;
      readonly agentId: Identifier;
      readonly dataSourceId: Identifier;
      readonly operation: DataOperation;
      readonly purpose: string;
      readonly classification: DataClassification;
      readonly destinationId: Identifier | null;
      readonly contentDigest: string | null;
      readonly requestedAt: string;
    };
  }): Promise<GovernedDataAccessOutcome>;
}

interface SecretLeaseExecutor {
  execute(intent: SecretLeaseIntent): Promise<SecretLeaseGrant>;
}

function preparedFrom(value: unknown, attemptId: Identifier): PreparedWorkExecution | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = (value as { readonly preparation?: PreparedWorkExecution }).preparation;
  return candidate?.workAttemptId === attemptId ? structuredClone(candidate) : null;
}

function uniqueIds(values: readonly string[], code: string): void {
  if (values.some((value) => !IDENTIFIER.test(value)) || new Set(values).size !== values.length) {
    throw new Error(code);
  }
}

export function validateWorkExecutionPreparationPlan(
  plan: WorkExecutionPreparationPlan,
): WorkExecutionPreparationPlan {
  if (!plan || !Array.isArray(plan.dataAccess) || !Array.isArray(plan.secretLeases) ||
      plan.dataAccess.length > 32 || plan.secretLeases.length > 16) {
    throw new Error("WORK_EXECUTION_PREPARATION_INVALID");
  }
  uniqueIds(plan.dataAccess.map(({ requestId }) => requestId), "DATA_ACCESS_REQUEST_ID_INVALID");
  uniqueIds(plan.dataAccess.map(({ contractId }) => contractId), "DATA_AUTHORIZATION_ID_INVALID");
  uniqueIds(plan.secretLeases.map(({ secretReferenceId }) => secretReferenceId), "SECRET_REFERENCE_ID_INVALID");
  for (const item of plan.dataAccess) {
    if (!IDENTIFIER.test(item.dataSourceId) || !item.purpose.trim() || item.purpose.length > 256) {
      throw new Error("DATA_ACCESS_PREPARATION_INVALID");
    }
  }
  for (const item of plan.secretLeases) {
    if (!Number.isSafeInteger(item.expectedVersion) || item.expectedVersion < 1 ||
        !Number.isSafeInteger(item.leaseDurationSeconds) || item.leaseDurationSeconds < 30 ||
        item.leaseDurationSeconds > 900 || !REASON_CODE.test(item.reasonCode)) {
      throw new Error("SECRET_LEASE_PREPARATION_INVALID");
    }
  }
  if (plan.modelRouting) {
    if (!IDENTIFIER.test(plan.modelRouting.companyId) || !IDENTIFIER.test(plan.modelRouting.policyId) ||
        !["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"].includes(plan.modelRouting.classification) ||
        !["MANAGED_CLOUD", "LOCAL"].includes(plan.modelRouting.requiredResidency)) {
      throw new Error("MODEL_ROUTING_INTENT_INVALID");
    }
  }
  return structuredClone(plan);
}

/**
 * Composes policy evaluation and opaque broker leases. Enterprise records and
 * credential material remain in their customer-owned nodes.
 */
export class PrepareWorkExecution {
  readonly #events: EventDataStorePort;
  readonly #dataAccess?: DataAccessExecutor;
  readonly #secretLeases?: SecretLeaseExecutor;
  readonly #now: () => string;
  readonly #nextId: () => Identifier;

  constructor(dependencies: {
    readonly events: EventDataStorePort;
    readonly dataAccess?: DataAccessExecutor;
    readonly secretLeases?: SecretLeaseExecutor;
    readonly now: () => string;
    readonly nextId: () => Identifier;
  }) {
    this.#events = dependencies.events;
    this.#dataAccess = dependencies.dataAccess;
    this.#secretLeases = dependencies.secretLeases;
    this.#now = dependencies.now;
    this.#nextId = dependencies.nextId;
  }

  async execute(input: {
    readonly work: WorkItem;
    readonly attempt: WorkAttempt;
    readonly plan: WorkExecutionPreparationPlan;
  }): Promise<PreparedWorkExecution> {
    const { work, attempt } = input;
    if (attempt.companyId !== work.companyId || attempt.workId !== work.id ||
        attempt.agentId !== work.agentId || attempt.authority.connectorId !== work.runtimeConnectorId) {
      throw new Error("WORK_EXECUTION_PREPARATION_BINDING_MISMATCH");
    }
    const plan = validateWorkExecutionPreparationPlan(input.plan);
    const model = attempt.authority.model ?? null;
    const modelIntent = plan.modelRouting ?? null;
    if (Boolean(model) !== Boolean(modelIntent) ||
        (model && modelIntent && (modelIntent.companyId !== work.companyId ||
          modelIntent.policyId !== model.policyId || modelIntent.classification !== model.classification ||
          modelIntent.requiredResidency !== model.residency))) {
      throw new Error("WORK_EXECUTION_MODEL_BINDING_MISMATCH");
    }
    if (model && plan.secretLeases.some(({ secretReferenceId }) =>
      secretReferenceId === model.credentialReferenceId)) {
      throw new Error("WORK_EXECUTION_MODEL_LEASE_DUPLICATE");
    }
    const existingEvents = await this.#events.read(work.companyId);
    const prior = existingEvents.flatMap((event) => event.type === "work-execution.prepared"
      ? [preparedFrom(event.payload, attempt.id)].filter((value): value is PreparedWorkExecution => Boolean(value))
      : []).at(-1);
    if (prior) return prior;

    const now = this.#now();
    const dataOutcomes: GovernedDataAccessOutcome[] = [];
    for (const item of plan.dataAccess) {
      if (!this.#dataAccess) throw new Error("DATA_CONNECTOR_NOT_INSTALLED");
      const outcome = await this.#dataAccess.execute({
        requestId: item.requestId,
        contractId: item.contractId,
        request: {
          companyId: work.companyId, workId: work.id, agentId: work.agentId,
          dataSourceId: item.dataSourceId, operation: item.operation,
          purpose: item.purpose.trim(), classification: item.classification,
          destinationId: item.destinationId, contentDigest: item.contentDigest,
          requestedAt: now,
        },
      });
      if (outcome.decision.type !== "GRANTED") {
        throw new Error("DATA_ACCESS_DENIED");
      }
      if (!outcome.result || outcome.result.type !== "GRANTED") {
        throw new Error("DATA_ACCESS_NOT_PREPARED");
      }
      dataOutcomes.push(outcome);
    }

    const grants: SecretLeaseGrant[] = [];
    for (const item of plan.secretLeases) {
      if (!this.#secretLeases) throw new Error("SECRET_BROKER_NOT_INSTALLED");
      const requestedExpiry = Date.parse(now) + item.leaseDurationSeconds * 1_000;
      const expiresAt = new Date(Math.min(requestedExpiry, Date.parse(attempt.timeoutAt) - 1)).toISOString();
      if (Date.parse(expiresAt) <= Date.parse(now)) throw new Error("SECRET_LEASE_EXPIRY_INVALID");
      grants.push(await this.#secretLeases.execute({
        companyId: work.companyId,
        secretReferenceId: item.secretReferenceId,
        expectedVersion: item.expectedVersion,
        consumerId: attempt.authority.connectorId,
        workAttemptId: attempt.id,
        reasonCode: item.reasonCode,
        expiresAt,
      }));
    }
    let modelGrant: SecretLeaseGrant | null = null;
    if (model) {
      if (!this.#secretLeases) throw new Error("SECRET_BROKER_NOT_INSTALLED");
      const expiresAt = new Date(Math.min(
        Date.parse(now) + 5 * 60_000,
        Date.parse(attempt.timeoutAt) - 1,
      )).toISOString();
      if (Date.parse(expiresAt) <= Date.parse(now)) throw new Error("SECRET_LEASE_EXPIRY_INVALID");
      modelGrant = await this.#secretLeases.execute({
        companyId: work.companyId,
        secretReferenceId: model.credentialReferenceId,
        expectedVersion: model.credentialVersion,
        consumerId: model.providerAdapterId,
        workAttemptId: attempt.id,
        reasonCode: "MODEL_INFERENCE",
        expiresAt,
      });
      grants.push(modelGrant);
    }

    const preparation: PreparedWorkExecution = {
      workId: work.id,
      workAttemptId: attempt.id,
      dataAuthorizationReferences: plan.dataAccess.map(({ contractId }) => contractId),
      governedDataReferences: dataOutcomes.map(({ result }) =>
        (result as Extract<NonNullable<GovernedDataAccessOutcome["result"]>, { type: "GRANTED" }>).dataReference),
      dataEvidenceReferences: dataOutcomes.map(({ result }) =>
        (result as Extract<NonNullable<GovernedDataAccessOutcome["result"]>, { type: "GRANTED" }>).evidenceReference),
      executionGrantReferences: grants.map(({ id }) => id),
      ...(model ? { modelBinding: {
        policyId: model.policyId,
        routeId: model.routeId,
        providerAdapterId: model.providerAdapterId,
        modelReference: model.modelReference,
        classification: model.classification,
        residency: model.residency,
        executionGrantReference: (modelGrant as SecretLeaseGrant).id,
      } } : {}),
      recordedAt: this.#now(),
    };
    const current = await this.#events.read(work.companyId);
    await this.#events.append({
      id: this.#nextId(), companyId: work.companyId, type: "work-execution.prepared",
      occurredAt: preparation.recordedAt, actorId: work.requestedBy, correlationId: work.id,
      payload: { preparation: structuredClone(preparation) }, provenance: "PRODUCTION",
    }, current.length);
    return structuredClone(preparation);
  }
}
