import type {
  DecideHighRiskActionCommand,
} from "./decide-high-risk-action.ts";
import type {
  DispatchAccountableWorkInput,
} from "./dispatch-accountable-work.ts";
import type { Identifier } from "../core/control-plane.ts";
import type { ApprovalBinding } from "../ports/approval-publication-port.ts";

interface FormalAgentBossApiDependencies {
  readonly projection: { execute(companyId: Identifier): Promise<unknown> };
  readonly dispatch: { execute(input: DispatchAccountableWorkInput): Promise<unknown> };
  readonly approvals: { execute(command: DecideHighRiskActionCommand): Promise<unknown> };
}

export interface FormalApprovalDecisionInput {
  readonly expectedBinding: ApprovalBinding;
  readonly decision: "APPROVED" | "REJECTED";
  readonly note?: string;
}

/** Thin application facade consumed by HTTP and other first-party transports. */
export class FormalAgentBossApi {
  readonly #dependencies: FormalAgentBossApiDependencies;

  constructor(dependencies: FormalAgentBossApiDependencies) {
    this.#dependencies = dependencies;
  }

  getAgentBoss(companyId: Identifier): Promise<unknown> {
    return this.#dependencies.projection.execute(companyId);
  }

  dispatchWork(companyId: Identifier, input: DispatchAccountableWorkInput): Promise<unknown> {
    return this.#dependencies.dispatch.execute({
      ...input,
      draft: { ...input.draft, companyId },
    });
  }

  decideApproval(
    companyId: Identifier,
    requestId: Identifier,
    input: FormalApprovalDecisionInput,
  ): Promise<unknown> {
    return this.#dependencies.approvals.execute({
      companyId,
      requestId,
      expectedBinding: structuredClone(input.expectedBinding),
      decision: input.decision,
      ...(input.note ? { note: input.note } : {}),
    });
  }
}
