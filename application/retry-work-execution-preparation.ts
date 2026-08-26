import type { Identifier } from "../core/control-plane.ts";
import type { WorkItem } from "../core/work.ts";
import type { WorkAttempt } from "../core/work-attempt.ts";
import type { DurableControlPlaneStorePort } from "../ports/durable-control-plane-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import {
  validateWorkExecutionPreparationPlan,
  type PreparedWorkExecution,
  type WorkExecutionPreparationPlan,
} from "./prepare-work-execution.ts";
import { WorkAttemptService } from "./work-attempt-service.ts";

export interface RetryWorkExecutionPreparationResult {
  readonly preparation: PreparedWorkExecution;
  readonly connectorDelivery: readonly unknown[];
}

/**
 * Resumes the crash window without background impersonation. The exact formal
 * initiator must authenticate again, so policy and Broker authorization run
 * under a current human session.
 */
export class RetryWorkExecutionPreparation {
  readonly #identity: IdentityPort;
  readonly #store: DurableControlPlaneStorePort;
  readonly #attempts: WorkAttemptService;
  readonly #preparation: {
    execute(input: {
      readonly work: WorkItem;
      readonly attempt: WorkAttempt;
      readonly plan: WorkExecutionPreparationPlan;
    }): Promise<PreparedWorkExecution>;
  };
  readonly #delivery: { execute(companyId: Identifier): Promise<readonly unknown[]> };

  constructor(dependencies: {
    readonly identity: IdentityPort;
    readonly store: DurableControlPlaneStorePort;
    readonly preparation: {
      execute(input: {
        readonly work: WorkItem;
        readonly attempt: WorkAttempt;
        readonly plan: WorkExecutionPreparationPlan;
      }): Promise<PreparedWorkExecution>;
    };
    readonly delivery: { execute(companyId: Identifier): Promise<readonly unknown[]> };
  }) {
    this.#identity = dependencies.identity;
    this.#store = dependencies.store;
    this.#attempts = new WorkAttemptService(dependencies.store);
    this.#preparation = dependencies.preparation;
    this.#delivery = dependencies.delivery;
  }

  async execute(input: {
    readonly companyId: Identifier;
    readonly workId: Identifier;
    readonly attemptId: Identifier;
  }): Promise<RetryWorkExecutionPreparationResult> {
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== input.companyId) throw new Error("TENANT_MISMATCH");
    const events = await this.#store.read(input.companyId);
    const work = events.flatMap((event) => {
      if (event.type !== "work.dispatched" || event.provenance !== "PRODUCTION") return [];
      const candidate = (event.payload as { readonly work?: WorkItem }).work;
      return candidate?.id === input.workId ? [candidate] : [];
    }).at(-1);
    if (!work) throw new Error("WORK_NOT_FOUND");
    if (work.requestedBy !== identity.actorId) throw new Error("WORK_PREPARATION_INITIATOR_REQUIRED");
    const planValue = events.flatMap((event) => {
      if (event.type !== "work-execution.preparation-requested" || event.provenance !== "PRODUCTION") return [];
      const payload = event.payload as {
        readonly workId?: Identifier;
        readonly plan?: WorkExecutionPreparationPlan;
      };
      return payload.workId === input.workId && payload.plan ? [payload.plan] : [];
    }).at(-1);
    if (!planValue) throw new Error("WORK_EXECUTION_PREPARATION_NOT_FOUND");
    const plan = validateWorkExecutionPreparationPlan(planValue);
    const attempt = await this.#attempts.load(input.companyId, input.attemptId);
    if (!attempt || attempt.workId !== work.id || attempt.agentId !== work.agentId ||
        attempt.authority.connectorId !== work.runtimeConnectorId) {
      throw new Error("WORK_EXECUTION_PREPARATION_BINDING_MISMATCH");
    }
    if (attempt.status !== "QUEUED") throw new Error("WORK_PREPARATION_RETRY_NOT_PENDING");
    const preparation = await this.#preparation.execute({ work, attempt, plan });
    const connectorDelivery = await this.#delivery.execute(input.companyId);
    return { preparation, connectorDelivery };
  }
}
