import { createDemoComposition } from "../adapters/demo/create-demo-composition.ts";
import { DEMO_COMPANY } from "../adapters/demo/demo-company.ts";
import type { CompanyWorkState } from "../application/company-operations.ts";
import type { AgentBossProjection } from "../application/get-agent-boss-projection.ts";
import type { AdministrationProjection } from "../application/get-administration-projection.ts";
import type { OrganizationDraft } from "../core/organization.ts";

export interface CompanyOSApplicationClient {
  readonly mode: "DEMO_FIXTURE" | "FORMAL";
  organization(): Promise<OrganizationDraft>;
  administration(): Promise<AdministrationProjection | null>;
  assignmentOptions(): Promise<CompanyOSAssignmentOptions>;
  snapshot(): Promise<CompanyWorkState>;
  assignWork(input?: CompanyOSWorkAssignment): Promise<CompanyWorkState>;
  advanceWork(): Promise<CompanyWorkState>;
  decideApproval(decision: "APPROVED" | "REJECTED"): Promise<CompanyWorkState>;
  resetFixture(): Promise<CompanyWorkState>;
}

export interface CompanyOSAssignmentOptions {
  readonly viewerId: string;
  readonly agents: readonly {
    readonly id: string;
    readonly name: string;
    readonly departmentId: string;
    readonly allowedActionIds: readonly string[];
  }[];
}

export interface CompanyOSWorkAssignment {
  readonly title: string;
  readonly goal: string;
  readonly agentId: string;
  readonly departmentId: string;
  readonly requestedBy: string;
  readonly actionIds: readonly string[];
}

export function createDemoApplicationClient(): CompanyOSApplicationClient {
  const { runtime } = createDemoComposition();
  return {
    mode: "DEMO_FIXTURE",
    async organization() { return structuredClone(DEMO_COMPANY); },
    async administration() { return null; },
    async assignmentOptions() {
      return {
        viewerId: "demo-boss",
        agents: DEMO_COMPANY.agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          departmentId: agent.departmentId,
          allowedActionIds: ["read-knowledge", "publish-content"],
        })),
      };
    },
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
  const administrationEndpoint = `${baseUrl}/api/v1/companies/${encodeURIComponent(options.companyId)}/administration`;

  async function getJson(url: string): Promise<unknown> {
    const response = await fetcher(url, {
      method: "GET", headers: { accept: "application/json" }, credentials: "same-origin",
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      const code = payload && typeof payload === "object" && !Array.isArray(payload) &&
          typeof (payload as { error?: { code?: unknown } }).error?.code === "string"
        ? (payload as { error: { code: string } }).error.code
        : "FORMAL_API_REQUEST_FAILED";
      throw new Error(code);
    }
    return payload;
  }

  async function projection(): Promise<AgentBossProjection> {
    const payload = await getJson(endpoint);
    if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
        (payload as { schemaVersion?: unknown }).schemaVersion !== 1 ||
        (payload as { mode?: unknown }).mode !== "PRODUCTION") {
      throw new Error("FORMAL_API_PROJECTION_INVALID");
    }
    return payload as AgentBossProjection;
  }

  async function command(path: string, body: unknown): Promise<void> {
    const response = await fetcher(`${baseUrl}${path}`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      const code = payload && typeof payload === "object" && !Array.isArray(payload) &&
          typeof (payload as { error?: { code?: unknown } }).error?.code === "string"
        ? (payload as { error: { code: string } }).error.code
        : "FORMAL_API_REQUEST_FAILED";
      throw new Error(code);
    }
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
    async administration() {
      const payload = await getJson(administrationEndpoint);
      if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
          (payload as { schemaVersion?: unknown }).schemaVersion !== 1 ||
          (payload as { mode?: unknown }).mode !== "PRODUCTION") {
        throw new Error("FORMAL_API_PROJECTION_INVALID");
      }
      return payload as AdministrationProjection;
    },
    async assignmentOptions() {
      const value = await projection();
      return {
        viewerId: value.viewer.actorId,
        agents: value.organization.agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          departmentId: agent.departmentId,
          allowedActionIds: value.responsibilities.contracts
            .find(({ agentId }) => agentId === agent.id)?.allowedActions ?? [],
        })),
      };
    },
    snapshot,
    async assignWork(input) {
      if (!input) throw new Error("FORMAL_WORK_INPUT_REQUIRED");
      const workId = `work-${crypto.randomUUID()}`;
      await command(`/api/v1/companies/${encodeURIComponent(options.companyId)}/work`, {
        draft: {
          id: workId,
          title: input.title,
          goal: input.goal,
          scope: "AGENT",
          departmentId: input.departmentId,
          projectId: null,
          agentId: input.agentId,
          requestedBy: input.requestedBy,
          actionIds: input.actionIds,
          parentWorkId: null,
        },
        genericGoalId: null,
      });
      return snapshot();
    },
    advanceWork: unsupported,
    async decideApproval(decision) {
      const value = await projection();
      const approval = value.pendingApprovals.at(0);
      if (!approval) throw new Error("APPROVAL_REQUEST_NOT_FOUND");
      await command(
        `/api/v1/companies/${encodeURIComponent(options.companyId)}/approvals/${encodeURIComponent(approval.id)}/decisions`,
        { decision, expectedBinding: approval.binding },
      );
      return snapshot();
    },
    resetFixture: unsupported,
  };
}
