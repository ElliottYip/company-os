import { createDemoComposition } from "../adapters/demo/create-demo-composition.ts";
import { DEMO_COMPANY } from "../adapters/demo/demo-company.ts";
import type { CompanyWorkState } from "../application/company-operations.ts";
import type { AgentBossProjection } from "../application/get-agent-boss-projection.ts";
import type { OrganizationDraft } from "../core/organization.ts";

export interface CompanyOSApplicationClient {
  readonly mode: "DEMO_FIXTURE" | "FORMAL";
  organization(): Promise<OrganizationDraft>;
  snapshot(): Promise<CompanyWorkState>;
  assignWork(): Promise<CompanyWorkState>;
  advanceWork(): Promise<CompanyWorkState>;
  decideApproval(decision: "APPROVED" | "REJECTED"): Promise<CompanyWorkState>;
  resetFixture(): Promise<CompanyWorkState>;
}

export function createDemoApplicationClient(): CompanyOSApplicationClient {
  const { runtime } = createDemoComposition();
  return {
    mode: "DEMO_FIXTURE",
    async organization() { return structuredClone(DEMO_COMPANY); },
    snapshot: () => runtime.snapshot(),
    assignWork: () => runtime.assignTask(),
    advanceWork: () => runtime.advance(),
    decideApproval: (decision) => runtime.decide(decision),
    resetFixture: () => runtime.reset(),
  };
}

export interface FormalApplicationClientOptions {
  readonly baseUrl: string;
  readonly companyId: string;
  readonly fetcher?: typeof fetch;
}

function phaseFromProjection(projection: AgentBossProjection): CompanyWorkState["phase"] {
  const status = projection.attempts.at(-1)?.status;
  if (status === "AWAITING_APPROVAL") return "AWAITING_APPROVAL";
  if (status === "SUCCEEDED") return "COMPLETED";
  if (status === "CANCELLED" || status === "FAILED" || status === "TIMED_OUT") return "REJECTED";
  if (status === "RUNNING" || status === "LEASED" || status === "OUTCOME_UNKNOWN") {
    return "SIMULATING_TOOL_ACTIVITY";
  }
  return projection.work.length ? "PLANNING" : "READY";
}

export function createFormalApplicationClient(
  options: FormalApplicationClientOptions,
): CompanyOSApplicationClient {
  const fetcher = options.fetcher ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const endpoint = `${baseUrl}/api/v1/companies/${encodeURIComponent(options.companyId)}/agent-boss`;

  async function projection(): Promise<AgentBossProjection> {
    const response = await fetcher(endpoint, {
      method: "GET",
      headers: { accept: "application/json" },
      credentials: "same-origin",
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      const code = payload && typeof payload === "object" &&
          !Array.isArray(payload) &&
          typeof (payload as { error?: { code?: unknown } }).error?.code === "string"
        ? (payload as { error: { code: string } }).error.code
        : "FORMAL_API_REQUEST_FAILED";
      throw new Error(code);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
        (payload as { schemaVersion?: unknown }).schemaVersion !== 1 ||
        (payload as { mode?: unknown }).mode !== "PRODUCTION") {
      throw new Error("FORMAL_API_PROJECTION_INVALID");
    }
    return payload as AgentBossProjection;
  }

  async function snapshot(): Promise<CompanyWorkState> {
    const value = await projection();
    const work = value.work.at(-1);
    return {
      mode: "PRODUCTION",
      phase: phaseFromProjection(value),
      events: [],
      responsibility: {
        workId: work?.id ?? "no-active-work",
        goalInitiatorId: work?.requestedBy ?? "unassigned",
        accountableHumanId: work?.accountableHumanId ?? "unassigned",
        executingAgentId: work?.agentId ?? "unassigned",
        permissionIds: [],
        dataAuthorizationIds: [],
        approvalIds: value.pendingApprovals.map(({ id }) => id),
        evidenceIds: [],
        resultId: null,
      },
    };
  }

  const unsupported = async (): Promise<never> => {
    throw new Error("FORMAL_MUTATION_NOT_CONFIGURED");
  };
  return {
    mode: "FORMAL",
    async organization() { return structuredClone((await projection()).organization); },
    snapshot,
    assignWork: unsupported,
    advanceWork: unsupported,
    decideApproval: unsupported,
    resetFixture: unsupported,
  };
}
