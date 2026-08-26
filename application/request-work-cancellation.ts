import type { Identifier } from "../core/control-plane.ts";
import type { AgentExecutionPort } from "../ports/agent-execution-port.ts";
import type { DurableControlPlaneStorePort } from "../ports/durable-control-plane-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import { WorkAttemptService } from "./work-attempt-service.ts";

interface Dependencies {
  identity: IdentityPort;
  store: DurableControlPlaneStorePort;
  executionPorts: readonly AgentExecutionPort[];
  deliver: { execute(companyId: Identifier): Promise<readonly unknown[]> };
  now: () => string;
  nextId: () => Identifier;
}

/** Accepts a human cancellation request without claiming the external run has stopped. */
export class RequestWorkCancellation {
  readonly #attempts: WorkAttemptService;
  readonly #dependencies: Dependencies;
  constructor(dependencies: Dependencies) {
    this.#dependencies = dependencies;
    this.#attempts = new WorkAttemptService(dependencies.store);
  }

  async execute(input: { companyId: Identifier; workId: Identifier; attemptId: Identifier }) {
    const identity = await this.#dependencies.identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== input.companyId) throw new Error("TENANT_MISMATCH");
    const attempt = await this.#attempts.load(input.companyId, input.attemptId);
    if (!attempt || attempt.workId !== input.workId) throw new Error("WORK_ATTEMPT_NOT_FOUND");
    if (attempt.status === "CANCELLED" || attempt.status === "CANCELLATION_REQUESTED") return attempt;
    const receipt = await this.#dependencies.identity.authorize({
      companyId: input.companyId,
      action: "work:cancel",
      resourceId: input.workId,
      reason: "Request cancellation of one accountable Work attempt",
    });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    if (attempt.status !== "QUEUED") {
      const port = await this.#executionPort(attempt.authority.connectorId);
      if (!(await port.capabilities()).supportsCancellation) throw new Error("CONNECTOR_CANCEL_UNSUPPORTED");
    }
    const base = {
      companyId: input.companyId,
      attemptId: input.attemptId,
      eventId: this.#dependencies.nextId(),
      actorId: identity.actorId,
      occurredAt: this.#dependencies.now(),
      expectedEventSequence: (await this.#dependencies.store.read(input.companyId)).length,
    } as const;
    if (attempt.status === "QUEUED") {
      return this.#attempts.transition({ ...base, operation: "CANCEL", fencingToken: null });
    }
    const requested = await this.#attempts.transition({
      ...base,
      operation: "REQUEST_CANCEL",
      publicationId: this.#dependencies.nextId(),
      fencingToken: attempt.lastFencingToken,
    });
    await this.#dependencies.deliver.execute(input.companyId);
    return requested;
  }

  async #executionPort(connectorId: Identifier): Promise<AgentExecutionPort> {
    for (const port of this.#dependencies.executionPorts) {
      if ((await port.capabilities()).connectorId === connectorId) return port;
    }
    throw new Error("AGENT_EXECUTION_PORT_NOT_REGISTERED");
  }
}
