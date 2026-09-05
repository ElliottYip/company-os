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
    const existing = await this.#dependencies.events.read(input.companyId, { types: ["runtime-trace.recorded"] });
    if (existing.some((event) => (event.payload as { trace?: RuntimeTrace }).trace?.id === trace.id)) {
      return { status: "REPLAYED" as const, trace, accessEdges: [], violations: [], alerts: [], cases: [] };
    }
    const attempt = await this.#attempts.load(input.companyId, input.attemptId);
    if (!attempt) throw new Error("WORK_ATTEMPT_NOT_FOUND");
    if (trace.companyId !== input.companyId || trace.attemptId !== attempt.id || trace.workId !== attempt.workId ||
        trace.agentId !== attempt.agentId) throw new Error("RUNTIME_TRACE_AUTHORITY_MISMATCH");
    const evaluated = evaluateOperationalRisk(trace, input.rules, this.#dependencies.nextId);
    await this.#append(input.companyId, "runtime-trace.recorded", attempt.authority.connectorId,
      trace.recordedAt, { trace }, trace.workId);
    if (evaluated.accessEdges.length) await this.#append(input.companyId, "access-map.recorded",
      attempt.authority.connectorId, trace.recordedAt, { traceId: trace.id, edges: evaluated.accessEdges }, trace.workId);

    const alerts: RiskAlert[] = [];
    const cases: AiCase[] = [];
    for (const violation of evaluated.violations) {
      await this.#append(input.companyId, "policy-violation.recorded", attempt.authority.connectorId,
        trace.recordedAt, { violation }, trace.workId);
      const containment = await this.#contain(attempt.authority.connectorId, trace.workId, violation.summary,
        violation.severity);
      const alert: RiskAlert = {
        id: this.#dependencies.nextId(), companyId: input.companyId, violationId: violation.id,
        severity: violation.severity, status: containment === "PAUSE_SUCCEEDED" ? "CONTAINED" : "OPEN",
        containment, openedAt: trace.recordedAt, resolvedAt: null,
      };
      alerts.push(alert);
      await this.#append(input.companyId, "risk-alert.recorded", attempt.authority.connectorId,
        trace.recordedAt, { alert }, trace.workId);
      if (["HIGH", "CRITICAL"].includes(violation.severity)) {
        const record: AiCase = {
          id: this.#dependencies.nextId(), companyId: input.companyId, alertIds: [alert.id],
          workId: trace.workId, agentId: trace.agentId,
          accountableHumanId: attempt.authority.accountableHumanId,
          ownerHumanId: attempt.authority.accountableHumanId,
          status: containment === "PAUSE_SUCCEEDED" ? "CONTAINED" : "OPEN", revision: 0,
          containment, summary: violation.summary, rootCause: null, remediation: null, prevention: null,
          openedAt: trace.recordedAt, updatedAt: trace.recordedAt, closedAt: null,
        };
        cases.push(record);
        await this.#append(input.companyId, "ai-case.recorded", attempt.authority.connectorId,
          trace.recordedAt, { case: record }, trace.workId);
      }
    }
    return { status: "RECORDED" as const, trace, ...evaluated, alerts, cases };
  }

  async #contain(connectorId: Identifier, workId: Identifier, reason: string,
    severity: string): Promise<RiskContainment> {
    if (!["HIGH", "CRITICAL"].includes(severity)) return "NOT_REQUIRED";
    let port: AgentExecutionPort | null = null;
    let supportsPause = false;
    for (const candidate of this.#dependencies.executionPorts) {
      const capabilities = await candidate.capabilities();
      if (capabilities.connectorId === connectorId) {
        port = candidate;
        supportsPause = capabilities.supportsPause;
        break;
      }
    }
    if (!port || !supportsPause) return "UNSUPPORTED";
    try {
      await port.pause(workId, reason);
      return "PAUSE_SUCCEEDED";
    } catch {
      return "PAUSE_FAILED";
    }
  }

  async #append(companyId: Identifier, type: string, actorId: Identifier, occurredAt: string,
    payload: unknown, correlationId: Identifier): Promise<void> {
    const event: CompanyDomainEvent = { id: this.#dependencies.nextId(), companyId, type, actorId,
      occurredAt, payload, correlationId, provenance: "PRODUCTION" };
    await this.#dependencies.events.append(event, (await this.#dependencies.events.read(companyId)).length);
  }
}
