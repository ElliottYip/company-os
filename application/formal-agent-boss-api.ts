import type {
  DecideHighRiskActionCommand,
} from "./decide-high-risk-action.ts";
import type {
  DispatchAccountableWorkInput,
} from "./dispatch-accountable-work.ts";
import type { Identifier } from "../core/control-plane.ts";
import type { ApprovalBinding } from "../ports/approval-publication-port.ts";
import type { ConnectorRegistration } from "../core/connector.ts";
import type { GovernanceCatalog } from "../core/governance-catalog.ts";
import type { ResponsibilityContract } from "../core/responsibility.ts";
import type { AgentLifecycleOperation, AgentLifecycleRecord } from "../core/agent-lifecycle.ts";
import type { AgentBossProjection } from "./get-agent-boss-projection.ts";

export interface FormalWorkCatalogItem {
  readonly work: AgentBossProjection["work"][number];
  readonly attempts: readonly AgentBossProjection["attempts"][number][];
}

export interface FormalWorkCatalog {
  readonly schemaVersion: 1;
  readonly items: readonly FormalWorkCatalogItem[];
  readonly nextCursor: string | null;
}

interface FormalAgentBossApiDependencies {
  readonly projection: { execute(companyId: Identifier): Promise<unknown> };
  readonly administration?: { execute(companyId: Identifier): Promise<unknown> };
  readonly dispatch: { execute(input: DispatchAccountableWorkInput): Promise<unknown> };
  readonly approvals: { execute(command: DecideHighRiskActionCommand): Promise<unknown> };
  readonly connectorRegistry?: {
    replace(input: {
      readonly companyId: Identifier;
      readonly expectedRevision: number;
      readonly connectors: readonly ConnectorRegistration[];
      readonly recordedAt: string;
    }): Promise<unknown>;
  };
  readonly governanceRegistry?: {
    replace(input: GovernanceCatalog & {
      readonly expectedRevision: number;
      readonly recordedAt: string;
    }): Promise<unknown>;
  };
  readonly responsibilityRegistry?: {
    replace(
      companyId: Identifier,
      contracts: readonly ResponsibilityContract[],
      expectedRevision: number,
    ): Promise<unknown>;
  };
  readonly now?: () => string;
  readonly agentLifecycle?: {
    execute(input: {
      readonly companyId: Identifier;
      readonly agentId: Identifier;
      readonly operation: AgentLifecycleOperation;
      readonly expectedRevision: number;
      readonly pauseReason?: AgentLifecycleRecord["pauseReason"];
    }): Promise<unknown>;
  };
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

  async listWork(companyId: Identifier, input: { readonly cursor: number; readonly limit: number }): Promise<FormalWorkCatalog> {
    const projection = await this.#dependencies.projection.execute(companyId) as AgentBossProjection;
    const items = projection.work.slice(input.cursor, input.cursor + input.limit).map((work) => ({
      work: structuredClone(work),
      attempts: projection.attempts.filter(({ workId }) => workId === work.id).map((attempt) => structuredClone(attempt)),
    }));
    const next = input.cursor + items.length;
    return { schemaVersion: 1, items, nextCursor: next < projection.work.length ? String(next) : null };
  }

  async getWork(companyId: Identifier, workId: Identifier): Promise<FormalWorkCatalogItem> {
    const projection = await this.#dependencies.projection.execute(companyId) as AgentBossProjection;
    const work = projection.work.find(({ id }) => id === workId);
    if (!work) throw new Error("WORK_NOT_FOUND");
    return {
      work: structuredClone(work),
      attempts: projection.attempts.filter(({ workId: candidate }) => candidate === workId)
        .map((attempt) => structuredClone(attempt)),
    };
  }

  getAdministration(companyId: Identifier): Promise<unknown> {
    if (!this.#dependencies.administration) throw new Error("FORMAL_API_UNAVAILABLE");
    return this.#dependencies.administration.execute(companyId);
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

  replaceConnectorCatalog(
    companyId: Identifier,
    input: { readonly expectedRevision: number; readonly connectors: readonly ConnectorRegistration[] },
  ): Promise<unknown> {
    const registry = this.#dependencies.connectorRegistry;
    if (!registry || !this.#dependencies.now) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
    return registry.replace({
      companyId,
      expectedRevision: input.expectedRevision,
      connectors: structuredClone(input.connectors),
      recordedAt: this.#dependencies.now(),
    });
  }

  replaceGovernanceCatalog(
    companyId: Identifier,
    input: Omit<GovernanceCatalog, "companyId"> & { readonly expectedRevision: number },
  ): Promise<unknown> {
    const registry = this.#dependencies.governanceRegistry;
    if (!registry || !this.#dependencies.now) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
    return registry.replace({
      companyId,
      expectedRevision: input.expectedRevision,
      modelRoutingPolicies: structuredClone(input.modelRoutingPolicies),
      dataAuthorizationContracts: structuredClone(input.dataAuthorizationContracts),
      recordedAt: this.#dependencies.now(),
    });
  }

  replaceResponsibilityContracts(
    companyId: Identifier,
    input: { readonly expectedRevision: number; readonly contracts: readonly ResponsibilityContract[] },
  ): Promise<unknown> {
    const registry = this.#dependencies.responsibilityRegistry;
    if (!registry) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
    return registry.replace(companyId, structuredClone(input.contracts), input.expectedRevision);
  }

  transitionAgentLifecycle(
    companyId: Identifier,
    agentId: Identifier,
    input: {
      readonly operation: AgentLifecycleOperation;
      readonly expectedRevision: number;
      readonly pauseReason?: AgentLifecycleRecord["pauseReason"];
    },
  ): Promise<unknown> {
    if (!this.#dependencies.agentLifecycle) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
    return this.#dependencies.agentLifecycle.execute({ companyId, agentId, ...input });
  }
}
