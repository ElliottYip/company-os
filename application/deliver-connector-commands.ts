import type { AgentDescriptor, Identifier, WorkRequest } from "../core/control-plane.ts";
import type { WorkItem } from "../core/work.ts";
import type { WorkAttempt } from "../core/work-attempt.ts";
import type { AgentExecutionCapabilities, AgentExecutionPort } from "../ports/agent-execution-port.ts";
import type { CompanyStructurePort } from "../ports/company-structure-port.ts";
import type { ConnectorRuntimeSecurityPort } from "../ports/connector-runtime-security-port.ts";
import type {
  DurableControlPlaneStorePort,
  OutboxPublication,
} from "../ports/durable-control-plane-store-port.ts";
import { WorkAttemptService } from "./work-attempt-service.ts";
import type { PreparedWorkExecution } from "./prepare-work-execution.ts";
import type { ModelProviderRuntimePort } from "../ports/model-provider-runtime-port.ts";
import type { ModelRuntimeSecurityPort } from "../ports/model-runtime-security-port.ts";

type ConnectorCommand = {
  readonly schemaVersion: 1;
  readonly operation: "SUBMIT" | "PAUSE" | "RESUME" | "CANCEL";
  readonly attemptId: Identifier;
  readonly workId: Identifier;
  readonly agentId: Identifier;
  readonly connectorId: Identifier;
  readonly idempotencyKey: string;
  readonly approvalRequestId?: Identifier | null;
  readonly controlReason?: "APPROVAL" | "RISK";
};

export interface ConnectorDeliveryOutcome {
  readonly publicationId: Identifier;
  readonly partitionKey: string;
  readonly status: "DELIVERED" | "RETRY_PENDING";
  readonly code: string;
}

const COMMAND_KEYS = new Set(["SUBMIT", "PAUSE", "RESUME", "CANCEL"]);
const STABLE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/;

function command(publication: OutboxPublication): ConnectorCommand {
  if (publication.topic !== "connector.commands" || !publication.payload ||
      typeof publication.payload !== "object" || Array.isArray(publication.payload)) {
    throw new Error("CONNECTOR_COMMAND_INVALID");
  }
  const value = publication.payload as Record<string, unknown>;
  if (value.schemaVersion !== 1 || typeof value.operation !== "string" ||
      !COMMAND_KEYS.has(value.operation) ||
      !["attemptId", "workId", "agentId", "connectorId", "idempotencyKey"]
        .every((key) => typeof value[key] === "string" && (value[key] as string).length > 0)) {
    throw new Error("CONNECTOR_COMMAND_INVALID");
  }
  if ((value.operation === "PAUSE" || value.operation === "RESUME") &&
      typeof value.approvalRequestId !== "string") {
    throw new Error("CONNECTOR_COMMAND_APPROVAL_REQUIRED");
  }
  if (value.controlReason !== undefined && !["APPROVAL", "RISK"].includes(String(value.controlReason))) {
    throw new Error("CONNECTOR_COMMAND_INVALID");
  }
  return value as unknown as ConnectorCommand;
}

function failureCode(error: unknown): string {
  if (error instanceof Error && STABLE_CODE.test(error.message)) return error.message;
  return "CONNECTOR_COMMAND_DELIVERY_FAILED";
}

function workRequest(
  work: WorkItem,
  attempt: WorkAttempt,
  preparation: PreparedWorkExecution | null,
): WorkRequest {
  return {
    id: work.id,
    companyId: work.companyId,
    agentId: work.agentId,
    requestedBy: work.requestedBy,
    goal: work.goal,
    input: {
      workAttemptId: attempt.id,
      actionReferences: [...work.actionIds],
      permissionReferences: [...attempt.authority.permissionIds],
      dataAuthorizationReferences: [...attempt.authority.dataAuthorizationIds],
      governedDataReferences: [...(preparation?.governedDataReferences ?? [])],
      dataEvidenceReferences: [...(preparation?.dataEvidenceReferences ?? [])],
      executionGrantReferences: [...(preparation?.executionGrantReferences ?? [])],
      responsibilityContractId: attempt.authority.responsibilityContractId,
      responsibilityContractRevision: attempt.authority.responsibilityContractRevision,
      ...(preparation?.modelBinding ? { modelBinding: structuredClone(preparation.modelBinding) } : {}),
    },
    idempotencyKey: attempt.idempotencyKey,
    timeoutAt: attempt.timeoutAt,
  };
}

/** Delivers durable Connector commands in order per WorkAttempt partition. */
export class DeliverConnectorCommands {
  readonly #store: DurableControlPlaneStorePort;
  readonly #structure: CompanyStructurePort;
  readonly #attempts: WorkAttemptService;
  readonly #executionPorts: readonly AgentExecutionPort[];
  readonly #runtimeSecurity: ConnectorRuntimeSecurityPort;
  readonly #modelProviders: readonly ModelProviderRuntimePort[];
  readonly #modelRuntimeSecurity: ModelRuntimeSecurityPort | null;
  readonly #now: () => string;
  readonly #nextId: () => Identifier;

  constructor(dependencies: {
    readonly store: DurableControlPlaneStorePort;
    readonly structure: CompanyStructurePort;
    readonly executionPorts: readonly AgentExecutionPort[];
    readonly runtimeSecurity: ConnectorRuntimeSecurityPort;
    readonly modelProviders?: readonly ModelProviderRuntimePort[];
    readonly modelRuntimeSecurity?: ModelRuntimeSecurityPort;
    readonly now: () => string;
    readonly nextId: () => Identifier;
  }) {
    this.#store = dependencies.store;
    this.#structure = dependencies.structure;
    this.#attempts = new WorkAttemptService(dependencies.store);
    this.#executionPorts = dependencies.executionPorts;
    this.#runtimeSecurity = dependencies.runtimeSecurity;
    this.#modelProviders = dependencies.modelProviders ?? [];
    this.#modelRuntimeSecurity = dependencies.modelRuntimeSecurity ?? null;
    this.#now = dependencies.now;
    this.#nextId = dependencies.nextId;
  }

  async execute(companyId: Identifier, limit = 100): Promise<readonly ConnectorDeliveryOutcome[]> {
    const pending = await this.#store.readPendingPublications(companyId, { afterSequence: 0, limit });
    const partitions = new Map<string, OutboxPublication[]>();
    for (const publication of pending) {
      const group = partitions.get(publication.partitionKey) ?? [];
      group.push(publication);
      partitions.set(publication.partitionKey, group);
    }
    const contexts = await this.#portContexts();
    const outcomes: ConnectorDeliveryOutcome[] = [];
    for (const publications of partitions.values()) {
      for (const publication of publications) {
        try {
          const payload = command(publication);
          if (payload.controlReason === "RISK" && await this.#riskDeliveryRecorded(companyId, publication.id)) {
            await this.#store.markPublicationDelivered(companyId, publication.id, this.#now());
            outcomes.push({ publicationId: publication.id, partitionKey: publication.partitionKey,
              status: "DELIVERED", code: "CONNECTOR_COMMAND_DELIVERED" });
            continue;
          }
          await this.#deliver(companyId, publication, contexts);
          if (payload.controlReason === "RISK") await this.#recordRiskDelivery(companyId, publication, payload);
          await this.#store.markPublicationDelivered(companyId, publication.id, this.#now());
          outcomes.push({
            publicationId: publication.id,
            partitionKey: publication.partitionKey,
            status: "DELIVERED",
            code: "CONNECTOR_COMMAND_DELIVERED",
          });
        } catch (error) {
          outcomes.push({
            publicationId: publication.id,
            partitionKey: publication.partitionKey,
            status: "RETRY_PENDING",
            code: failureCode(error),
          });
          break;
        }
      }
    }
    return outcomes;
  }

  async #riskDeliveryRecorded(companyId: Identifier, publicationId: Identifier): Promise<boolean> {
    return (await this.#store.read(companyId, { types: ["risk-containment.delivered", "risk-recovery.delivered"] })).some((event) =>
      (event.payload as { publicationId?: Identifier }).publicationId === publicationId);
  }

  async #recordRiskDelivery(companyId: Identifier, publication: OutboxPublication,
    payload: ConnectorCommand): Promise<void> {
    const occurredAt = this.#now();
    await this.#store.append({
      id: this.#nextId(), companyId, type: payload.operation === "RESUME"
        ? "risk-recovery.delivered" : "risk-containment.delivered", occurredAt,
      actorId: payload.connectorId, correlationId: payload.workId, provenance: "PRODUCTION",
      payload: { publicationId: publication.id, caseId: payload.approvalRequestId,
        attemptId: payload.attemptId, workId: payload.workId, operation: payload.operation,
        outcome: payload.operation === "RESUME" ? "RECOVERY_SUCCEEDED" : "PAUSE_SUCCEEDED" },
    }, (await this.#store.read(companyId)).length);
  }

  async #portContexts() {
    return Promise.all(this.#executionPorts.map(async (port) => {
      const capabilities = await port.capabilities();
      return { port, capabilities, health: await port.health() };
    }));
  }

  async #deliver(
    companyId: Identifier,
    publication: OutboxPublication,
    contexts: readonly {
      readonly port: AgentExecutionPort;
      readonly capabilities: AgentExecutionCapabilities;
      readonly health: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
    }[],
  ): Promise<void> {
    const payload = command(publication);
    if (payload.attemptId !== publication.partitionKey) throw new Error("CONNECTOR_COMMAND_PARTITION_MISMATCH");
    const attempt = await this.#attempts.load(companyId, payload.attemptId);
    if (!attempt || attempt.workId !== payload.workId || attempt.agentId !== payload.agentId ||
        attempt.authority.connectorId !== payload.connectorId ||
        attempt.idempotencyKey !== payload.idempotencyKey) {
      throw new Error("CONNECTOR_COMMAND_ATTEMPT_MISMATCH");
    }
    if (payload.operation === "SUBMIT" &&
        ["CANCELLED", "TIMED_OUT", "FAILED", "SUCCEEDED"].includes(attempt.status)) return;
    const context = contexts.find(({ capabilities }) => capabilities.connectorId === payload.connectorId);
    if (!context) throw new Error("AGENT_EXECUTION_PORT_NOT_REGISTERED");
    if (context.health === "UNAVAILABLE") throw new Error("AGENT_EXECUTION_PORT_UNAVAILABLE");
    const digest = await this.#runtimeSecurity.digestCapabilities(context.capabilities);
    if (digest !== attempt.authority.connectorCapabilityDigest) {
      throw new Error("CONNECTOR_CAPABILITY_DIGEST_CHANGED");
    }
    if (payload.operation === "SUBMIT") await this.#validateModelRuntime(attempt);
    if (payload.operation === "PAUSE" && !context.capabilities.supportsPause) {
      throw new Error("CONNECTOR_PAUSE_UNSUPPORTED");
    }
    if (payload.operation === "RESUME" && !context.capabilities.supportsResume) {
      throw new Error("CONNECTOR_RESUME_UNSUPPORTED");
    }
    if (payload.operation === "CANCEL" && !context.capabilities.supportsCancellation) {
      throw new Error("CONNECTOR_CANCEL_UNSUPPORTED");
    }
    if (payload.operation === "PAUSE") {
      await context.port.pause(payload.workId,
        `${payload.controlReason === "RISK" ? "risk" : "approval"}:${payload.approvalRequestId}`);
      return;
    }
    if (payload.operation === "RESUME") {
      await context.port.resume(payload.workId, payload.approvalRequestId as Identifier);
      return;
    }
    if (payload.operation === "CANCEL") {
      await context.port.cancel(payload.workId, "control-plane-cancelled");
      return;
    }
    const [structure, events] = await Promise.all([
      this.#structure.load(companyId),
      this.#store.read(companyId, { types: [
        "work.dispatched",
        "work-execution.preparation-requested",
        "work-execution.prepared",
      ] }),
    ]);
    if (!structure) throw new Error("CONNECTOR_SUBMIT_CONTEXT_NOT_FOUND");
    const agent = structure.organization.agents.find(({ id }) => id === payload.agentId);
    const work = events.flatMap(({ payload: value }) => {
      const candidate = (value as { readonly work?: WorkItem }).work;
      return candidate?.id === payload.workId ? [candidate] : [];
    }).at(-1);
    if (!agent || !work) throw new Error("CONNECTOR_SUBMIT_CONTEXT_NOT_FOUND");
    const preparationRequested = events.some((event) =>
      event.type === "work-execution.preparation-requested" &&
      (event.payload as { readonly workId?: Identifier }).workId === work.id);
    const preparation = events.flatMap((event) => {
      if (event.type !== "work-execution.prepared") return [];
      const candidate = (event.payload as { readonly preparation?: PreparedWorkExecution }).preparation;
      return candidate?.workId === work.id && candidate.workAttemptId === attempt.id
        ? [candidate]
        : [];
    }).at(-1) ?? null;
    if (preparationRequested && !preparation) throw new Error("WORK_EXECUTION_NOT_PREPARED");
    if (preparation &&
        JSON.stringify(preparation.dataAuthorizationReferences) !==
          JSON.stringify(attempt.authority.dataAuthorizationIds)) {
      throw new Error("WORK_EXECUTION_PREPARATION_AUTHORITY_MISMATCH");
    }
    const model = attempt.authority.model ?? null;
    const preparedModel = preparation?.modelBinding ?? null;
    if (Boolean(model) !== Boolean(preparedModel) || (model && preparedModel && (
      model.policyId !== preparedModel.policyId || model.routeId !== preparedModel.routeId ||
      model.providerAdapterId !== preparedModel.providerAdapterId ||
      model.modelReference !== preparedModel.modelReference ||
      model.classification !== preparedModel.classification || model.residency !== preparedModel.residency
    ))) {
      throw new Error("WORK_EXECUTION_MODEL_BINDING_MISMATCH");
    }
    if (model && (!preparedModel ||
        !preparation?.executionGrantReferences.includes(preparedModel.executionGrantReference))) {
      throw new Error("WORK_EXECUTION_MODEL_GRANT_REQUIRED");
    }
    const descriptor: AgentDescriptor = {
      id: agent.id,
      companyId,
      displayName: agent.name,
      runtimeConnectorId: agent.runtimeConnectorId,
      accountableHumanId: agent.accountableHumanId,
      role: structure.positions.find(({ principalId }) => principalId === agent.id)?.title ?? agent.role,
      autonomyLevel: agent.autonomyLevel,
    };
    const deployment = await context.port.deploy(descriptor);
    if (deployment.agentId !== agent.id || deployment.connectorId !== payload.connectorId) {
      throw new Error("CONNECTOR_DEPLOYMENT_MISMATCH");
    }
    const issuedAt = this.#now();
    const expiresAt = new Date(Date.parse(issuedAt) + 5 * 60_000).toISOString();
    const proof = await this.#runtimeSecurity.issueRuntimeProof({
      attemptId: attempt.id,
      connectorId: payload.connectorId,
      capabilityDigest: digest,
      issuedAt,
      expiresAt,
    });
    await context.port.submit(deployment, workRequest(work, attempt, preparation), proof);
    await this.#markRemoteExecutionStarted(attempt);
  }

  async #validateModelRuntime(attempt: WorkAttempt): Promise<void> {
    const model = attempt.authority.model ?? null;
    if (!model) return;
    if (!this.#modelRuntimeSecurity) throw new Error("MODEL_RUNTIME_SECURITY_UNAVAILABLE");
    const contexts = await Promise.all(this.#modelProviders.map(async (provider) => ({
      capabilities: await provider.capabilities(), health: await provider.health(),
    })));
    const context = contexts.find(({ capabilities }) =>
      capabilities.providerAdapterId === model.providerAdapterId);
    if (!context) throw new Error("MODEL_PROVIDER_NOT_INSTALLED");
    if (context.health === "UNAVAILABLE") throw new Error("MODEL_PROVIDER_UNAVAILABLE");
    if (!context.capabilities.modelReferences.includes(model.modelReference) ||
        !context.capabilities.supportedResidencies.includes(model.residency)) {
      throw new Error("MODEL_ROUTE_CAPABILITY_MISMATCH");
    }
    const digest = await this.#modelRuntimeSecurity.digestCapabilities(context.capabilities);
    if (digest !== model.providerCapabilityDigest) {
      throw new Error("MODEL_PROVIDER_CAPABILITY_DIGEST_CHANGED");
    }
  }

  async #markRemoteExecutionStarted(original: WorkAttempt): Promise<void> {
    let attempt = await this.#attempts.load(original.companyId, original.id) ?? original;
    if (attempt.status === "QUEUED") {
      const acquiredAt = this.#now();
      const expiresAt = new Date(Date.parse(attempt.timeoutAt) - 1).toISOString();
      if (Date.parse(expiresAt) <= Date.parse(acquiredAt)) throw new Error("WORK_ATTEMPT_TIMEOUT_REACHED");
      attempt = await this.#attempts.transition({
        operation: "ACQUIRE_LEASE", companyId: attempt.companyId, attemptId: attempt.id,
        eventId: this.#nextId(), actorId: attempt.authority.connectorId, occurredAt: acquiredAt,
        expectedEventSequence: (await this.#store.read(attempt.companyId)).length,
        lease: { ownerId: attempt.authority.connectorId, fencingToken: attempt.lastFencingToken + 1,
          acquiredAt, expiresAt },
      });
    }
    if (attempt.status === "LEASED") {
      await this.#attempts.transition({
        operation: "START", companyId: attempt.companyId, attemptId: attempt.id,
        eventId: this.#nextId(), actorId: attempt.authority.connectorId, occurredAt: this.#now(),
        expectedEventSequence: (await this.#store.read(attempt.companyId)).length,
        fencingToken: attempt.lastFencingToken,
      });
    }
  }
}
