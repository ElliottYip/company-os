import type {
  AgentDeployment,
  AgentExecutionCapabilities,
  AgentExecutionPort,
  RuntimeProof,
} from "../../ports/agent-execution-port.ts";
import type {
  AgentDescriptor,
  Identifier,
  WorkObservation,
  WorkRequest,
  WorkStatus,
} from "../../core/control-plane.ts";

interface ExecutionState {
  readonly executionId: Identifier;
  readonly idempotencyKey: string;
  readonly observations: WorkObservation[];
}

export class StateMachineFixtureConnector implements AgentExecutionPort {
  readonly #connectorId: Identifier;
  readonly #executions = new Map<Identifier, ExecutionState>();

  constructor(connectorId: Identifier) {
    this.#connectorId = connectorId;
  }

  async capabilities(): Promise<AgentExecutionCapabilities> {
    return {
      connectorId: this.#connectorId,
      displayName: "State machine fixture (not a real Agent)",
      protocolVersion: "1.0",
      supportsPause: true,
      supportsResume: true,
      supportsCancellation: true,
      supportsEvidence: true,
      maximumTimeoutSeconds: 300,
    };
  }

  async health(): Promise<"HEALTHY"> { return "HEALTHY"; }

  async deploy(agent: AgentDescriptor): Promise<AgentDeployment> {
    if (agent.runtimeConnectorId !== this.#connectorId) throw new Error("Connector mismatch.");
    return { id: `deployment-${agent.id}`, agentId: agent.id, connectorId: this.#connectorId };
  }

  async submit(deployment: AgentDeployment, request: WorkRequest, proof: RuntimeProof) {
    this.#validate(deployment, request, proof);
    const existing = this.#executions.get(request.id);
    if (existing) {
      if (existing.idempotencyKey !== request.idempotencyKey) throw new Error("Idempotency conflict.");
      return { accepted: true as const, executionId: existing.executionId };
    }
    const executionId = `execution-${request.id}`;
    this.#executions.set(request.id, {
      executionId,
      idempotencyKey: request.idempotencyKey,
      observations: [this.#observation(request.id, 1, "WORKING", "Fixture accepted work")],
    });
    return { accepted: true as const, executionId };
  }

  async observe(workId: Identifier): Promise<readonly WorkObservation[]> {
    return structuredClone(this.#required(workId).observations);
  }

  async pause(workId: Identifier, reason: string): Promise<void> {
    this.#transition(workId, "WAITING", reason);
  }
  async resume(workId: Identifier, approvalId: Identifier): Promise<void> {
    if (!approvalId) throw new Error("Approval ID required.");
    this.#transition(workId, "WORKING", "Fixture resumed after approval");
  }
  async cancel(workId: Identifier, reason: string): Promise<void> {
    this.#transition(workId, "CANCELLED", reason);
  }

  #validate(deployment: AgentDeployment, request: WorkRequest, proof: RuntimeProof): void {
    if (deployment.connectorId !== this.#connectorId || proof.connectorId !== this.#connectorId) {
      throw new Error("Connector proof mismatch.");
    }
    if (deployment.agentId !== request.agentId) throw new Error("Agent deployment mismatch.");
    if (Date.parse(proof.expiresAt) <= Date.parse(request.timeoutAt)) {
      throw new Error("Runtime proof expires before work timeout.");
    }
  }

  #required(workId: Identifier): ExecutionState {
    const state = this.#executions.get(workId);
    if (!state) throw new Error("Unknown fixture work.");
    return state;
  }

  #transition(workId: Identifier, status: WorkStatus, summary: string): void {
    const state = this.#required(workId);
    state.observations.push(this.#observation(workId, state.observations.length + 1, status, summary));
  }

  #observation(workId: Identifier, sequence: number, status: WorkStatus, summary: string): WorkObservation {
    return {
      workId,
      sequence,
      status,
      summary,
      evidenceRefs: [`fixture-evidence-${sequence}`],
      recordedAt: `2026-08-18T08:0${sequence}:00.000Z`,
    };
  }
}
