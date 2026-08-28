import { validateRenewalRequest } from "../core/agent-commercial-governance.ts";
import type {
  CreateDemoPortfolioFixture,
  DemoPortfolioSnapshot,
} from "../core/demo-portfolio.ts";
import type { DemoSessionStorePort } from "../ports/demo-session-store-port.ts";

const SESSION_ID = /^[A-Za-z0-9_-]{32,160}$/;

export class DemoPortfolioSessions {
  readonly #dependencies: {
    readonly store: DemoSessionStorePort;
    readonly createFixture: CreateDemoPortfolioFixture;
    readonly nextSessionId: () => string;
    readonly nextCompanyId: () => string;
    readonly now: () => string;
    readonly timeToLiveMilliseconds: number;
  };

  constructor(dependencies: {
    readonly store: DemoSessionStorePort;
    readonly createFixture: CreateDemoPortfolioFixture;
    readonly nextSessionId: () => string;
    readonly nextCompanyId: () => string;
    readonly now: () => string;
    readonly timeToLiveMilliseconds: number;
  }) {
    if (!Number.isSafeInteger(dependencies.timeToLiveMilliseconds) ||
        dependencies.timeToLiveMilliseconds < 60_000 ||
        dependencies.timeToLiveMilliseconds > 86_400_000) {
      throw new Error("DEMO_SESSION_TTL_INVALID");
    }
    this.#dependencies = dependencies;
  }

  async create(): Promise<DemoPortfolioSnapshot> {
    const sessionId = this.#dependencies.nextSessionId();
    if (!SESSION_ID.test(sessionId)) throw new Error("DEMO_SESSION_ID_INVALID");
    const createdAt = this.#dependencies.now();
    const createdTime = Date.parse(createdAt);
    if (!Number.isFinite(createdTime)) throw new Error("DEMO_SESSION_TIME_INVALID");
    const snapshot = this.#dependencies.createFixture({
      sessionId,
      companyId: this.#dependencies.nextCompanyId(),
      generation: 1,
      revision: 0,
      createdAt,
      expiresAt: new Date(createdTime + this.#dependencies.timeToLiveMilliseconds).toISOString(),
    });
    await this.#dependencies.store.create(snapshot);
    return structuredClone(snapshot);
  }

  async read(sessionId: string): Promise<DemoPortfolioSnapshot> {
    if (!SESSION_ID.test(sessionId)) throw new Error("DEMO_SESSION_ID_INVALID");
    const snapshot = await this.#dependencies.store.load(sessionId);
    if (!snapshot) throw new Error("DEMO_SESSION_NOT_FOUND");
    if (Date.parse(snapshot.expiresAt) <= Date.parse(this.#dependencies.now())) {
      await this.#dependencies.store.delete(sessionId);
      throw new Error("DEMO_SESSION_EXPIRED");
    }
    return snapshot;
  }

  async recover(sessionId: string | null): Promise<DemoPortfolioSnapshot> {
    if (sessionId) {
      try {
        return await this.read(sessionId);
      } catch (error) {
        if (!(error instanceof Error) ||
            !["DEMO_SESSION_NOT_FOUND", "DEMO_SESSION_EXPIRED", "DEMO_SESSION_ID_INVALID"]
              .includes(error.message)) throw error;
      }
    }
    return this.create();
  }

  async requestRenewal(
    sessionId: string,
    input: {
      readonly targetType: "SUBSCRIPTION" | "CREDENTIAL" | "QUOTA";
      readonly targetId: string;
      readonly reason: string;
    },
  ): Promise<DemoPortfolioSnapshot> {
    const current = await this.read(sessionId);
    const targetExists = input.targetType === "CREDENTIAL"
      ? current.commercial.credentials.some(({ id }) => id === input.targetId)
      : input.targetType === "SUBSCRIPTION"
      ? current.commercial.subscriptions.some(({ id }) => id === input.targetId)
      : true;
    if (!targetExists) throw new Error("DEMO_RENEWAL_TARGET_NOT_FOUND");
    const suffix = current.commercial.renewals.length + 1;
    const requestedAt = this.#dependencies.now();
    const renewal = validateRenewalRequest({
      id: `demo-renewal-${suffix}`,
      companyId: current.company.id,
      targetType: input.targetType,
      targetId: input.targetId,
      requestedBy: "demo-owner",
      accountableHumanId: "demo-owner",
      reason: input.reason,
      approvalRequired: true,
      approvalRequestId: `demo-renewal-approval-${suffix}`,
      requestedAt,
      provenance: "DEMO_FIXTURE",
    });
    return this.#replace(current, {
      ...current,
      commercial: {
        ...current.commercial,
        renewals: [...current.commercial.renewals, renewal],
      },
    });
  }

  async triggerGovernedWork(sessionId: string): Promise<DemoPortfolioSnapshot> {
    const current = await this.read(sessionId);
    if (current.governed.phase !== "READY") throw new Error("DEMO_GOVERNED_WORK_NOT_READY");
    return this.#replace(current, {
      ...current,
      governed: {
        phase: "AWAITING_APPROVAL",
        approvalRequestId: "demo-governed-approval",
        evidenceReferences: ["demo-governed-plan", "demo-risk-assessment"],
        resultReference: null,
        costCents: 32,
      },
    });
  }

  async decide(
    sessionId: string,
    decision: "APPROVED" | "REJECTED",
  ): Promise<DemoPortfolioSnapshot> {
    const current = await this.read(sessionId);
    if (current.governed.phase !== "AWAITING_APPROVAL") {
      throw new Error("DEMO_GOVERNED_APPROVAL_NOT_PENDING");
    }
    return this.#replace(current, {
      ...current,
      governed: {
        ...current.governed,
        phase: decision,
        resultReference: decision === "APPROVED" ? "demo-governed-result" : null,
      },
    });
  }

  async reset(sessionId: string): Promise<DemoPortfolioSnapshot> {
    const current = await this.read(sessionId);
    const reset = this.#dependencies.createFixture({
      sessionId: current.sessionId,
      companyId: current.company.id,
      generation: current.generation + 1,
      revision: current.revision + 1,
      createdAt: current.createdAt,
      expiresAt: current.expiresAt,
    });
    await this.#dependencies.store.replace(sessionId, current.revision, reset);
    return structuredClone(reset);
  }

  async #replace(
    current: DemoPortfolioSnapshot,
    changed: DemoPortfolioSnapshot,
  ): Promise<DemoPortfolioSnapshot> {
    const next = { ...changed, revision: current.revision + 1 };
    await this.#dependencies.store.replace(current.sessionId, current.revision, next);
    return structuredClone(next);
  }
}
