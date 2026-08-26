import type { Identifier } from "../core/control-plane.ts";
import type { WorkItem } from "../core/work.ts";
import type { WorkAttempt } from "../core/work-attempt.ts";
import type { ModelExecutionAuthority } from "../core/model-governance.ts";
import type { AgentExecutionPort } from "../ports/agent-execution-port.ts";
import type { ConnectorRuntimeSecurityPort } from "../ports/connector-runtime-security-port.ts";
import type { DurableControlPlaneStorePort } from "../ports/durable-control-plane-store-port.ts";
import { WorkAttemptService } from "./work-attempt-service.ts";

export interface ScheduleWorkAttemptCommand {
  readonly work: WorkItem;
  readonly responsibilityContractRevision: number;
  readonly authorizationReceiptId: Identifier;
  readonly dataAuthorizationIds?: readonly Identifier[];
  readonly modelAuthority?: ModelExecutionAuthority | null;
  readonly scheduledAt: string;
}

/** Creates one durable, idempotent first attempt for an admitted Work item. */
export class ScheduleWorkAttempt {
  readonly #store: DurableControlPlaneStorePort;
  readonly #attempts: WorkAttemptService;
  readonly #executionPorts: readonly AgentExecutionPort[];
  readonly #runtimeSecurity: ConnectorRuntimeSecurityPort;
  readonly #nextId: () => Identifier;

  constructor(dependencies: {
    readonly store: DurableControlPlaneStorePort;
    readonly executionPorts: readonly AgentExecutionPort[];
    readonly runtimeSecurity: ConnectorRuntimeSecurityPort;
    readonly nextId: () => Identifier;
  }) {
    this.#store = dependencies.store;
    this.#attempts = new WorkAttemptService(dependencies.store);
    this.#executionPorts = dependencies.executionPorts;
    this.#runtimeSecurity = dependencies.runtimeSecurity;
    this.#nextId = dependencies.nextId;
  }

  latestForWork(companyId: Identifier, workId: Identifier): Promise<WorkAttempt | null> {
    return this.#attempts.latestForWork(companyId, workId);
  }

  async execute(command: ScheduleWorkAttemptCommand): Promise<WorkAttempt> {
    const existing = await this.#attempts.latestForWork(command.work.companyId, command.work.id);
    if (existing) return existing;
    const contexts = await Promise.all(this.#executionPorts.map(async (port) => ({
      port,
      capabilities: await port.capabilities(),
      health: await port.health(),
    })));
    const context = contexts.find(({ capabilities }) =>
      capabilities.connectorId === command.work.runtimeConnectorId);
    if (!context) throw new Error("AGENT_EXECUTION_PORT_NOT_REGISTERED");
    if (context.health === "UNAVAILABLE") throw new Error("AGENT_EXECUTION_PORT_UNAVAILABLE");
    const scheduledAt = Date.parse(command.scheduledAt);
    if (!Number.isFinite(scheduledAt)) throw new Error("WORK_ATTEMPT_CREATED_AT_INVALID");
    const timeoutAt = new Date(scheduledAt + context.capabilities.maximumTimeoutSeconds * 1_000).toISOString();
    const events = await this.#store.read(command.work.companyId);
    try {
      return await this.#attempts.create({
        draft: {
          id: this.#nextId(),
          companyId: command.work.companyId,
          workId: command.work.id,
          agentId: command.work.agentId,
          attemptNumber: 1,
          idempotencyKey: `${command.work.companyId}:${command.work.id}:attempt:1`,
          timeoutAt,
          createdAt: command.scheduledAt,
          authority: {
            responsibilityContractId: command.work.responsibilityContractId,
            responsibilityContractRevision: command.responsibilityContractRevision,
            accountableHumanId: command.work.accountableHumanId,
            actionIds: command.work.actionIds,
            permissionIds: [command.authorizationReceiptId],
            dataAuthorizationIds: [...(command.dataAuthorizationIds ?? [])],
            connectorId: command.work.runtimeConnectorId,
            connectorCapabilityDigest: await this.#runtimeSecurity.digestCapabilities(context.capabilities),
            model: command.modelAuthority ?? null,
          },
        },
        eventId: this.#nextId(),
        publicationId: this.#nextId(),
        actorId: command.work.requestedBy,
        expectedEventSequence: events.length,
      });
    } catch (error) {
      if (error instanceof Error && /(?:EVENT_SEQUENCE_CONFLICT|Sequence conflict)/i.test(error.message)) {
        const raced = await this.#attempts.latestForWork(command.work.companyId, command.work.id);
        if (raced) return raced;
      }
      throw error;
    }
  }
}
