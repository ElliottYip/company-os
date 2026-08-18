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

interface JournalEntry {
  readonly workId: Identifier;
  readonly executionId: Identifier;
  readonly idempotencyKey: string;
  readonly status: WorkStatus;
  readonly summary: string;
}

export class JournalFixtureConnector implements AgentExecutionPort {
  readonly #connectorId: Identifier;
  readonly #journal: JournalEntry[] = [];

  constructor(connectorId: Identifier) { this.#connectorId = connectorId; }

  async capabilities(): Promise<AgentExecutionCapabilities> {
    return {
      connectorId: this.#connectorId,
      displayName: "Journal fixture (not a real Agent)",
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
    return { id: `journal-deployment-${agent.id}`, agentId: agent.id, connectorId: this.#connectorId };
  }
  async submit(deployment: AgentDeployment, request: WorkRequest, proof: RuntimeProof) {
    if (
      deployment.connectorId !== this.#connectorId ||
      proof.connectorId !== this.#connectorId ||
      deployment.agentId !== request.agentId
    ) throw new Error("Connector binding mismatch.");
    if (Date.parse(proof.expiresAt) <= Date.parse(request.timeoutAt)) throw new Error("Expired proof.");
    const first = this.#journal.find(({ workId }) => workId === request.id);
    if (first) {
      if (first.idempotencyKey !== request.idempotencyKey) throw new Error("Idempotency conflict.");
      return { accepted: true as const, executionId: first.executionId };
    }
    const executionId = `journal-execution-${request.id}`;
    this.#journal.push({
      workId: request.id,
      executionId,
      idempotencyKey: request.idempotencyKey,
      status: "WORKING",
      summary: "Fixture journal accepted work",
    });
    return { accepted: true as const, executionId };
  }
  async observe(workId: Identifier): Promise<readonly WorkObservation[]> {
    return this.#journal.filter((entry) => entry.workId === workId).map((entry, index) => ({
      workId,
      sequence: index + 1,
      status: entry.status,
      summary: entry.summary,
      evidenceRefs: [`fixture-journal-evidence-${index + 1}`],
      recordedAt: `2026-08-18T08:0${index + 1}:30.000Z`,
    }));
  }
  async pause(workId: Identifier, reason: string): Promise<void> {
    this.#append(workId, "WAITING", reason);
  }
  async resume(workId: Identifier, approvalId: Identifier): Promise<void> {
    if (!approvalId) throw new Error("Approval ID required.");
    this.#append(workId, "WORKING", "Fixture journal resumed after approval");
  }
  async cancel(workId: Identifier, reason: string): Promise<void> {
    this.#append(workId, "CANCELLED", reason);
  }
  #append(workId: Identifier, status: WorkStatus, summary: string): void {
    const first = this.#journal.find((entry) => entry.workId === workId);
    if (!first) throw new Error("Unknown fixture work.");
    this.#journal.push({ ...first, status, summary });
  }
}
