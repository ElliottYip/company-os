import {
  evaluateOperationalRisk,
  validateRuntimeTrace,
  type AiCase,
  type OperationalRiskRule,
  type RiskAlert,
  type RiskContainment,
  type RuntimeTrace,
} from "../core/operational-risk.ts";
import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";
import type { AgentExecutionPort } from "../ports/agent-execution-port.ts";
import type { DurableControlPlaneStorePort } from "../ports/durable-control-plane-store-port.ts";
import { WorkAttemptService } from "./work-attempt-service.ts";

export interface ProcessOperationalRiskObservationInput {
  readonly companyId: Identifier;
  readonly attemptId: Identifier;
  readonly trace: RuntimeTrace;
  readonly rules: readonly OperationalRiskRule[];
}

export class ProcessOperationalRiskObservation {
  readonly #dependencies: {
    readonly events: DurableControlPlaneStorePort;
    readonly executionPorts: readonly AgentExecutionPort[];
    readonly nextId: () => Identifier;
  };
  readonly #attempts: WorkAttemptService;

  constructor(dependencies: {
    readonly events: DurableControlPlaneStorePort;
    readonly executionPorts: readonly AgentExecutionPort[];
    readonly nextId: () => Identifier;
  }) {
    this.#dependencies = dependencies;
    this.#attempts = new WorkAttemptService(dependencies.events);
  }

  async execute(input: ProcessOperationalRiskObservationInput) {
    const trace = validateRuntimeTrace(input.trace);
    const existing = await this.#dependencies.events.read(input.companyId, { types: ["operational-risk.assessed"] });
    if (existing.some((event) => (event.payload as { trace?: RuntimeTrace }).trace?.id === trace.id)) {
      return { status: "REPLAYED" as const, trace, accessEdges: [], violations: [], alerts: [], cases: [] };
    }
    const attempt = await this.#attempts.load(input.companyId, input.attemptId);
    if (!attempt) throw new Error("WORK_ATTEMPT_NOT_FOUND");
    if (trace.companyId !== input.companyId || trace.attemptId !== attempt.id || trace.workId !== attempt.workId ||
        trace.agentId !== attempt.agentId) throw new Error("RUNTIME_TRACE_AUTHORITY_MISMATCH");
    const evaluated = evaluateOperationalRisk(trace, input.rules, this.#dependencies.nextId);
    const alerts: RiskAlert[] = [];
    const cases: AiCase[] = [];
    const containment = await this.#containment(attempt.authority.connectorId,
      evaluated.violations.map(({ severity }) => severity));
    for (const violation of evaluated.violations) {
      const applicableContainment = ["HIGH", "CRITICAL"].includes(violation.severity)
        ? containment : "NOT_REQUIRED";
      const alert: RiskAlert = {
        id: this.#dependencies.nextId(), companyId: input.companyId, violationId: violation.id,
        severity: violation.severity, status: "OPEN",
        containment: applicableContainment, openedAt: trace.recordedAt, resolvedAt: null,
      };
      alerts.push(alert);
      if (["HIGH", "CRITICAL"].includes(violation.severity)) {
        const record: AiCase = {
          id: this.#dependencies.nextId(), companyId: input.companyId, alertIds: [alert.id],
          workId: trace.workId, agentId: trace.agentId,
          accountableHumanId: attempt.authority.accountableHumanId,
          ownerHumanId: attempt.authority.accountableHumanId,
          status: "OPEN", revision: 0,
          containment: applicableContainment, summary: violation.summary, rootCause: null, remediation: null, prevention: null,
          openedAt: trace.recordedAt, updatedAt: trace.recordedAt, closedAt: null,
        };
        cases.push(record);
      }
    }
    const event: CompanyDomainEvent = {
      id: this.#dependencies.nextId(), companyId: input.companyId, type: "operational-risk.assessed",
      actorId: attempt.authority.connectorId, occurredAt: trace.recordedAt, correlationId: trace.workId,
      provenance: "PRODUCTION", payload: { trace, accessEdges: evaluated.accessEdges,
        violations: evaluated.violations, alerts, cases },
    };
    const publications = containment === "PAUSE_REQUESTED" && cases.length ? [{
      id: this.#dependencies.nextId(), companyId: input.companyId, topic: "connector.commands",
      partitionKey: attempt.id, occurredAt: trace.recordedAt,
      payload: { schemaVersion: 1, operation: "PAUSE", attemptId: attempt.id, workId: attempt.workId,
        agentId: attempt.agentId, connectorId: attempt.authority.connectorId,
        idempotencyKey: attempt.idempotencyKey, approvalRequestId: cases[0]!.id, controlReason: "RISK" },
    }] : [];
    await this.#dependencies.events.commit({ event, publications,
      expectedEventSequence: (await this.#dependencies.events.read(input.companyId)).length });
    return { status: "RECORDED" as const, trace, ...evaluated, alerts, cases };
  }

  async #containment(connectorId: Identifier, severities: readonly string[]): Promise<RiskContainment> {
    if (!severities.some((severity) => ["HIGH", "CRITICAL"].includes(severity))) return "NOT_REQUIRED";
    for (const candidate of this.#dependencies.executionPorts) {
      const capabilities = await candidate.capabilities();
      if (capabilities.connectorId === connectorId) return capabilities.supportsPause
        ? "PAUSE_REQUESTED" : "UNSUPPORTED";
    }
    return "UNSUPPORTED";
  }
}
