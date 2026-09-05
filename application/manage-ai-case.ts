import { transitionAiCase, type AiCaseOperation } from "../core/operational-risk.ts";
import type { Identifier } from "../core/control-plane.ts";
import type { AgentExecutionPort } from "../ports/agent-execution-port.ts";
import type { DurableControlPlaneStorePort, OutboxPublicationDraft } from "../ports/durable-control-plane-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import { projectOperationalRiskEvents } from "./get-operational-risk-projection.ts";

export interface ManageAiCaseInput {
  readonly companyId: Identifier;
  readonly caseId: Identifier;
  readonly operation: AiCaseOperation;
  readonly expectedRevision: number;
  readonly reason: string;
  readonly rootCause?: string;
  readonly remediation?: string;
  readonly prevention?: string;
}

export class ManageAiCase {
  readonly #dependencies: {
    readonly identity: IdentityPort;
    readonly events: DurableControlPlaneStorePort;
    readonly executionPorts: readonly AgentExecutionPort[];
    readonly now: () => string;
    readonly nextId: () => Identifier;
  };

  constructor(dependencies: {
    readonly identity: IdentityPort;
    readonly events: DurableControlPlaneStorePort;
    readonly executionPorts: readonly AgentExecutionPort[];
    readonly now: () => string;
    readonly nextId: () => Identifier;
  }) { this.#dependencies = dependencies; }

  async execute(input: ManageAiCaseInput) {
    const identity = await this.#dependencies.identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== input.companyId) throw new Error("TENANT_MISMATCH");
    const events = await this.#dependencies.events.read(input.companyId);
    const projection = projectOperationalRiskEvents(events, input.companyId, this.#dependencies.now());
    const current = projection.cases.find(({ id }) => id === input.caseId);
    if (!current) throw new Error("AI_CASE_NOT_FOUND");
    const receipt = await this.#dependencies.identity.authorize({ companyId: input.companyId,
      action: `ai-case:${input.operation.toLowerCase().replaceAll("_", "-")}`, resourceId: input.caseId,
      reason: input.reason.trim() });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    const occurredAt = this.#dependencies.now();
    const record = transitionAiCase(current, { operation: input.operation,
      expectedRevision: input.expectedRevision, actorId: identity.actorId, reason: input.reason,
      ...(input.rootCause ? { rootCause: input.rootCause } : {}),
      ...(input.remediation ? { remediation: input.remediation } : {}),
      ...(input.prevention ? { prevention: input.prevention } : {}), occurredAt });
    const publications: OutboxPublicationDraft[] = [];
    if (input.operation === "RECOVER") {
      const attempts = events.flatMap((event) => {
        const attempt = (event.payload as { attempt?: { id?: Identifier; workId?: Identifier; agentId?: Identifier;
          idempotencyKey?: string; authority?: { connectorId?: Identifier } } }).attempt;
        return attempt?.workId === current.workId ? [attempt] : [];
      });
      const attempt = attempts.at(-1);
      if (!attempt?.id || !attempt.agentId || !attempt.idempotencyKey || !attempt.authority?.connectorId) {
        throw new Error("AI_CASE_RECOVERY_ATTEMPT_NOT_FOUND");
      }
      let supported = false;
      for (const port of this.#dependencies.executionPorts) {
        const capabilities = await port.capabilities();
        if (capabilities.connectorId === attempt.authority.connectorId) {
          supported = capabilities.supportsResume;
          break;
        }
      }
      if (!supported) throw new Error("AI_CASE_RECOVERY_UNSUPPORTED");
      publications.push({ id: this.#dependencies.nextId(), companyId: input.companyId,
        topic: "connector.commands", partitionKey: attempt.id, occurredAt,
        payload: { schemaVersion: 1, operation: "RESUME", attemptId: attempt.id,
          workId: current.workId, agentId: attempt.agentId, connectorId: attempt.authority.connectorId,
          idempotencyKey: attempt.idempotencyKey, approvalRequestId: current.id, controlReason: "RISK" } });
    }
    await this.#dependencies.events.commit({ event: { id: this.#dependencies.nextId(), companyId: input.companyId,
      type: "ai-case.revised", occurredAt, actorId: identity.actorId, provenance: "PRODUCTION",
      correlationId: current.workId, payload: { operation: input.operation, case: record,
        reason: input.reason.trim(), authorizationReceiptId: receipt.id } }, publications,
      expectedEventSequence: events.length });
    return structuredClone(record);
  }
}
