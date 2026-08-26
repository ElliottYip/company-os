import type { CompanyDomainEvent, ConnectorUsageOutput, Identifier, WorkObservation } from "../core/control-plane.ts";
import type { WorkAttempt } from "../core/work-attempt.ts";
import type { AgentExecutionPort } from "../ports/agent-execution-port.ts";
import type { ApprovalPublicationPort } from "../ports/approval-publication-port.ts";
import type { DurableControlPlaneStorePort } from "../ports/durable-control-plane-store-port.ts";
import { WorkAttemptService } from "./work-attempt-service.ts";

export interface ConnectorObservationOutcome {
  readonly attemptId: Identifier;
  readonly sequence: number;
  readonly status: "RECORDED" | "REPLAYED";
}

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const STATUSES = new Set(["PENDING", "WORKING", "WAITING", "BLOCKED", "AWAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED"]);

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`).join(",")}}`;
}

function validate(observation: WorkObservation, attempt: WorkAttempt): WorkObservation {
  if (observation.workId !== attempt.workId || !Number.isSafeInteger(observation.sequence) || observation.sequence < 1 ||
      !STATUSES.has(observation.status) || !observation.summary.trim() || [...observation.summary].length > 2_000 ||
      !Number.isFinite(Date.parse(observation.recordedAt)) ||
      observation.evidenceRefs.some((value) => !ID.test(value)) ||
      new Set(observation.evidenceRefs).size !== observation.evidenceRefs.length) {
    throw new Error("CONNECTOR_OBSERVATION_INVALID");
  }
  const outputs = observation.evidenceOutputs ?? [];
  if (new Set(outputs.map(({ evidenceReference }) => evidenceReference)).size !== outputs.length ||
      outputs.some(({ evidenceReference, contentDigest }) =>
        !ID.test(evidenceReference) || !DIGEST.test(contentDigest) || !observation.evidenceRefs.includes(evidenceReference))) {
    throw new Error("CONNECTOR_EVIDENCE_INVALID");
  }
  const usage = observation.usageOutputs ?? [];
  const billingTypes = ["metered_api", "subscription_included", "subscription_overage", "credits", "fixed", "unknown"];
  if (usage.length > 128 || new Set(usage.map(({ usageReference }) => usageReference)).size !== usage.length ||
      usage.some((item: ConnectorUsageOutput) => !ID.test(item.usageReference) || !ID.test(item.biller) ||
        !billingTypes.includes(item.billingType) || !["reported", "unpriced"].includes(item.costStatus) ||
        ![item.inputTokens, item.cachedInputTokens, item.outputTokens, item.costCents]
          .every((count) => Number.isSafeInteger(count) && count >= 0) ||
        item.costStatus === "unpriced" && item.costCents !== 0 ||
        !Number.isFinite(Date.parse(item.occurredAt)) || Date.parse(item.occurredAt) > Date.parse(observation.recordedAt) ||
        !outputs.some(({ evidenceReference }) => evidenceReference === item.usageReference))) {
    throw new Error("CONNECTOR_USAGE_INVALID");
  }
  if (observation.status === "COMPLETED" && (!observation.resultReference || !ID.test(observation.resultReference))) {
    throw new Error("CONNECTOR_RESULT_REQUIRED");
  }
  if (observation.resultReference !== undefined && observation.resultReference !== null && !ID.test(observation.resultReference)) {
    throw new Error("CONNECTOR_RESULT_INVALID");
  }
  if (observation.status === "AWAITING_APPROVAL") {
    const request = observation.approvalRequest;
    if (!request || !ID.test(request.requestId) || !attempt.authority.actionIds.includes(request.action.id) ||
        !["HIGH", "CRITICAL"].includes(request.action.risk) || !DIGEST.test(request.action.inputDigest) ||
        !request.action.type.trim() || !request.action.description.trim() ||
        !Number.isFinite(Date.parse(request.expiresAt)) ||
        Date.parse(request.expiresAt) <= Date.parse(observation.recordedAt) ||
        Date.parse(request.expiresAt) > Date.parse(attempt.timeoutAt)) {
      throw new Error("CONNECTOR_APPROVAL_REQUEST_INVALID");
    }
  } else if (observation.approvalRequest) throw new Error("CONNECTOR_APPROVAL_REQUEST_INVALID");
  return structuredClone({ ...observation, summary: observation.summary.trim(), evidenceOutputs: outputs,
    usageOutputs: usage });
}

/** Pulls ordered, bounded Connector observations into the durable responsibility record. */
export class CollectConnectorObservations {
  readonly #attempts: WorkAttemptService;
  readonly #dependencies: {
    readonly store: DurableControlPlaneStorePort;
    readonly executionPorts: readonly AgentExecutionPort[];
    readonly approvals?: ApprovalPublicationPort;
    readonly usageIngestion?: { execute(input: {
      readonly attempt: WorkAttempt;
      readonly usageOutputs: readonly ConnectorUsageOutput[];
      readonly evidenceOutputs: NonNullable<WorkObservation["evidenceOutputs"]>;
      readonly observationRecordedAt: string;
      readonly projectId: Identifier | null;
      readonly goalId: Identifier | null;
    }): Promise<readonly unknown[]> };
    readonly nextId: () => Identifier;
  };
  constructor(dependencies: {
    readonly store: DurableControlPlaneStorePort;
    readonly executionPorts: readonly AgentExecutionPort[];
    readonly approvals?: ApprovalPublicationPort;
    readonly usageIngestion?: { execute(input: {
      readonly attempt: WorkAttempt;
      readonly usageOutputs: readonly ConnectorUsageOutput[];
      readonly evidenceOutputs: NonNullable<WorkObservation["evidenceOutputs"]>;
      readonly observationRecordedAt: string;
      readonly projectId: Identifier | null;
      readonly goalId: Identifier | null;
    }): Promise<readonly unknown[]> };
    readonly nextId: () => Identifier;
  }) { this.#dependencies = dependencies; this.#attempts = new WorkAttemptService(dependencies.store); }

  async execute(companyId: Identifier): Promise<readonly ConnectorObservationOutcome[]> {
    const events = await this.#dependencies.store.read(companyId);
    const latest = new Map<Identifier, WorkAttempt>();
    const recordedByAttempt = new Map<Identifier, Map<number, WorkObservation>>();
    const workScope = new Map<Identifier, { readonly projectId: Identifier | null; readonly goalId: Identifier | null }>();
    for (const event of events) {
      if (event.type === "work-attempt.recorded") {
        const attempt = (event.payload as { attempt?: WorkAttempt }).attempt;
        if (attempt?.companyId === companyId) latest.set(attempt.id, attempt);
      }
      if (event.type === "work.dispatched") {
        const payload = event.payload as { readonly work?: { readonly id?: Identifier; readonly projectId?: Identifier | null };
          readonly genericGoalId?: Identifier | null };
        if (payload.work?.id) workScope.set(payload.work.id, {
          projectId: payload.work.projectId ?? null, goalId: payload.genericGoalId ?? null,
        });
      }
      if (event.type === "connector.observation.recorded") {
        const payload = event.payload as { attemptId?: Identifier; observation?: WorkObservation };
        if (!payload.attemptId || !payload.observation) continue;
        const observations = recordedByAttempt.get(payload.attemptId) ?? new Map<number, WorkObservation>();
        observations.set(payload.observation.sequence, payload.observation);
        recordedByAttempt.set(payload.attemptId, observations);
      }
    }
    const outcomes: ConnectorObservationOutcome[] = [];
    for (const initial of latest.values()) {
      if (!["RUNNING", "AWAITING_APPROVAL", "CANCELLATION_REQUESTED"].includes(initial.status)) continue;
      const port = await this.#port(initial);
      const observations = [...await port.observe(initial.workId)].sort((a, b) => a.sequence - b.sequence);
      const recordedObservations = recordedByAttempt.get(initial.id) ?? new Map<number, WorkObservation>();
      let latestSequence = Math.max(0, ...recordedObservations.keys());
      for (const raw of observations) {
        const observation = validate(raw, initial);
        const prior = recordedObservations.get(observation.sequence);
        const recorded = prior !== undefined;
        if (prior && canonicalJson(prior) !== canonicalJson(observation)) {
          throw new Error("CONNECTOR_OBSERVATION_SEQUENCE_CONFLICT");
        }
        if (!recorded && observation.sequence !== latestSequence + 1) {
          throw new Error("CONNECTOR_OBSERVATION_SEQUENCE_GAP");
        }
        if (observation.usageOutputs?.length) {
          if (!this.#dependencies.usageIngestion) throw new Error("CONNECTOR_USAGE_INGESTION_REQUIRED");
          const scope = workScope.get(initial.workId) ?? { projectId: null, goalId: null };
          await this.#dependencies.usageIngestion.execute({
            attempt: initial, usageOutputs: observation.usageOutputs,
            evidenceOutputs: observation.evidenceOutputs ?? [],
            observationRecordedAt: observation.recordedAt,
            projectId: scope.projectId, goalId: scope.goalId,
          });
        }
        if (!recorded) {
          const event: CompanyDomainEvent = {
            id: this.#dependencies.nextId(), companyId, type: "connector.observation.recorded",
            occurredAt: observation.recordedAt, actorId: initial.authority.connectorId,
            correlationId: initial.workId, provenance: "PRODUCTION",
            payload: { attemptId: initial.id, observation },
          };
          await this.#dependencies.store.append(event, (await this.#dependencies.store.read(companyId)).length);
          recordedObservations.set(observation.sequence, observation);
          latestSequence = observation.sequence;
        }
        await this.#applyTerminal(companyId, initial.id, observation);
        await this.#applyApproval(companyId, initial.id, observation);
        outcomes.push({ attemptId: initial.id, sequence: observation.sequence, status: recorded ? "REPLAYED" : "RECORDED" });
      }
    }
    return outcomes;
  }

  async #port(attempt: WorkAttempt): Promise<AgentExecutionPort> {
    for (const port of this.#dependencies.executionPorts) {
      if ((await port.capabilities()).connectorId === attempt.authority.connectorId) return port;
    }
    throw new Error("AGENT_EXECUTION_PORT_NOT_REGISTERED");
  }

  async #applyTerminal(companyId: Identifier, attemptId: Identifier, observation: WorkObservation): Promise<void> {
    const current = await this.#attempts.load(companyId, attemptId);
    if (!current || (current.status !== "RUNNING" && current.status !== "CANCELLATION_REQUESTED")) return;
    const operation = observation.status === "COMPLETED" ? "COMPLETE"
      : observation.status === "FAILED" ? "COMPLETE"
      : observation.status === "CANCELLED" ? "CANCEL" : null;
    if (!operation) return;
    const base = {
      companyId: current.companyId, attemptId: current.id, eventId: this.#dependencies.nextId(),
      actorId: current.authority.connectorId, occurredAt: observation.recordedAt,
      expectedEventSequence: (await this.#dependencies.store.read(current.companyId)).length,
    } as const;
    if (operation === "COMPLETE") await this.#attempts.transition({ ...base, operation,
      fencingToken: current.lastFencingToken,
      outcome: observation.status === "COMPLETED" ? "SUCCEEDED" : "FAILED",
      resultId: observation.status === "COMPLETED" ? observation.resultReference ?? null : null });
    else await this.#attempts.transition({ ...base, operation, fencingToken: current.lastFencingToken });
  }

  async #applyApproval(companyId: Identifier, attemptId: Identifier, observation: WorkObservation): Promise<void> {
    if (observation.status !== "AWAITING_APPROVAL" || !observation.approvalRequest) return;
    if (!this.#dependencies.approvals) throw new Error("APPROVAL_PUBLICATION_PORT_REQUIRED");
    const current = await this.#attempts.load(companyId, attemptId);
    if (!current) throw new Error("WORK_ATTEMPT_NOT_FOUND");
    const proposal = observation.approvalRequest;
    const resolved = await this.#dependencies.approvals.decision(proposal.requestId);
    if (resolved) {
      if (current.status === "AWAITING_APPROVAL" && current.pendingApprovalId === proposal.requestId) {
        const base = { companyId, attemptId, eventId: this.#dependencies.nextId(),
          publicationId: this.#dependencies.nextId(), actorId: resolved.decidedBy,
          occurredAt: resolved.decidedAt,
          expectedEventSequence: (await this.#dependencies.store.read(companyId)).length,
          fencingToken: current.lastFencingToken } as const;
        if (resolved.decision === "APPROVED") await this.#attempts.transition({
          ...base, operation: "RESUME", approvalRequestId: proposal.requestId,
        });
        else await this.#attempts.transition({ ...base, operation: "CANCEL" });
      }
      return;
    }
    await this.#dependencies.approvals.publishRequest({
      id: proposal.requestId, companyId, status: "AWAITING_APPROVAL",
      requestedAt: observation.recordedAt, expiresAt: proposal.expiresAt,
      binding: {
        action: structuredClone(proposal.action), workId: current.workId,
        responsibilityContractId: current.authority.responsibilityContractId,
        executingAgentId: current.agentId,
        accountableHumanId: current.authority.accountableHumanId,
        evidenceReferences: [...observation.evidenceRefs],
        resultReference: observation.resultReference ?? null,
      },
    });
    const latest = await this.#attempts.load(companyId, attemptId);
    if (latest?.status === "RUNNING") await this.#attempts.transition({
      operation: "PAUSE", companyId, attemptId, eventId: this.#dependencies.nextId(),
      publicationId: this.#dependencies.nextId(), actorId: latest.authority.connectorId,
      occurredAt: observation.recordedAt,
      expectedEventSequence: (await this.#dependencies.store.read(companyId)).length,
      fencingToken: latest.lastFencingToken, approvalRequestId: proposal.requestId,
    });
  }

}
