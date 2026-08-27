import type { AgentPortfolioRecord } from "../core/agent-portfolio.ts";
import type { Identifier } from "../core/control-plane.ts";
import type { ExternalWorkInput } from "../core/cross-source-work.ts";
import type { FederatedPortfolioSourcePort } from "../ports/federated-portfolio-source-port.ts";

type OutcomeStatus = "RECORDED" | "REPLAYED" | "UPDATED";

interface OutcomeCounts {
  recorded: number;
  replayed: number;
  updated: number;
}

function counts(): OutcomeCounts {
  return { recorded: 0, replayed: 0, updated: 0 };
}

function record(count: OutcomeCounts, status: OutcomeStatus): void {
  if (status === "RECORDED") count.recorded += 1;
  else if (status === "REPLAYED") count.replayed += 1;
  else count.updated += 1;
}

export class SynchronizeFederatedSource {
  readonly #sources: ReadonlyMap<Identifier, FederatedPortfolioSourcePort>;
  readonly #agents: {
    synchronize(record: AgentPortfolioRecord): Promise<{ readonly status: OutcomeStatus }>;
  };
  readonly #work: {
    synchronizeFederated(record: ExternalWorkInput): Promise<{ readonly status: OutcomeStatus }>;
  };

  constructor(dependencies: {
    readonly sources: readonly FederatedPortfolioSourcePort[];
    readonly agents: {
      synchronize(record: AgentPortfolioRecord): Promise<{ readonly status: OutcomeStatus }>;
    };
    readonly work: {
      synchronizeFederated(record: ExternalWorkInput): Promise<{ readonly status: OutcomeStatus }>;
    };
  }) {
    const sources = new Map<Identifier, FederatedPortfolioSourcePort>();
    for (const source of dependencies.sources) {
      if (sources.has(source.connectorId)) throw new Error("FEDERATED_SOURCE_DUPLICATE");
      sources.set(source.connectorId, source);
    }
    this.#sources = sources;
    this.#agents = dependencies.agents;
    this.#work = dependencies.work;
  }

  async execute(input: { readonly companyId: Identifier; readonly connectorId: Identifier }) {
    const source = this.#sources.get(input.connectorId);
    if (!source) throw new Error("FEDERATED_SOURCE_NOT_FOUND");
    if (source.companyId !== input.companyId) throw new Error("FEDERATED_SOURCE_TENANT_MISMATCH");
    let snapshot: Awaited<ReturnType<FederatedPortfolioSourcePort["synchronize"]>>;
    try {
      snapshot = await source.synchronize();
    } catch {
      throw new Error("FEDERATED_SOURCE_UNAVAILABLE");
    }
    if (snapshot.inventory.length > 200 || snapshot.work.length > 200 || snapshot.anomalies.length > 200) {
      throw new Error("FEDERATED_SOURCE_BATCH_TOO_LARGE");
    }
    if (snapshot.inventory.some(({ companyId }) => companyId !== input.companyId) ||
        snapshot.work.some(({ companyId }) => companyId !== input.companyId)) {
      throw new Error("FEDERATED_SOURCE_TENANT_MISMATCH");
    }
    if (snapshot.anomalies.some(({ code, externalId }) =>
      !/^[A-Z][A-Z0-9_]{2,79}$/.test(code) ||
      !/^[\p{L}\p{N}._:/@#-]{1,240}$/u.test(externalId))) {
      throw new Error("FEDERATED_SOURCE_ANOMALY_INVALID");
    }

    const inventory = counts();
    const work = counts();
    for (const item of snapshot.inventory) {
      record(inventory, (await this.#agents.synchronize(item)).status);
    }
    for (const item of snapshot.work) {
      record(work, (await this.#work.synchronizeFederated(item)).status);
    }
    return {
      connectorId: source.connectorId,
      inventory,
      work,
      anomalies: snapshot.anomalies.map((anomaly) => ({ ...anomaly })),
    };
  }
}
