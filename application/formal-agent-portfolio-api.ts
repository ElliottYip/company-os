import type { Identifier } from "../core/control-plane.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

interface AgentPortfolioService {
  list(companyId: Identifier): Promise<unknown>;
  synchronize(input: never): Promise<unknown>;
}

interface ExternalWorkService {
  list(companyId: Identifier): Promise<unknown>;
  registerObserved(input: never): Promise<unknown>;
  synchronizeFederated(input: never): Promise<unknown>;
}

interface CommercialService {
  projection(companyId: Identifier): Promise<unknown>;
  synchronizeSubscription(input: never): Promise<unknown>;
  recordCredentialStatus(input: never): Promise<unknown>;
  importUsage(input: never): Promise<unknown>;
  requestRenewal(input: never): Promise<unknown>;
}

/** Identity- and tenant-bound facade for neutral connector and Web transports. */
export class FormalAgentPortfolioApi {
  readonly #identity: IdentityPort;
  readonly #agents: AgentPortfolioService;
  readonly #work: ExternalWorkService;
  readonly #commercial: CommercialService;

  constructor(dependencies: {
    readonly identity: IdentityPort;
    readonly agents: AgentPortfolioService;
    readonly work: ExternalWorkService;
    readonly commercial: CommercialService;
  }) {
    this.#identity = dependencies.identity;
    this.#agents = dependencies.agents;
    this.#work = dependencies.work;
    this.#commercial = dependencies.commercial;
  }

  async listAgents(companyId: Identifier) {
    await this.#context(companyId);
    return this.#agents.list(companyId);
  }

  async synchronizeAgent(companyId: Identifier, input: unknown) {
    await this.#context(companyId);
    return this.#agents.synchronize(this.#tenantBound(companyId, input) as never);
  }

  async listExternalWork(companyId: Identifier) {
    await this.#context(companyId);
    return this.#work.list(companyId);
  }

  async registerObservedWork(companyId: Identifier, input: unknown) {
    await this.#authorize(companyId, "portfolio-work:observe");
    return this.#work.registerObserved(this.#tenantBound(companyId, input) as never);
  }

  async synchronizeFederatedWork(companyId: Identifier, input: unknown) {
    await this.#authorize(companyId, "portfolio-work:federated-sync");
    return this.#work.synchronizeFederated(this.#tenantBound(companyId, input) as never);
  }

  async getCommercialState(companyId: Identifier) {
    await this.#context(companyId);
    return this.#commercial.projection(companyId);
  }

  async synchronizeSubscription(companyId: Identifier, input: unknown) {
    await this.#authorize(companyId, "agent-commercial:subscription-sync");
    return this.#commercial.synchronizeSubscription(this.#tenantBound(companyId, input) as never);
  }

  async recordCredentialStatus(companyId: Identifier, input: unknown) {
    await this.#authorize(companyId, "agent-commercial:credential-status");
    return this.#commercial.recordCredentialStatus(this.#tenantBound(companyId, input) as never);
  }

  async importUsage(companyId: Identifier, input: unknown) {
    await this.#authorize(companyId, "agent-commercial:record-usage");
    return this.#commercial.importUsage(this.#tenantBound(companyId, input) as never);
  }

  async requestRenewal(companyId: Identifier, input: unknown) {
    await this.#authorize(companyId, "agent-commercial:renewal-request");
    return this.#commercial.requestRenewal(this.#tenantBound(companyId, input) as never);
  }

  #tenantBound(companyId: Identifier, input: unknown): Record<string, unknown> {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("AGENT_PORTFOLIO_INPUT_INVALID");
    }
    return { ...(input as Record<string, unknown>), companyId };
  }

  async #context(companyId: Identifier) {
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== companyId) throw new Error("TENANT_MISMATCH");
    return identity;
  }

  async #authorize(companyId: Identifier, action: string) {
    const identity = await this.#context(companyId);
    const receipt = await this.#identity.authorize({
      companyId,
      action,
      resourceId: companyId,
      reason: "Manage bounded Agent Portfolio records",
    });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
  }
}
