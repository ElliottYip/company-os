import { createDemoComposition } from "../adapters/demo/create-demo-composition.ts";
import { DEMO_COMPANY } from "../adapters/demo/demo-company.ts";
import type { CompanyWorkState } from "../application/company-operations.ts";
import type { AgentBossProjection } from "../application/get-agent-boss-projection.ts";
import type { AdministrationProjection } from "../application/get-administration-projection.ts";
import type { OperationalRiskProjection } from "../application/get-operational-risk-projection.ts";
import type { AiCaseOperation } from "../core/operational-risk.ts";
import type { FormalWorkCatalog } from "../application/formal-agent-boss-api.ts";
import type { WorkRunTimelinePage } from "../application/get-work-run-timeline.ts";
import type { CompanyActivityPage } from "../application/get-company-activity.ts";
import type { AccountabilityLedgerProjection } from "../application/get-accountability-ledger.ts";
import type {
  AccountabilityExportPackage,
  AccountabilityExportPurpose,
} from "../application/export-accountability-package.ts";
import {
  getFormalAccessStatus,
  type FormalAccessStatus,
} from "../application/get-formal-access-status.ts";
import { validateOrganizationDraft, type OrganizationDraft } from "../core/organization.ts";
import type { ConnectorRegistration } from "../core/connector.ts";
import type { GovernanceCatalog } from "../core/governance-catalog.ts";
import type { DataClassification, DataOperation } from "../core/data-governance.ts";
import type { WorkExecutionPreparationPlan } from "../application/prepare-work-execution.ts";
import { validateResponsibilityContracts, type ResponsibilityContract } from "../core/responsibility.ts";
import type { AgentLifecycleOperation, AgentLifecycleRecord } from "../core/agent-lifecycle.ts";
import {
  validatePlanningCatalog,
  type GoalLevel,
  type GoalRecord,
  type PlanningCatalog,
  type ProjectRecord,
} from "../core/planning.ts";
import type {
  ToolPolicy,
  ToolProfileEntry,
  ToolProfileStatus,
} from "../core/tool-access.ts";
import type {
  SecretReferenceManagementIntent,
  SecretReferenceManagementResult,
  SecretReferenceManagementSession,
} from "../core/secret-governance.ts";

export interface CompanyOSApplicationClient {
  readonly mode: "DEMO_FIXTURE" | "FORMAL";
  formalAccess(): Promise<FormalAccessStatus>;
  beginFormalSignIn(callbackPath?: string): Promise<string>;
  signOut(): Promise<void>;
  companies(): Promise<CompanyDirectoryProjection>;
  claimFirstAdmin(): Promise<void>;
  createCompany(input: { readonly name: string; readonly purpose: string; readonly locale: string }): Promise<string>;
  selectCompany(companyId: string): void;
  setupOrganization(input: { readonly departmentName: string; readonly ownerTitle: string }): Promise<void>;
  inviteHuman(input: {
    readonly email: string;
    readonly departmentId: string;
    readonly title: string;
    readonly role: "owner" | "admin" | "operator" | "viewer";
  }): Promise<HumanInviteProjection>;
  humanMembers(): Promise<CompanyHumanMemberDirectory>;
  updateHumanMember(userId: string, input: {
    readonly expectedRole: "owner" | "admin" | "operator" | "viewer";
    readonly expectedStatus: "pending" | "active" | "suspended" | "archived";
    readonly role: "owner" | "admin" | "operator" | "viewer";
    readonly status: "active" | "suspended";
  }): Promise<CompanyHumanMemberDirectory["members"][number]>;
  acceptHumanInvite(token: string): Promise<HumanInviteAcceptanceProjection>;
  organization(): Promise<OrganizationDraft>;
  replaceOrganization(organization: OrganizationDraft): Promise<OrganizationDraft>;
  updateCompanyProfile(input: {
    readonly expected: { readonly name: string; readonly purpose: string; readonly locale: string };
    readonly next: { readonly name: string; readonly purpose: string; readonly locale: string };
  }): Promise<OrganizationDraft>;
  archiveDepartment(departmentId: string, input: {
    readonly destinationDepartmentId: string;
    readonly expectedResponsibilityRevision: number;
    readonly reason: string;
  }): Promise<OrganizationDraft>;
  administration(): Promise<AdministrationProjection | null>;
  operationalRisk(): Promise<OperationalRiskProjection | null>;
  manageAiCase(caseId: string, input: {
    readonly operation: AiCaseOperation;
    readonly expectedRevision: number;
    readonly reason: string;
    readonly rootCause?: string;
    readonly remediation?: string;
    readonly prevention?: string;
  }): Promise<void>;
  planning(): Promise<PlanningCatalog>;
  replacePlanning(input: PlanningCatalog): Promise<PlanningCatalog>;
  createGoal(input: {
    readonly title: string; readonly description: string | null; readonly level: GoalLevel;
    readonly parentId: string | null; readonly ownerAgentId: string | null;
    readonly accountableHumanId: string; readonly expectedRevision: number;
  }): Promise<PlanningCatalog>;
  updateGoal(goalId: string, input: Omit<GoalRecord, "id" | "companyId" | "createdAt" | "updatedAt"> & {
    readonly expectedRevision: number;
  }): Promise<PlanningCatalog>;
  createProject(input: {
    readonly goalIds: readonly string[]; readonly name: string; readonly description: string | null;
    readonly leadAgentId: string | null; readonly accountableHumanId: string;
    readonly departmentIds: readonly string[]; readonly targetDate: string | null;
    readonly expectedRevision: number;
  }): Promise<PlanningCatalog>;
  updateProject(projectId: string, input: Omit<ProjectRecord, "id" | "companyId" | "archivedAt" | "createdAt" | "updatedAt"> & {
    readonly expectedRevision: number;
  }): Promise<PlanningCatalog>;
  archiveProject(projectId: string, expectedRevision: number): Promise<PlanningCatalog>;
  replaceConnectorCatalog(input: {
    readonly expectedRevision: number;
    readonly connectors: readonly ConnectorRegistration[];
  }): Promise<void>;
  registerConnectorRuntime(input: {
    readonly connectorId: string;
    readonly executionResidency: "MANAGED_CLOUD" | "CUSTOMER_ENVIRONMENT";
    readonly expectedRevision: number;
  }): Promise<void>;
  setConnectorStatus(connectorId: string, input: {
    readonly status: "ENABLED" | "DISABLED";
    readonly expectedRevision: number;
  }): Promise<void>;
  changeAgentRuntimeBinding(agentId: string, input: {
    readonly operation: "BIND" | "UNBIND";
    readonly connectorId: string | null;
    readonly expectedRevision: number;
    readonly reason: string;
  }): Promise<void>;
  createDataAuthorizationContract(input: {
    readonly id: string;
    readonly dataSourceId: string;
    readonly authorizedAgentIds: readonly string[];
    readonly authorizedOperations: readonly DataOperation[];
    readonly allowedPurposes: readonly string[];
    readonly maximumClassification: DataClassification;
    readonly allowedExportDestinations: readonly string[];
    readonly validUntil: string;
    readonly expectedRevision: number;
  }): Promise<void>;
  setDataAuthorizationStatus(contractId: string, input: {
    readonly status: "ACTIVE" | "SUSPENDED" | "REVOKED";
    readonly expectedRevision: number;
  }): Promise<void>;
  createModelRoute(input: {
    readonly policyId: string; readonly routeId: string; readonly providerAdapterId: string;
    readonly modelReference: string; readonly credentialReference: string;
    readonly allowedDataClassifications: readonly DataClassification[];
    readonly residency: "MANAGED_CLOUD" | "LOCAL"; readonly expectedRevision: number;
  }): Promise<void>;
  setModelRouteEnabled(routeId: string, input: {
    readonly enabled: boolean; readonly expectedRevision: number;
  }): Promise<void>;
  createToolProfile(input: {
    readonly profileId: string; readonly profileKey: string; readonly name: string;
    readonly description: string | null; readonly defaultAction: "deny" | "allow";
    readonly entries: readonly Omit<ToolProfileEntry, "companyId" | "profileId">[];
    readonly expectedRevision: number;
  }): Promise<void>;
  bindToolProfile(profileId: string, input: {
    readonly bindingId: string; readonly targetType: "company" | "agent" | "project";
    readonly targetId: string; readonly priority: number; readonly expectedRevision: number;
  }): Promise<void>;
  createToolPolicy(input: {
    readonly policy: Omit<ToolPolicy, "companyId" | "enabled">;
    readonly expectedRevision: number;
  }): Promise<void>;
  setToolProfileStatus(profileId: string, input: {
    readonly status: ToolProfileStatus; readonly expectedRevision: number;
  }): Promise<void>;
  upsertBudgetPolicy(input: {
    readonly policyId: string; readonly scopeType: "company" | "agent" | "project";
    readonly scopeId: string; readonly metric?: "billed_cents";
    readonly windowKind?: "calendar_month_utc" | "lifetime"; readonly amount: number;
    readonly warnPercent?: number; readonly hardStopEnabled?: boolean;
    readonly notifyEnabled?: boolean; readonly isActive?: boolean; readonly expectedRevision: number;
  }): Promise<void>;
  replaceGovernanceCatalog(input: Omit<GovernanceCatalog, "companyId"> & {
    readonly expectedRevision: number;
  }): Promise<void>;
  replaceResponsibilityContracts(input: {
    readonly expectedRevision: number;
    readonly contracts: readonly ResponsibilityContract[];
  }): Promise<void>;
  transitionAgentLifecycle(agentId: string, input: {
    readonly operation: AgentLifecycleOperation;
    readonly expectedRevision: number;
    readonly pauseReason?: AgentLifecycleRecord["pauseReason"];
  }): Promise<void>;
  transferResponsibility(agentId: string, input: {
    readonly newAccountableHumanId: string;
    readonly newBackupHumanId: string | null;
    readonly expectedResponsibilityRevision: number;
    readonly reason: string;
  }): Promise<void>;
  exportCompany(): Promise<string>;
  exportAccountability(input: {
    readonly requestId: string;
    readonly purposeCode: AccountabilityExportPurpose;
  }): Promise<string>;
  inspectCompanyBackup(source: string): Promise<CompanyBackupInspection>;
  importCompany(source: string): Promise<string>;
  archiveCompany(input: {
    readonly exportDigest: string;
    readonly retentionPolicyId: string;
    readonly reason: string;
  }): Promise<void>;
  beginSecretReferenceManagement(
    input: Omit<SecretReferenceManagementIntent, "companyId">,
  ): Promise<SecretReferenceManagementSession>;
  confirmSecretReferenceManagement(sessionId: string): Promise<SecretReferenceManagementResult>;
  assignmentOptions(): Promise<CompanyOSAssignmentOptions>;
  workCatalog(): Promise<FormalWorkCatalog>;
  workRunTimeline(workId: string, attemptId: string): Promise<WorkRunTimelinePage>;
  activity(): Promise<CompanyActivityPage>;
  accountabilityLedger(): Promise<AccountabilityLedgerProjection | null>;
  requestWorkCancellation(workId: string, attemptId: string): Promise<void>;
  reconcileWorkAttempt(workId: string, attemptId: string, input: {
    readonly resolution: "CONFIRMED_SUCCEEDED" | "CONFIRMED_FAILED" | "SAFE_TO_RETRY";
    readonly evidenceId: string;
  }): Promise<void>;
  retryWorkAttempt(workId: string, attemptId: string): Promise<void>;
  retryWorkExecutionPreparation(workId: string, attemptId: string): Promise<void>;
  snapshot(): Promise<CompanyWorkState>;
  assignWork(input?: CompanyOSWorkAssignment): Promise<CompanyWorkState>;
  advanceWork(): Promise<CompanyWorkState>;
  decideApproval(decision: "APPROVED" | "REJECTED"): Promise<CompanyWorkState>;
  resetFixture(): Promise<CompanyWorkState>;
}

export interface CompanyDirectoryProjection {
  readonly schemaVersion: 1;
  readonly companies: readonly {
    readonly id: string;
    readonly name: string;
    readonly slug?: string;
    readonly membershipRole: "owner" | "admin" | "operator" | "viewer";
  }[];
  readonly isInstanceAdmin: boolean;
}

export interface HumanInviteProjection {
  readonly inviteId: string;
  readonly token: string;
  readonly invitePath: string;
  readonly expiresAt: string;
}

export interface CompanyHumanMemberDirectory {
  readonly schemaVersion: 1;
  readonly members: readonly {
    readonly userId: string;
    readonly displayName: string;
    readonly email: string;
    readonly role: "owner" | "admin" | "operator" | "viewer";
    readonly status: "pending" | "active" | "suspended" | "archived";
    readonly createdAt: string;
    readonly updatedAt: string;
  }[];
}

export interface HumanInviteAcceptanceProjection {
  readonly accepted: true;
  readonly companyId: string;
  readonly membershipRole: "owner" | "admin" | "operator" | "viewer";
}

export interface CompanyBackupInspection {
  readonly companyId: string;
  readonly name: string;
  readonly purpose: string;
  readonly locale: string;
  readonly actorUserId: string;
  readonly identityBinding: "EXACT";
  readonly eventCount: number;
  readonly deliveredPublicationCount: number;
  readonly checkpointCount: number;
  readonly humanCount: number;
  readonly agentCount: number;
}

const MAX_FORMAL_API_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_PORTABILITY_RESPONSE_BYTES = 8 * 1024 * 1024;

function formalApiErrorCode(payload: unknown): string {
  return recordValue(payload) && recordValue(payload.error) &&
      typeof payload.error.code === "string" && /^[A-Z][A-Z0-9_]{2,127}$/.test(payload.error.code)
    ? payload.error.code
    : "FORMAL_API_REQUEST_FAILED";
}

function jsonMediaType(contentType: string | null): boolean {
  if (!contentType) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return mediaType === "application/json" ||
    (mediaType.startsWith("application/") && mediaType.endsWith("+json"));
}

async function readFormalApiJson(response: Response, maximumBytes = MAX_FORMAL_API_RESPONSE_BYTES): Promise<unknown> {
  if (!jsonMediaType(response.headers.get("content-type"))) {
    throw new Error("FORMAL_API_RESPONSE_CONTENT_TYPE_INVALID");
  }
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) {
      throw new Error("FORMAL_API_RESPONSE_CONTENT_LENGTH_INVALID");
    }
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length)) {
      throw new Error("FORMAL_API_RESPONSE_CONTENT_LENGTH_INVALID");
    }
    if (length > maximumBytes) {
      throw new Error("FORMAL_API_RESPONSE_TOO_LARGE");
    }
  }
  if (!response.body) throw new Error("FORMAL_API_RESPONSE_EMPTY");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        void reader.cancel("FORMAL_API_RESPONSE_TOO_LARGE").catch(() => undefined);
        throw new Error("FORMAL_API_RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (totalBytes === 0) throw new Error("FORMAL_API_RESPONSE_EMPTY");

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(source) as unknown;
  } catch {
    throw new Error("FORMAL_API_RESPONSE_JSON_INVALID");
  }
}

export interface CompanyOSAssignmentOptions {
  readonly viewerId: string;
  readonly lifecycle: AgentBossProjection["agentLifecycle"];
  readonly responsibilities: AgentBossProjection["responsibilities"];
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
  readonly executionPreparation?: WorkExecutionPreparationPlan;
}

export function createDemoApplicationClient(): CompanyOSApplicationClient {
  const { runtime } = createDemoComposition();
  let organization = structuredClone(DEMO_COMPANY);
  let planning: PlanningCatalog = {
    companyId: organization.company.id,
    revision: 0,
    goals: [],
    projects: [],
  };
  const requirePlanningRevision = (expectedRevision: number): void => {
    if (expectedRevision !== planning.revision) throw new Error("PLANNING_REVISION_CONFLICT");
  };
  return {
    mode: "DEMO_FIXTURE",
    async formalAccess() {
      return getFormalAccessStatus({ deploymentProfile: "self-hosted", configuration: {} });
    },
    async beginFormalSignIn() { throw new Error("FORMAL_OIDC_NOT_CONFIGURED"); },
    async signOut() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async companies() { return { schemaVersion: 1, companies: [], isInstanceAdmin: false }; },
    async claimFirstAdmin() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async createCompany() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    selectCompany() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async setupOrganization() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async inviteHuman() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async humanMembers() { return { schemaVersion: 1, members: [] }; },
    async updateHumanMember() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async acceptHumanInvite() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async organization() { return structuredClone(organization); },
    async replaceOrganization(nextOrganization) {
      const companyChanged = nextOrganization.company.id !== organization.company.id;
      organization = structuredClone(nextOrganization);
      if (companyChanged) {
        planning = { companyId: organization.company.id, revision: 0, goals: [], projects: [] };
      } else {
        planning = validatePlanningCatalog(planning, organization);
      }
      return structuredClone(organization);
    },
    async updateCompanyProfile(input) {
      if (organization.company.name !== input.expected.name ||
          organization.company.purpose !== input.expected.purpose ||
          organization.company.locale !== input.expected.locale) {
        throw new Error("COMPANY_PROFILE_REVISION_CONFLICT");
      }
      organization = { ...organization, company: { ...organization.company, ...input.next } };
      return structuredClone(organization);
    },
    async archiveDepartment() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async administration() { return null; },
    async operationalRisk() { return null; },
    async manageAiCase() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async planning() { return structuredClone(planning); },
    async replacePlanning(input) {
      planning = validatePlanningCatalog({ ...input, revision: planning.revision + 1 }, organization);
      return structuredClone(planning);
    },
    async createGoal(input) {
      requirePlanningRevision(input.expectedRevision);
      const now = new Date().toISOString();
      planning = validatePlanningCatalog({
        ...planning,
        revision: planning.revision + 1,
        goals: [...planning.goals, {
          id: crypto.randomUUID(), companyId: planning.companyId,
          title: input.title, description: input.description, level: input.level,
          status: "planned", parentId: input.parentId, ownerAgentId: input.ownerAgentId,
          accountableHumanId: input.accountableHumanId, createdAt: now, updatedAt: now,
        }],
      }, organization);
      return structuredClone(planning);
    },
    async updateGoal(goalId, input) {
      requirePlanningRevision(input.expectedRevision);
      const { expectedRevision: _expectedRevision, ...changes } = input;
      planning = validatePlanningCatalog({
        ...planning,
        revision: planning.revision + 1,
        goals: planning.goals.map((goal) => goal.id === goalId
          ? { ...goal, ...changes, updatedAt: new Date().toISOString() }
          : goal),
      }, organization);
      return structuredClone(planning);
    },
    async createProject(input) {
      requirePlanningRevision(input.expectedRevision);
      const now = new Date().toISOString();
      planning = validatePlanningCatalog({
        ...planning,
        revision: planning.revision + 1,
        projects: [...planning.projects, {
          id: crypto.randomUUID(), companyId: planning.companyId,
          goalIds: input.goalIds, name: input.name, description: input.description,
          status: "backlog", leadAgentId: input.leadAgentId,
          accountableHumanId: input.accountableHumanId, departmentIds: input.departmentIds,
          targetDate: input.targetDate, archivedAt: null, createdAt: now, updatedAt: now,
        }],
      }, organization);
      return structuredClone(planning);
    },
    async updateProject(projectId, input) {
      requirePlanningRevision(input.expectedRevision);
      const { expectedRevision: _expectedRevision, ...changes } = input;
      planning = validatePlanningCatalog({
        ...planning,
        revision: planning.revision + 1,
        projects: planning.projects.map((project) => project.id === projectId
          ? { ...project, ...changes, updatedAt: new Date().toISOString() }
          : project),
      }, organization);
      return structuredClone(planning);
    },
    async archiveProject(projectId, expectedRevision) {
      requirePlanningRevision(expectedRevision);
      const now = new Date().toISOString();
      planning = validatePlanningCatalog({
        ...planning,
        revision: planning.revision + 1,
        projects: planning.projects.map((project) => project.id === projectId
          ? { ...project, archivedAt: now, updatedAt: now }
          : project),
      }, organization);
      return structuredClone(planning);
    },
    async replaceConnectorCatalog() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async registerConnectorRuntime() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async setConnectorStatus() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async changeAgentRuntimeBinding() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async createDataAuthorizationContract() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async setDataAuthorizationStatus() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async createModelRoute() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async setModelRouteEnabled() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async createToolProfile() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async bindToolProfile() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async createToolPolicy() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async setToolProfileStatus() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async upsertBudgetPolicy() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async replaceGovernanceCatalog() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async replaceResponsibilityContracts() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async transitionAgentLifecycle() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async transferResponsibility() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async exportCompany() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async exportAccountability() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async inspectCompanyBackup() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async importCompany() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async archiveCompany() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async beginSecretReferenceManagement() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async confirmSecretReferenceManagement() { throw new Error("FORMAL_READ_NOT_CONFIGURED"); },
    async assignmentOptions() {
      return {
        viewerId: "demo-boss",
        responsibilities: {
          revision: 0,
          contracts: organization.agents.map((agent) => ({
            id: `contract-${agent.id}`,
            companyId: organization.company.id,
            agentId: agent.id,
            accountableHumanId: agent.accountableHumanId,
            backupHumanId: null,
            autonomyLevel: agent.autonomyLevel,
            allowedActions: ["read-knowledge", "draft-content"],
            approvalRequiredActions: [],
            escalationTimeoutSeconds: null,
            status: "ACTIVE" as const,
          })),
        },
        lifecycle: {
          revision: 0,
          agents: organization.agents.map((agent) => ({
            companyId: organization.company.id,
            agentId: agent.id,
            status: "idle" as const,
            pauseReason: null,
            pausedAt: null,
            errorCode: null,
            updatedAt: "2026-08-18T00:00:00.000Z",
            eligibility: {
              assignable: true, invokable: true,
              assignabilityReason: "eligible" as const,
              invokabilityReason: "eligible" as const,
              orgChainHealth: {
                status: "healthy" as const, reason: "healthy" as const,
                firstInvalidAgentId: null, pausedAncestorIds: [],
              },
            },
          })),
        },
        agents: organization.agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          departmentId: agent.departmentId,
          allowedActionIds: ["read-knowledge", "publish-content"],
        })),
      };
    },
    async workCatalog() { return { schemaVersion: 1, items: [], nextCursor: null }; },
    async workRunTimeline() {
      throw new Error("FORMAL_READ_NOT_CONFIGURED");
    },
    async activity() { return { schemaVersion: 1, items: [], nextSequence: null }; },
    async accountabilityLedger() { return null; },
    async requestWorkCancellation() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async reconcileWorkAttempt() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async retryWorkAttempt() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    async retryWorkExecutionPreparation() { throw new Error("FORMAL_MUTATION_NOT_CONFIGURED"); },
    snapshot: () => runtime.snapshot(),
    assignWork: () => runtime.assignTask(),
    advanceWork: () => runtime.advance(),
    decideApproval: (decision) => runtime.decide(decision),
    async resetFixture() {
      organization = structuredClone(DEMO_COMPANY);
      planning = { companyId: organization.company.id, revision: 0, goals: [], projects: [] };
      return runtime.reset();
    },
  };
}

export interface FormalApplicationClientOptions {
  readonly baseUrl: string;
  /** Exact origin of the independently deployed customer Web. */
  readonly webOrigin: string;
  readonly companyId?: string;
  readonly fetcher?: typeof fetch;
  /** Covers connection, response headers, and the complete decoded JSON body. */
  readonly requestTimeoutMs?: number;
}

function latestAttemptForWork(projection: AgentBossProjection, workId: string | undefined) {
  if (!workId) return undefined;
  return projection.attempts.reduce((latest, attempt) =>
    attempt.workId === workId && (!latest || attempt.attemptNumber > latest.attemptNumber) ? attempt : latest,
    undefined as AgentBossProjection["attempts"][number] | undefined,
  );
}

function phaseFromProjection(projection: AgentBossProjection): CompanyWorkState["phase"] {
  const work = projection.work.at(-1);
  const status = latestAttemptForWork(projection, work?.id)?.status;
  if (status === "AWAITING_APPROVAL") return "AWAITING_APPROVAL";
  if (status === "SUCCEEDED") return "COMPLETED";
  if (status === "CANCELLED" || status === "FAILED" || status === "TIMED_OUT") return "REJECTED";
  if (status === "RUNNING" || status === "LEASED" || status === "CANCELLATION_REQUESTED" || status === "OUTCOME_UNKNOWN") {
    return "SIMULATING_TOOL_ACTIVITY";
  }
  return projection.work.length ? "PLANNING" : "READY";
}

function planningProjection(payload: unknown, expectedCompanyId: string): PlanningCatalog {
  if (!recordValue(payload) || payload.companyId !== expectedCompanyId ||
      !Number.isSafeInteger(payload.revision) || Number(payload.revision) < 0 ||
      !Array.isArray(payload.goals) || !Array.isArray(payload.projects)) {
    throw new Error("PLANNING_PROJECTION_INVALID");
  }
  const goalIds = new Set<string>();
  for (const goal of payload.goals) {
    if (!recordValue(goal) || !portableWebId(goal.id) || goalIds.has(goal.id) || goal.companyId !== expectedCompanyId ||
        !boundedText(goal.title, 120) || goal.title.length === 0 ||
        !(goal.description === null || boundedText(goal.description, 2_000)) ||
        !["company", "team", "agent", "task"].includes(String(goal.level)) ||
        !["planned", "active", "achieved", "cancelled"].includes(String(goal.status)) ||
        !(goal.parentId === null || portableWebId(goal.parentId)) ||
        !(goal.ownerAgentId === null || portableWebId(goal.ownerAgentId)) || !portableWebId(goal.accountableHumanId) ||
        !validDate(goal.createdAt) || !validDate(goal.updatedAt)) throw new Error("PLANNING_PROJECTION_INVALID");
    goalIds.add(goal.id);
  }
  const projectIds = new Set<string>();
  for (const project of payload.projects) {
    if (!recordValue(project) || !portableWebId(project.id) || projectIds.has(project.id) || project.companyId !== expectedCompanyId ||
        !Array.isArray(project.goalIds) || project.goalIds.some((id) => !portableWebId(id)) ||
        !boundedText(project.name, 120) || project.name.length === 0 ||
        !(project.description === null || boundedText(project.description, 2_000)) ||
        !["backlog", "planned", "in_progress", "completed", "cancelled"].includes(String(project.status)) ||
        !(project.leadAgentId === null || portableWebId(project.leadAgentId)) || !portableWebId(project.accountableHumanId) ||
        !Array.isArray(project.departmentIds) || project.departmentIds.some((id) => !portableWebId(id)) ||
        !(project.targetDate === null || (typeof project.targetDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(project.targetDate))) ||
        !(project.archivedAt === null || validDate(project.archivedAt)) || !validDate(project.createdAt) || !validDate(project.updatedAt)) {
      throw new Error("PLANNING_PROJECTION_INVALID");
    }
    projectIds.add(project.id);
  }
  return structuredClone(payload) as unknown as PlanningCatalog;
}

const PORTABLE_WEB_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const WORK_STATUSES = new Set(["PENDING", "WORKING", "WAITING", "BLOCKED", "AWAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED"]);
const ATTEMPT_STATUSES = new Set(["QUEUED", "LEASED", "RUNNING", "AWAITING_APPROVAL", "SUCCEEDED", "CANCELLATION_REQUESTED", "FAILED", "CANCELLED", "TIMED_OUT", "OUTCOME_UNKNOWN"]);

function recordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function portableWebId(value: unknown): value is string {
  return typeof value === "string" && PORTABLE_WEB_ID.test(value);
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length <= maximum;
}

function organizationProjection(payload: unknown, expectedCompanyId: string, code: string): OrganizationDraft {
  if (!recordValue(payload)) throw new Error(code);
  try {
    const organization = validateOrganizationDraft(payload as unknown as OrganizationDraft);
    if (organization.company.id !== expectedCompanyId) throw new Error(code);
    return organization;
  } catch {
    throw new Error(code);
  }
}

const COMPANY_ROLES = new Set(["owner", "admin", "operator", "viewer"]);
const MEMBER_STATUSES = new Set(["pending", "active", "suspended", "archived"]);

function companyDirectoryProjection(payload: unknown): CompanyDirectoryProjection {
  if (!recordValue(payload) || payload.schemaVersion !== 1 || !Array.isArray(payload.companies) ||
      typeof payload.isInstanceAdmin !== "boolean") throw new Error("COMPANY_DIRECTORY_PROJECTION_INVALID");
  const ids = new Set<string>();
  const slugs = new Set<string>();
  for (const company of payload.companies) {
    if (!recordValue(company) || !portableWebId(company.id) || ids.has(company.id) ||
        !boundedText(company.name, 120) || company.name.length === 0 ||
        (company.slug !== undefined && (typeof company.slug !== "string" ||
          !/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/.test(company.slug) || slugs.has(company.slug))) ||
        !COMPANY_ROLES.has(String(company.membershipRole))) {
      throw new Error("COMPANY_DIRECTORY_PROJECTION_INVALID");
    }
    ids.add(company.id);
    if (company.slug !== undefined) slugs.add(company.slug);
  }
  return structuredClone(payload) as unknown as CompanyDirectoryProjection;
}

function humanMemberValue(value: unknown): value is CompanyHumanMemberDirectory["members"][number] {
  return recordValue(value) && portableWebId(value.userId) && boundedText(value.displayName, 160) &&
    value.displayName.length > 0 && typeof value.email === "string" && value.email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) && COMPANY_ROLES.has(String(value.role)) &&
    MEMBER_STATUSES.has(String(value.status)) && validDate(value.createdAt) && validDate(value.updatedAt);
}

function companyBackupInspection(payload: unknown): CompanyBackupInspection {
  if (!recordValue(payload) || !portableWebId(payload.companyId) || !portableWebId(payload.actorUserId) ||
      payload.identityBinding !== "EXACT" || !boundedText(payload.name, 120) || !payload.name.length ||
      !boundedText(payload.purpose, 2_000) || !boundedText(payload.locale, 35) ||
      ![payload.eventCount, payload.deliveredPublicationCount, payload.checkpointCount,
        payload.humanCount, payload.agentCount].every((value) => Number.isSafeInteger(value) && Number(value) >= 0) ||
      Number(payload.eventCount) < 1 || Number(payload.humanCount) < 1) {
    throw new Error("COMPANY_RESTORE_INSPECTION_INVALID");
  }
  return structuredClone(payload) as unknown as CompanyBackupInspection;
}

function humanMemberDirectory(payload: unknown): CompanyHumanMemberDirectory {
  if (!recordValue(payload) || payload.schemaVersion !== 1 || !Array.isArray(payload.members)) {
    throw new Error("COMPANY_HUMAN_MEMBER_DIRECTORY_INVALID");
  }
  const ids = new Set<string>();
  for (const member of payload.members) {
    if (!humanMemberValue(member) || ids.has(member.userId)) throw new Error("COMPANY_HUMAN_MEMBER_DIRECTORY_INVALID");
    ids.add(member.userId);
  }
  return structuredClone(payload) as unknown as CompanyHumanMemberDirectory;
}

function formalAccessProjection(payload: unknown): FormalAccessStatus {
  if (!recordValue(payload) || payload.schemaVersion !== 1 || payload.mode !== "FORMAL" ||
      !["managed-cloud", "self-hosted"].includes(String(payload.deploymentProfile)) ||
      !["BLOCKED", "AUTHENTICATION_REQUIRED", "READY"].includes(String(payload.entryState)) ||
      !recordValue(payload.identityProvider) || !["OIDC", "OAUTH2"].includes(String(payload.identityProvider.protocol)) ||
      typeof payload.identityProvider.configured !== "boolean" || !recordValue(payload.session) ||
      typeof payload.session.authenticated !== "boolean" || !recordValue(payload.capabilities) ||
      !Array.isArray(payload.blockers)) throw new Error("FORMAL_ACCESS_PROJECTION_INVALID");
  const protocol = payload.identityProvider.protocol;
  const providerId = payload.identityProvider.providerId ??
    (protocol === "OIDC" ? "enterprise-oidc" : undefined);
  if ((protocol === "OIDC" && providerId !== "enterprise-oidc") ||
      (protocol === "OAUTH2" && providerId !== "feishu")) {
    throw new Error("FORMAL_ACCESS_PROJECTION_INVALID");
  }
  const capabilities = payload.capabilities;
  const capabilityNames = ["diagnostics", "identitySettings", "companyData", "companyMutation", "execution", "approval", "governance"] as const;
  if (capabilityNames.some((name) => typeof capabilities[name] !== "boolean")) {
    throw new Error("FORMAL_ACCESS_PROJECTION_INVALID");
  }
  for (const blocker of payload.blockers) {
    if (!recordValue(blocker) || !["FORMAL_OIDC_NOT_CONFIGURED", "FORMAL_FEISHU_NOT_CONFIGURED",
      "FORMAL_IDENTITY_RUNTIME_UNAVAILABLE", "FORMAL_IDENTITY_REQUIRED"].includes(String(blocker.code)) ||
        !recordValue(blocker.parameters) || Object.values(blocker.parameters).some((values) =>
          !Array.isArray(values) || values.some((value) => !boundedText(value, 160)))) {
      throw new Error("FORMAL_ACCESS_PROJECTION_INVALID");
    }
  }
  const companyCapabilities = ["companyData", "companyMutation", "execution", "approval", "governance"] as const;
  const companyEnabled = companyCapabilities.every((name) => capabilities[name] === true);
  const companyDisabled = companyCapabilities.every((name) => capabilities[name] === false);
  if (capabilities.diagnostics !== true || capabilities.identitySettings !== true ||
      (payload.entryState === "READY" && (!payload.identityProvider.configured || !payload.session.authenticated || !companyEnabled || payload.blockers.length !== 0)) ||
      (payload.entryState === "AUTHENTICATION_REQUIRED" && (!payload.identityProvider.configured || payload.session.authenticated || !companyDisabled ||
        payload.blockers.length !== 1 || (payload.blockers[0] as { code?: unknown }).code !== "FORMAL_IDENTITY_REQUIRED")) ||
      (payload.entryState === "BLOCKED" && (payload.session.authenticated || !companyDisabled || payload.blockers.length !== 1))) {
    throw new Error("FORMAL_ACCESS_PROJECTION_INVALID");
  }
  return structuredClone({ ...payload,
    identityProvider: { ...payload.identityProvider, providerId } }) as unknown as FormalAccessStatus;
}

function formalWorkCatalogPage(payload: unknown, expectedCompanyId: string): FormalWorkCatalog {
  if (!recordValue(payload) || payload.schemaVersion !== 1 || !Array.isArray(payload.items) ||
      !(payload.nextCursor === null || typeof payload.nextCursor === "string")) {
    throw new Error("WORK_CATALOG_PROJECTION_INVALID");
  }
  const workIds = new Set<string>();
  for (const rawItem of payload.items) {
    if (!recordValue(rawItem) || !recordValue(rawItem.work) || !Array.isArray(rawItem.attempts)) {
      throw new Error("WORK_CATALOG_PROJECTION_INVALID");
    }
    const work = rawItem.work;
    if (!portableWebId(work.id) || workIds.has(work.id) || work.companyId !== expectedCompanyId ||
        !boundedText(work.title, 120) || work.title.length === 0 || !boundedText(work.goal, 10_000) ||
        !["AGENT", "DEPARTMENT", "PROJECT"].includes(String(work.scope)) ||
        !portableWebId(work.departmentId) || !(work.projectId === null || portableWebId(work.projectId)) ||
        !portableWebId(work.agentId) || !portableWebId(work.requestedBy) ||
        !Array.isArray(work.actionIds) || work.actionIds.some((id) => !portableWebId(id)) ||
        !(work.parentWorkId === null || portableWebId(work.parentWorkId)) ||
        !portableWebId(work.accountableHumanId) || !portableWebId(work.responsibilityContractId) ||
        !portableWebId(work.runtimeConnectorId) || !WORK_STATUSES.has(String(work.status))) {
      throw new Error("WORK_CATALOG_PROJECTION_INVALID");
    }
    workIds.add(work.id);
    const attempts = new Set<number>();
    for (const rawAttempt of rawItem.attempts) {
      if (!recordValue(rawAttempt) || !portableWebId(rawAttempt.id) || rawAttempt.workId !== work.id ||
          !ATTEMPT_STATUSES.has(String(rawAttempt.status)) || !Number.isSafeInteger(rawAttempt.attemptNumber) ||
          Number(rawAttempt.attemptNumber) < 1 || attempts.has(Number(rawAttempt.attemptNumber)) ||
          !Array.isArray(rawAttempt.evidenceReferences) || rawAttempt.evidenceReferences.some((id) => !portableWebId(id)) ||
          !(rawAttempt.resultId === null || portableWebId(rawAttempt.resultId)) ||
          !["NOT_REQUIRED", "PENDING", "PREPARED"].includes(String(rawAttempt.preparationStatus)) ||
          !(rawAttempt.reconciliation === null || (recordValue(rawAttempt.reconciliation) &&
            ["CONFIRMED_SUCCEEDED", "CONFIRMED_FAILED", "SAFE_TO_RETRY"].includes(String(rawAttempt.reconciliation.resolution)) &&
            portableWebId(rawAttempt.reconciliation.evidenceId) &&
            typeof rawAttempt.reconciliation.resolvedAt === "string" && Number.isFinite(Date.parse(rawAttempt.reconciliation.resolvedAt))))) {
        throw new Error("WORK_CATALOG_PROJECTION_INVALID");
      }
      attempts.add(Number(rawAttempt.attemptNumber));
    }
  }
  return structuredClone(payload) as unknown as FormalWorkCatalog;
}

function companyActivityPage(payload: unknown, afterSequence: number): CompanyActivityPage {
  if (!recordValue(payload) || payload.schemaVersion !== 1 || !Array.isArray(payload.items) || payload.items.length > 100 ||
      !(payload.nextSequence === null || Number.isSafeInteger(payload.nextSequence))) {
    throw new Error("COMPANY_ACTIVITY_PROJECTION_INVALID");
  }
  let previous = afterSequence;
  for (const item of payload.items) {
    if (!recordValue(item) || !Number.isSafeInteger(item.sequence) || Number(item.sequence) <= previous ||
        !portableWebId(item.id) || !boundedText(item.type, 160) || item.type.length === 0 ||
        typeof item.occurredAt !== "string" || !Number.isFinite(Date.parse(item.occurredAt)) ||
        !portableWebId(item.actorId) || !boundedText(item.summary, 2_000) ||
        !(item.correlationId === null || portableWebId(item.correlationId))) {
      throw new Error("COMPANY_ACTIVITY_PROJECTION_INVALID");
    }
    previous = Number(item.sequence);
  }
  if (payload.nextSequence !== null && (payload.items.length === 0 || payload.nextSequence !== previous)) {
    throw new Error("COMPANY_ACTIVITY_PROJECTION_INVALID");
  }
  return structuredClone(payload) as unknown as CompanyActivityPage;
}

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const AGENT_LIFECYCLE_STATUSES = new Set(["active", "paused", "idle", "running", "error", "pending_approval", "terminated"]);

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function approvalRequestValue(value: unknown, expectedCompanyId: string): value is AgentBossProjection["pendingApprovals"][number] {
  if (!recordValue(value) || !portableWebId(value.id) || value.companyId !== expectedCompanyId ||
      value.status !== "AWAITING_APPROVAL" || !validDate(value.requestedAt) || !validDate(value.expiresAt) ||
      !recordValue(value.binding) || !recordValue(value.binding.action)) return false;
  const binding = value.binding;
  const action = binding.action;
  if (!recordValue(action)) return false;
  return portableWebId(action.id) && boundedText(action.type, 160) && action.type.length > 0 &&
    boundedText(action.description, 2_000) && action.description.length > 0 &&
    typeof action.inputDigest === "string" && DIGEST.test(action.inputDigest) &&
    ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(String(action.risk)) &&
    portableWebId(binding.workId) && portableWebId(binding.responsibilityContractId) &&
    portableWebId(binding.executingAgentId) && portableWebId(binding.accountableHumanId) &&
    Array.isArray(binding.evidenceReferences) && binding.evidenceReferences.every(portableWebId) &&
    (binding.resultReference === null || portableWebId(binding.resultReference));
}

function agentBossProjection(payload: unknown, expectedCompanyId: string): AgentBossProjection {
  if (!recordValue(payload) || payload.schemaVersion !== 1 || payload.mode !== "PRODUCTION" ||
      !recordValue(payload.viewer) || !portableWebId(payload.viewer.actorId) ||
      !boundedText(payload.viewer.displayName, 160) || !recordValue(payload.organization) ||
      !recordValue(payload.responsibilities) || !recordValue(payload.agentLifecycle) ||
      !Array.isArray(payload.work) || !Array.isArray(payload.attempts) ||
      !Array.isArray(payload.pendingApprovals) || !validDate(payload.generatedAt)) {
    throw new Error("FORMAL_API_PROJECTION_INVALID");
  }
  let organization: OrganizationDraft;
  try {
    organization = validateOrganizationDraft(payload.organization as unknown as OrganizationDraft);
  } catch {
    throw new Error("FORMAL_API_PROJECTION_INVALID");
  }
  if (organization.company.id !== expectedCompanyId ||
      !Number.isSafeInteger(payload.responsibilities.revision) || Number(payload.responsibilities.revision) < 0 ||
      !Array.isArray(payload.responsibilities.contracts)) {
    throw new Error("FORMAL_API_PROJECTION_INVALID");
  }
  let contracts: ResponsibilityContract[];
  try {
    contracts = validateResponsibilityContracts(
      payload.responsibilities.contracts as unknown as readonly ResponsibilityContract[], organization,
    );
  } catch {
    throw new Error("FORMAL_API_PROJECTION_INVALID");
  }
  if (!Number.isSafeInteger(payload.agentLifecycle.revision) || Number(payload.agentLifecycle.revision) < 0 ||
      !Array.isArray(payload.agentLifecycle.agents) || payload.agentLifecycle.agents.length !== organization.agents.length) {
    throw new Error("FORMAL_API_PROJECTION_INVALID");
  }
  const organizationAgentIds = new Set(organization.agents.map(({ id }) => id));
  const lifecycleAgentIds = new Set<string>();
  for (const rawAgent of payload.agentLifecycle.agents) {
    if (!recordValue(rawAgent) || rawAgent.companyId !== expectedCompanyId || !portableWebId(rawAgent.agentId) ||
        !organizationAgentIds.has(rawAgent.agentId) || lifecycleAgentIds.has(rawAgent.agentId) ||
        !AGENT_LIFECYCLE_STATUSES.has(String(rawAgent.status)) ||
        !(rawAgent.pauseReason === null || ["manual", "budget", "system"].includes(String(rawAgent.pauseReason))) ||
        !(rawAgent.pausedAt === null || validDate(rawAgent.pausedAt)) ||
        !(rawAgent.errorCode === null || boundedText(rawAgent.errorCode, 160)) || !validDate(rawAgent.updatedAt) ||
        !recordValue(rawAgent.eligibility) || typeof rawAgent.eligibility.assignable !== "boolean" ||
        typeof rawAgent.eligibility.invokable !== "boolean" ||
        !["eligible", "terminated", "pending_approval", "invalid_org_chain", "unknown_status"].includes(String(rawAgent.eligibility.assignabilityReason)) ||
        !["eligible", "terminated", "pending_approval", "paused", "invalid_org_chain", "unknown_status"].includes(String(rawAgent.eligibility.invokabilityReason)) ||
        !recordValue(rawAgent.eligibility.orgChainHealth) ||
        !["healthy", "invalid_org_chain"].includes(String(rawAgent.eligibility.orgChainHealth.status)) ||
        !["healthy", "terminated_ancestor", "missing_manager", "cycle"].includes(String(rawAgent.eligibility.orgChainHealth.reason)) ||
        !(rawAgent.eligibility.orgChainHealth.firstInvalidAgentId === null || portableWebId(rawAgent.eligibility.orgChainHealth.firstInvalidAgentId)) ||
        !Array.isArray(rawAgent.eligibility.orgChainHealth.pausedAncestorIds) ||
        !rawAgent.eligibility.orgChainHealth.pausedAncestorIds.every(portableWebId)) {
      throw new Error("FORMAL_API_PROJECTION_INVALID");
    }
    lifecycleAgentIds.add(rawAgent.agentId);
  }
  const workIds = new Set(payload.work.flatMap((value) =>
    recordValue(value) && portableWebId(value.id) ? [value.id] : []));
  if (workIds.size !== payload.work.length) throw new Error("FORMAL_API_PROJECTION_INVALID");
  const attemptsByWork = new Map<string, unknown[]>();
  for (const attempt of payload.attempts) {
    if (!recordValue(attempt) || !portableWebId(attempt.workId) || !workIds.has(attempt.workId)) {
      throw new Error("FORMAL_API_PROJECTION_INVALID");
    }
    attemptsByWork.set(attempt.workId, [...(attemptsByWork.get(attempt.workId) ?? []), attempt]);
  }
  const catalog = formalWorkCatalogPage({
    schemaVersion: 1,
    items: payload.work.map((work) => ({ work, attempts: attemptsByWork.get((work as { id: string }).id) ?? [] })),
    nextCursor: null,
  }, expectedCompanyId);
  const approvalIds = new Set<string>();
  for (const approval of payload.pendingApprovals) {
    if (!approvalRequestValue(approval, expectedCompanyId) || approvalIds.has(approval.id) ||
        !workIds.has(approval.binding.workId) ||
        !contracts.some(({ id, agentId, accountableHumanId }) =>
          id === approval.binding.responsibilityContractId && agentId === approval.binding.executingAgentId &&
          accountableHumanId === approval.binding.accountableHumanId)) {
      throw new Error("FORMAL_API_PROJECTION_INVALID");
    }
    approvalIds.add(approval.id);
  }
  return {
    ...(structuredClone(payload) as unknown as AgentBossProjection),
    organization,
    responsibilities: { revision: Number(payload.responsibilities.revision), contracts },
    work: catalog.items.map(({ work }) => work),
    attempts: catalog.items.flatMap(({ attempts }) => attempts),
  };
}

function accountabilityLedgerProjection(payload: unknown, expectedCompanyId: string): AccountabilityLedgerProjection {
  if (!recordValue(payload) || payload.schemaVersion !== 1 || payload.companyId !== expectedCompanyId ||
      !Array.isArray(payload.approvals) || !Array.isArray(payload.evidence) || !validDate(payload.generatedAt)) {
    throw new Error("ACCOUNTABILITY_LEDGER_INVALID");
  }
  const approvalIds = new Set<string>();
  for (const item of payload.approvals) {
    if (!recordValue(item) || !approvalRequestValue(item.request, expectedCompanyId) ||
        approvalIds.has(item.request.id) || !["PENDING", "APPROVED", "REJECTED", "EXPIRED"].includes(String(item.status))) {
      throw new Error("ACCOUNTABILITY_LEDGER_INVALID");
    }
    approvalIds.add(item.request.id);
    if (item.decision === null) {
      if (item.status === "APPROVED" || item.status === "REJECTED") throw new Error("ACCOUNTABILITY_LEDGER_INVALID");
      continue;
    }
    if (!recordValue(item.decision) || item.decision.requestId !== item.request.id ||
        !["APPROVED", "REJECTED"].includes(String(item.decision.decision)) || item.status !== item.decision.decision ||
        !portableWebId(item.decision.decidedBy) || !validDate(item.decision.decidedAt) ||
        !(item.decision.note === undefined || boundedText(item.decision.note, 2_000))) {
      throw new Error("ACCOUNTABILITY_LEDGER_INVALID");
    }
  }
  const evidenceIds = new Set<string>();
  for (const item of payload.evidence) {
    if (!recordValue(item) || !portableWebId(item.id) || evidenceIds.has(item.id) ||
        !portableWebId(item.workId) || !(item.attemptId === null || portableWebId(item.attemptId)) ||
        !["PLAN", "TOOL_ACTIVITY", "ARTIFACT", "RESULT"].includes(String(item.kind)) ||
        !boundedText(item.summary, 2_000) || typeof item.contentDigest !== "string" || !DIGEST.test(item.contentDigest) ||
        !validDate(item.recordedAt) || item.provenance !== "PRODUCTION" ||
        !["AUDIT_STORE", "CONNECTOR"].includes(String(item.source))) {
      throw new Error("ACCOUNTABILITY_LEDGER_INVALID");
    }
    evidenceIds.add(item.id);
  }
  return structuredClone(payload) as unknown as AccountabilityLedgerProjection;
}

async function accountabilityExportPackage(
  payload: unknown,
  expectedCompanyId: string,
): Promise<AccountabilityExportPackage> {
  if (!recordValue(payload) || payload.schemaVersion !== 1 || !recordValue(payload.package)) {
    throw new Error("ACCOUNTABILITY_EXPORT_INVALID");
  }
  const value = payload.package;
  if (value.schemaVersion !== 1 || value.packageType !== "COMPANY_OS_ACCOUNTABILITY_EXPORT" ||
      !portableWebId(value.exportId) || value.companyId !== expectedCompanyId ||
      !Number.isSafeInteger(value.sourceEventSequence) || Number(value.sourceEventSequence) < 0 ||
      !validDate(value.exportedAt) || !recordValue(value.policy) ||
      !portableWebId(value.policy.retentionPolicyId) || !portableWebId(value.policy.exportPolicyId) ||
      !["AUDIT_REVIEW", "INCIDENT_REVIEW", "CUSTOMER_PORTABILITY"].includes(String(value.policy.purposeCode)) ||
      !Array.isArray(value.approvals) || !Array.isArray(value.evidence) ||
      !Array.isArray(value.responsibilities) || typeof value.digest !== "string" || !DIGEST.test(value.digest)) {
    throw new Error("ACCOUNTABILITY_EXPORT_INVALID");
  }
  accountabilityLedgerProjection({ schemaVersion: 1, companyId: expectedCompanyId,
    approvals: value.approvals, evidence: value.evidence, generatedAt: value.exportedAt }, expectedCompanyId);
  const approvalIds = new Set(value.approvals.map((item) => (item as { request: { id: string } }).request.id));
  const evidenceIds = new Set(value.evidence.map((item) => (item as { id: string }).id));
  const workIds = new Set<string>();
  for (const item of value.responsibilities) {
    if (!recordValue(item) || !portableWebId(item.workId) || workIds.has(item.workId) ||
        !portableWebId(item.goalInitiatorId) || !portableWebId(item.accountableHumanId) ||
        !portableWebId(item.executingAgentId) || !Array.isArray(item.permissionReferences) ||
        item.permissionReferences.some((id) => !portableWebId(id)) ||
        !Array.isArray(item.dataAuthorizationReferences) ||
        item.dataAuthorizationReferences.some((id) => !portableWebId(id)) ||
        !Array.isArray(item.approvalReferences) ||
        item.approvalReferences.some((id) => !portableWebId(id) || !approvalIds.has(id)) ||
        !Array.isArray(item.evidenceReferences) ||
        item.evidenceReferences.some((id) => !portableWebId(id) || !evidenceIds.has(id)) ||
        !(item.resultReference === null || (portableWebId(item.resultReference) &&
          evidenceIds.has(item.resultReference)))) throw new Error("ACCOUNTABILITY_EXPORT_INVALID");
    workIds.add(item.workId);
  }
  assertSanitizedProjection(value, expectedCompanyId);
  const unsigned = { schemaVersion: 1 as const,
    packageType: "COMPANY_OS_ACCOUNTABILITY_EXPORT" as const,
    exportId: value.exportId, companyId: value.companyId,
    sourceEventSequence: value.sourceEventSequence, exportedAt: value.exportedAt,
    policy: value.policy, approvals: value.approvals, evidence: value.evidence,
    responsibilities: value.responsibilities };
  const digestBytes = new Uint8Array(await globalThis.crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(JSON.stringify(unsigned)),
  ));
  const digest = `sha256:${[...digestBytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  if (digest !== value.digest) throw new Error("ACCOUNTABILITY_EXPORT_DIGEST_MISMATCH");
  return structuredClone(value) as unknown as AccountabilityExportPackage;
}

const PRIVATE_PROJECTION_FIELDS = new Set([
  "secretReferenceId", "credentialReference", "managementUrl", "clientSecret", "accessToken",
  "refreshToken", "sessionToken", "privateKey", "password", "rawPrompt", "reasoning",
  "chainOfThought", "vendorSession", "privateSession", "rawOutput", "rawEnterpriseRecord",
]);

function assertSanitizedProjection(value: unknown, expectedCompanyId: string, depth = 0, budget = { remaining: 20_000 }): void {
  budget.remaining -= 1;
  if (budget.remaining < 0 || depth > 16) throw new Error("ADMINISTRATION_PROJECTION_INVALID");
  if (Array.isArray(value)) {
    for (const item of value) assertSanitizedProjection(item, expectedCompanyId, depth + 1, budget);
    return;
  }
  if (!recordValue(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (PRIVATE_PROJECTION_FIELDS.has(key) || (key === "companyId" && nested !== expectedCompanyId)) {
      throw new Error("ADMINISTRATION_PROJECTION_INVALID");
    }
    assertSanitizedProjection(nested, expectedCompanyId, depth + 1, budget);
  }
}

function administrationProjection(payload: unknown, expectedCompanyId: string): AdministrationProjection {
  const runtimeFederatedSources = recordValue(payload) && payload.runtimeFederatedSources === undefined
    ? []
    : recordValue(payload) ? payload.runtimeFederatedSources : undefined;
  const agentRuntimeBindings = recordValue(payload) && payload.agentRuntimeBindings === undefined
    ? { revision: 0, bindings: [] }
    : recordValue(payload) ? payload.agentRuntimeBindings : undefined;
  if (!recordValue(payload) || payload.schemaVersion !== 1 || payload.mode !== "PRODUCTION" ||
      !recordValue(payload.viewer) || !portableWebId(payload.viewer.actorId) || !boundedText(payload.viewer.displayName, 160) ||
      !portableWebId(payload.retentionPolicyId) ||
      !recordValue(payload.connectorCatalog) || !Number.isSafeInteger(payload.connectorCatalog.revision) ||
      Number(payload.connectorCatalog.revision) < 0 || !Array.isArray(payload.connectorCatalog.connectors) ||
      !recordValue(agentRuntimeBindings) || !Number.isSafeInteger(agentRuntimeBindings.revision) ||
      Number(agentRuntimeBindings.revision) < 0 || !Array.isArray(agentRuntimeBindings.bindings) ||
      !Array.isArray(payload.runtimeConnectors) || !(payload.secretBrokerRuntime === null || recordValue(payload.secretBrokerRuntime)) ||
      !Array.isArray(payload.runtimeModelProviders) || !Array.isArray(payload.runtimeDataConnectors) ||
      !Array.isArray(runtimeFederatedSources) ||
      !recordValue(payload.governance) || !Number.isSafeInteger(payload.governance.revision) ||
      !Array.isArray(payload.governance.modelRoutingPolicies) || !Array.isArray(payload.governance.dataAuthorizationContracts) ||
      !recordValue(payload.toolAccess) || payload.toolAccess.companyId !== expectedCompanyId ||
      !Number.isSafeInteger(payload.toolAccess.revision) || !Array.isArray(payload.toolAccess.profiles) ||
      !Array.isArray(payload.toolAccess.entries) || !Array.isArray(payload.toolAccess.bindings) || !Array.isArray(payload.toolAccess.policies) ||
      !recordValue(payload.usageBudget) || !recordValue(payload.usageBudget.ledger) ||
      payload.usageBudget.ledger.companyId !== expectedCompanyId || !Array.isArray(payload.usageBudget.ledger.costEvents) ||
      !Array.isArray(payload.usageBudget.ledger.policies) || !Array.isArray(payload.usageBudget.policySummaries) ||
      !Number.isSafeInteger(payload.usageBudget.totalReportedCostCents) || Number(payload.usageBudget.totalReportedCostCents) < 0 ||
      !Number.isSafeInteger(payload.usageBudget.unpricedEventCount) || Number(payload.usageBudget.unpricedEventCount) < 0 ||
      !Array.isArray(payload.egressDecisions) || !validDate(payload.generatedAt)) {
    throw new Error("ADMINISTRATION_PROJECTION_INVALID");
  }
  for (const binding of agentRuntimeBindings.bindings) {
    if (!recordValue(binding) || binding.companyId !== expectedCompanyId || !portableWebId(binding.agentId) ||
        !(binding.connectorId === null || portableWebId(binding.connectorId)) ||
        !(binding.capabilityDigest === null || /^sha256:[a-f0-9]{64}$/.test(String(binding.capabilityDigest))) ||
        !Number.isSafeInteger(binding.revision) || Number(binding.revision) < 0 ||
        !["UNBOUND", "BOUND_UNVERIFIED", "VERIFIED", "REVOKED"].includes(String(binding.status)) ||
        !(binding.changedBy === null || portableWebId(binding.changedBy)) ||
        !(binding.reason === null || boundedText(binding.reason, 1_000)) || !validDate(binding.changedAt)) {
      throw new Error("ADMINISTRATION_PROJECTION_INVALID");
    }
  }
  const health = new Set(["HEALTHY", "DEGRADED", "UNAVAILABLE"]);
  for (const connector of payload.runtimeConnectors) {
    if (!recordValue(connector) || !portableWebId(connector.connectorId) || !boundedText(connector.displayName, 160) ||
        !boundedText(connector.protocolVersion, 32) || !Number.isSafeInteger(connector.maximumTimeoutSeconds) ||
        typeof connector.supportsPause !== "boolean" || typeof connector.supportsResume !== "boolean" ||
        typeof connector.supportsCancellation !== "boolean" || typeof connector.supportsEvidence !== "boolean" ||
        !health.has(String(connector.health)) || typeof connector.registered !== "boolean") {
      throw new Error("ADMINISTRATION_PROJECTION_INVALID");
    }
  }
  const federatedHealth = new Set(["NOT_CHECKED", "HEALTHY", "UNAVAILABLE"]);
  for (const source of runtimeFederatedSources) {
    if (!recordValue(source) || !portableWebId(source.connectorId) || source.protocolVersion !== "2.0" ||
        !Array.isArray(source.dataCapabilities) || !Array.isArray(source.controlCapabilities) ||
        source.dataCapabilities.some((value) => !boundedText(value, 80)) ||
        source.controlCapabilities.some((value) => !boundedText(value, 80)) ||
        !Number.isSafeInteger(source.maximumBatchSize) || Number(source.maximumBatchSize) < 1 ||
        Number(source.maximumBatchSize) > 200 || !federatedHealth.has(String(source.health)) ||
        !(source.checkedAt === null || validDate(source.checkedAt)) ||
        !(source.lastSuccessfulAt === null || validDate(source.lastSuccessfulAt))) {
      throw new Error("ADMINISTRATION_PROJECTION_INVALID");
    }
  }
  for (const provider of payload.runtimeModelProviders) {
    if (!recordValue(provider) || !portableWebId(provider.providerAdapterId) || !boundedText(provider.displayName, 160) ||
        !boundedText(provider.protocolVersion, 32) || !Array.isArray(provider.modelReferences) ||
        provider.modelReferences.some((id) => !portableWebId(id)) || !Array.isArray(provider.supportedResidencies) ||
        !health.has(String(provider.health))) throw new Error("ADMINISTRATION_PROJECTION_INVALID");
  }
  for (const connector of payload.runtimeDataConnectors) {
    if (!recordValue(connector) || !portableWebId(connector.connectorId) || !boundedText(connector.displayName, 160) ||
        !boundedText(connector.protocolVersion, 32) || !Array.isArray(connector.dataSourceIds) ||
        connector.dataSourceIds.some((id) => !portableWebId(id)) || !Array.isArray(connector.supportedOperations) ||
        !health.has(String(connector.health))) throw new Error("ADMINISTRATION_PROJECTION_INVALID");
  }
  assertSanitizedProjection(payload, expectedCompanyId);
  return structuredClone({ ...payload, runtimeFederatedSources, agentRuntimeBindings }) as unknown as AdministrationProjection;
}

function operationalRiskProjection(payload: unknown, expectedCompanyId: string): OperationalRiskProjection {
  if (!recordValue(payload) || payload.schemaVersion !== 1 || payload.companyId !== expectedCompanyId ||
      !Array.isArray(payload.traces) || !Array.isArray(payload.accessEdges) ||
      !Array.isArray(payload.violations) || !Array.isArray(payload.alerts) || !Array.isArray(payload.cases) ||
      !validDate(payload.generatedAt)) throw new Error("OPERATIONAL_RISK_PROJECTION_INVALID");
  const statuses = new Set(["OPEN", "CONTAINED", "INVESTIGATING", "REMEDIATING", "REVIEW",
    "RECOVERY_REQUESTED", "RECOVERED", "CLOSED"]);
  const alertStatuses = new Set(["OPEN", "CONTAINED", "RESOLVED"]);
  for (const record of [...payload.traces, ...payload.accessEdges, ...payload.violations,
    ...payload.alerts, ...payload.cases]) {
    if (!recordValue(record) || record.companyId !== expectedCompanyId || !portableWebId(record.id)) {
      throw new Error("OPERATIONAL_RISK_PROJECTION_INVALID");
    }
  }
  for (const record of payload.cases) {
    if (!recordValue(record) || !statuses.has(String(record.status)) || !portableWebId(record.workId) ||
        !portableWebId(record.agentId) || !portableWebId(record.accountableHumanId) ||
        !portableWebId(record.ownerHumanId) || !Number.isSafeInteger(record.revision) || Number(record.revision) < 0 ||
        !boundedText(record.summary, 1_000) || !Array.isArray(record.alertIds) ||
        record.alertIds.some((id) => !portableWebId(id))) throw new Error("OPERATIONAL_RISK_PROJECTION_INVALID");
  }
  for (const record of payload.alerts) {
    if (!recordValue(record) || !alertStatuses.has(String(record.status)) ||
        !["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(String(record.severity))) {
      throw new Error("OPERATIONAL_RISK_PROJECTION_INVALID");
    }
  }
  assertSanitizedProjection(payload, expectedCompanyId);
  return structuredClone(payload) as unknown as OperationalRiskProjection;
}

export function createFormalApplicationClient(
  options: FormalApplicationClientOptions,
): CompanyOSApplicationClient {
  const fetcher = options.fetcher ?? fetch;
  const requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 120_000) {
    throw new Error("FORMAL_API_REQUEST_TIMEOUT_INVALID");
  }
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const webOrigin = new URL(options.webOrigin).origin;
  let selectedCompanyId = options.companyId ?? null;
  let signInProviderId: "enterprise-oidc" | "feishu" = "enterprise-oidc";
  const accessEndpoint = `${baseUrl}/api/v1/access`;
  const companiesEndpoint = `${baseUrl}/api/v1/companies`;

  function companyId(): string {
    if (!selectedCompanyId) throw new Error("COMPANY_SELECTION_REQUIRED");
    return selectedCompanyId;
  }

  function companyEndpoint(suffix: string): string {
    return `${baseUrl}/api/v1/companies/${encodeURIComponent(companyId())}${suffix}`;
  }

  async function requestJson(url: string, init: RequestInit, maximumBytes = MAX_FORMAL_API_RESPONSE_BYTES): Promise<{
    readonly response: Response;
    readonly payload: unknown;
  }> {
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort("FORMAL_API_REQUEST_TIMEOUT");
        reject(new Error("FORMAL_API_REQUEST_TIMEOUT"));
      }, requestTimeoutMs);
    });
    const operation = (async () => {
      const response = await fetcher(url, { ...init, signal: controller.signal });
      if ([502, 503, 504].includes(response.status)) {
        void response.body?.cancel("FORMAL_API_UNREACHABLE").catch(() => undefined);
        throw new Error("FORMAL_API_UNREACHABLE");
      }
      const payload = await readFormalApiJson(response, maximumBytes);
      return { response, payload };
    })();
    try {
      return await Promise.race([operation, timeout]);
    } catch (error) {
      if (controller.signal.aborted) throw new Error("FORMAL_API_REQUEST_TIMEOUT");
      if (error instanceof TypeError) throw new Error("FORMAL_API_UNREACHABLE");
      throw error;
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }
  }

  async function getJson(url: string): Promise<unknown> {
    const { response, payload } = await requestJson(url, {
      method: "GET", headers: { accept: "application/json" }, credentials: "include",
    });
    if (!response.ok) {
      throw new Error(formalApiErrorCode(payload));
    }
    return payload;
  }

  async function projection(): Promise<AgentBossProjection> {
    const payload = await getJson(companyEndpoint("/agent-boss"));
    return agentBossProjection(payload, companyId());
  }

  async function command(path: string, body: unknown): Promise<void> {
    const { response, payload } = await requestJson(`${baseUrl}${path}`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(formalApiErrorCode(payload));
    }
  }

  async function postJson(path: string, body: unknown): Promise<unknown> {
    const { response, payload } = await requestJson(`${baseUrl}${path}`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(formalApiErrorCode(payload));
    }
    return payload;
  }

  async function putJson(path: string, body: unknown): Promise<unknown> {
    const { response, payload } = await requestJson(`${baseUrl}${path}`, {
      method: "PUT",
      headers: { accept: "application/json", "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(formalApiErrorCode(payload));
    }
    return payload;
  }

  async function patchJson(path: string, body: unknown): Promise<unknown> {
    const { response, payload } = await requestJson(`${baseUrl}${path}`, {
      method: "PATCH",
      headers: { accept: "application/json", "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(formalApiErrorCode(payload));
    }
    return payload;
  }

  async function snapshot(): Promise<CompanyWorkState> {
    const value = await projection();
    const work = value.work.at(-1);
    const attempt = latestAttemptForWork(value, work?.id);
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
        evidenceIds: attempt?.evidenceReferences ?? [],
        resultId: attempt?.resultId ?? null,
      },
    };
  }

  const unsupported = async (): Promise<never> => {
    throw new Error("FORMAL_MUTATION_NOT_CONFIGURED");
  };
  return {
    mode: "FORMAL",
    async formalAccess() {
      const payload = await getJson(accessEndpoint);
      const projection = formalAccessProjection(payload);
      signInProviderId = projection.identityProvider.providerId;
      return projection;
    },
    async beginFormalSignIn(callbackPath = "/") {
      if (!callbackPath.startsWith("/") || callbackPath.startsWith("//")) {
        throw new Error("FORMAL_CALLBACK_PATH_INVALID");
      }
      const { response, payload } = await requestJson(`${baseUrl}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          provider: signInProviderId,
          callbackURL: new URL(callbackPath, `${webOrigin}/`).href,
        }),
      });
      if (!response.ok || !payload || typeof payload !== "object" ||
          typeof (payload as { url?: unknown }).url !== "string") {
        throw new Error("FORMAL_OIDC_START_FAILED");
      }
      const authorizationUrl = new URL((payload as { url: string }).url);
      if (authorizationUrl.protocol !== "https:") throw new Error("FORMAL_OIDC_AUTHORIZATION_URL_INVALID");
      return authorizationUrl.href;
    },
    async signOut() {
      await postJson("/api/auth/sign-out", {});
    },
    async companies() {
      const payload = await getJson(companiesEndpoint);
      return companyDirectoryProjection(payload);
    },
    async claimFirstAdmin() {
      const payload = await postJson("/api/v1/bootstrap/claim", {});
      if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
          (payload as { claimed?: unknown }).claimed !== true) {
        throw new Error("FIRST_ADMIN_CLAIM_PROJECTION_INVALID");
      }
    },
    async createCompany(input) {
      const payload = await postJson("/api/v1/companies", input);
      if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
          typeof (payload as { companyId?: unknown }).companyId !== "string") {
        throw new Error("COMPANY_CREATE_PROJECTION_INVALID");
      }
      selectedCompanyId = (payload as { companyId: string }).companyId;
      return selectedCompanyId;
    },
    selectCompany(nextCompanyId) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(nextCompanyId)) {
        throw new Error("COMPANY_SELECTION_INVALID");
      }
      selectedCompanyId = nextCompanyId;
    },
    async setupOrganization(input) {
      const payload = await postJson(
        `/api/v1/companies/${encodeURIComponent(companyId())}/organization`,
        input,
      );
      if (!recordValue(payload)) {
        throw new Error("ORGANIZATION_CREATE_PROJECTION_INVALID");
      }
      organizationProjection(payload.organization, companyId(), "ORGANIZATION_CREATE_PROJECTION_INVALID");
    },
    async inviteHuman(input) {
      const payload = await postJson(
        `/api/v1/companies/${encodeURIComponent(companyId())}/human-invites`,
        input,
      );
      if (!recordValue(payload) || !portableWebId(payload.inviteId) ||
          typeof payload.token !== "string" || !/^company_os_invite_[A-Za-z0-9_-]{32,128}$/.test(payload.token) ||
          payload.invitePath !== `/invite/${payload.token}` || !validDate(payload.expiresAt)) {
        throw new Error("HUMAN_INVITE_PROJECTION_INVALID");
      }
      return structuredClone(payload) as unknown as HumanInviteProjection;
    },
    async humanMembers() {
      const payload = await getJson(
        companyEndpoint("/human-members"),
      );
      return humanMemberDirectory(payload);
    },
    async updateHumanMember(userId, input) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(userId)) throw new Error("COMPANY_MEMBER_ID_INVALID");
      const payload = await patchJson(
        `/api/v1/companies/${encodeURIComponent(companyId())}/human-members/${encodeURIComponent(userId)}`,
        input,
      );
      if (!humanMemberValue(payload) || payload.userId !== userId) {
        throw new Error("COMPANY_HUMAN_MEMBER_PROJECTION_INVALID");
      }
      return structuredClone(payload);
    },
    async acceptHumanInvite(token) {
      if (!/^company_os_invite_[A-Za-z0-9_-]{32,128}$/.test(token)) {
        throw new Error("HUMAN_INVITE_TOKEN_INVALID");
      }
      const payload = await postJson(
        `/api/v1/human-invites/${encodeURIComponent(token)}/accept`,
        {},
      );
      if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
          (payload as { accepted?: unknown }).accepted !== true ||
          !portableWebId((payload as { companyId?: unknown }).companyId) ||
          !["owner", "admin", "operator", "viewer"].includes(
            String((payload as { membershipRole?: unknown }).membershipRole),
          )) {
        throw new Error("HUMAN_INVITE_ACCEPTANCE_INVALID");
      }
      return structuredClone(payload) as HumanInviteAcceptanceProjection;
    },
    async organization() { return structuredClone((await projection()).organization); },
    async replaceOrganization(organization) {
      const payload = await postJson(
        `/api/v1/companies/${encodeURIComponent(companyId())}/organization/revisions`,
        { organization },
      );
      return organizationProjection(payload, companyId(), "ORGANIZATION_REVISION_PROJECTION_INVALID");
    },
    async updateCompanyProfile(input) {
      const payload = await patchJson(companyEndpoint("/profile").slice(baseUrl.length), input);
      return organizationProjection(payload, companyId(), "COMPANY_PROFILE_PROJECTION_INVALID");
    },
    async archiveDepartment(departmentId, input) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(departmentId)) throw new Error("DEPARTMENT_ID_INVALID");
      const payload = await postJson(companyEndpoint(
        `/departments/${encodeURIComponent(departmentId)}/archive`).slice(baseUrl.length), input);
      return organizationProjection(payload, companyId(), "ORGANIZATION_REVISION_PROJECTION_INVALID");
    },
    async administration() {
      const payload = await getJson(companyEndpoint("/administration"));
      return administrationProjection(payload, companyId());
    },
    async operationalRisk() {
      return operationalRiskProjection(await getJson(companyEndpoint("/operational-risk")), companyId());
    },
    async manageAiCase(caseId, input) {
      if (!PORTABLE_WEB_ID.test(caseId)) throw new Error("AI_CASE_ID_INVALID");
      const action = input.operation.toLowerCase().replaceAll("_", "-");
      const { operation: _operation, ...body } = input;
      await command(`/api/v1/companies/${encodeURIComponent(companyId())}/ai-cases/${encodeURIComponent(caseId)}/actions/${action}`, body);
    },
    async planning() {
      const payload = await getJson(companyEndpoint("/planning-catalog"));
      return planningProjection(payload, companyId());
    },
    async replacePlanning(input) {
      const payload = await putJson(companyEndpoint("/planning-catalog").slice(baseUrl.length), {
        expectedRevision: input.revision, goals: input.goals, projects: input.projects,
      });
      return planningProjection(payload, companyId());
    },
    async createGoal(input) {
      return planningProjection(await postJson(companyEndpoint("/goals").slice(baseUrl.length), input), companyId());
    },
    async updateGoal(goalId, input) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(goalId)) throw new Error("GOAL_ID_INVALID");
      return planningProjection(await patchJson(
        companyEndpoint(`/goals/${encodeURIComponent(goalId)}`).slice(baseUrl.length),
        input,
      ), companyId());
    },
    async createProject(input) {
      return planningProjection(await postJson(companyEndpoint("/projects").slice(baseUrl.length), input), companyId());
    },
    async updateProject(projectId, input) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(projectId)) throw new Error("PROJECT_ID_INVALID");
      return planningProjection(await patchJson(
        companyEndpoint(`/projects/${encodeURIComponent(projectId)}`).slice(baseUrl.length),
        input,
      ), companyId());
    },
    async archiveProject(projectId, expectedRevision) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(projectId)) throw new Error("PROJECT_ID_INVALID");
      return planningProjection(await postJson(
        companyEndpoint(`/projects/${encodeURIComponent(projectId)}/archive`).slice(baseUrl.length),
        { expectedRevision },
      ), companyId());
    },
    async replaceConnectorCatalog(input) {
      await putJson(companyEndpoint("/connector-catalog").slice(baseUrl.length), input);
    },
    async registerConnectorRuntime(input) {
      await postJson(companyEndpoint("/connectors").slice(baseUrl.length), input);
    },
    async setConnectorStatus(connectorId, input) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(connectorId)) throw new Error("CONNECTOR_ID_INVALID");
      await patchJson(companyEndpoint(`/connectors/${encodeURIComponent(connectorId)}`).slice(baseUrl.length), input);
    },
    async changeAgentRuntimeBinding(agentId, input) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(agentId)) throw new Error("AGENT_ID_INVALID");
      await postJson(companyEndpoint(`/agents/${encodeURIComponent(agentId)}/runtime-binding`).slice(baseUrl.length), input);
    },
    async createDataAuthorizationContract(input) {
      await postJson(companyEndpoint("/data-authorization-contracts").slice(baseUrl.length), input);
    },
    async setDataAuthorizationStatus(contractId, input) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(contractId)) throw new Error("DATA_AUTHORIZATION_ID_INVALID");
      await patchJson(companyEndpoint(`/data-authorization-contracts/${encodeURIComponent(contractId)}`).slice(baseUrl.length), input);
    },
    async createModelRoute(input) {
      await postJson(companyEndpoint("/model-routes").slice(baseUrl.length), input);
    },
    async setModelRouteEnabled(routeId, input) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(routeId)) throw new Error("MODEL_ROUTE_ID_INVALID");
      await patchJson(companyEndpoint(`/model-routes/${encodeURIComponent(routeId)}`).slice(baseUrl.length), input);
    },
    async createToolProfile(input) {
      await postJson(companyEndpoint("/tool-profiles").slice(baseUrl.length), input);
    },
    async bindToolProfile(profileId, input) {
      if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(profileId)) throw new Error("TOOL_PROFILE_ID_INVALID");
      await postJson(companyEndpoint(`/tool-profiles/${encodeURIComponent(profileId)}/bindings`).slice(baseUrl.length), input);
    },
    async createToolPolicy(input) {
      await postJson(companyEndpoint("/tool-policies").slice(baseUrl.length), input);
    },
    async setToolProfileStatus(profileId, input) {
      if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(profileId)) throw new Error("TOOL_PROFILE_ID_INVALID");
      await patchJson(companyEndpoint(`/tool-profiles/${encodeURIComponent(profileId)}`).slice(baseUrl.length), input);
    },
    async upsertBudgetPolicy(input) {
      await postJson(companyEndpoint("/budgets/policies").slice(baseUrl.length), input);
    },
    async replaceGovernanceCatalog(input) {
      await putJson(companyEndpoint("/governance-catalog").slice(baseUrl.length), input);
    },
    async replaceResponsibilityContracts(input) {
      await putJson(companyEndpoint("/responsibility-contracts").slice(baseUrl.length), input);
    },
    async transitionAgentLifecycle(agentId, input) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(agentId)) throw new Error("AGENT_ID_INVALID");
      const suffix = ({
        APPROVE: "approve", PAUSE: "pause", RESUME: "resume",
        CLEAR_ERROR: "clear-error", TERMINATE: "terminate",
      } as const)[input.operation];
      await postJson(
        `/api/v1/companies/${encodeURIComponent(companyId())}/agents/${encodeURIComponent(agentId)}/${suffix}`,
        {
          expectedRevision: input.expectedRevision,
          ...(input.operation === "PAUSE" && input.pauseReason ? { pauseReason: input.pauseReason } : {}),
        },
      );
    },
    async transferResponsibility(agentId, input) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(agentId)) throw new Error("AGENT_ID_INVALID");
      await postJson(companyEndpoint(`/agents/${encodeURIComponent(agentId)}/responsibility-transfers`).slice(baseUrl.length), input);
    },
    async exportCompany() {
      const { response, payload } = await requestJson(companyEndpoint("/portability/export"), {
        method: "GET", headers: { accept: "application/json" }, credentials: "include",
      }, MAX_PORTABILITY_RESPONSE_BYTES);
      if (!response.ok) throw new Error(formalApiErrorCode(payload));
      if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
          (payload as { schemaVersion?: unknown }).schemaVersion !== 1 ||
          !("backup" in payload)) {
        throw new Error("COMPANY_EXPORT_PROJECTION_INVALID");
      }
      return `${JSON.stringify((payload as { backup: unknown }).backup, null, 2)}\n`;
    },
    async exportAccountability(input) {
      if (!portableWebId(input.requestId) ||
          !["AUDIT_REVIEW", "INCIDENT_REVIEW", "CUSTOMER_PORTABILITY"].includes(input.purposeCode)) {
        throw new Error("ACCOUNTABILITY_EXPORT_COMMAND_INVALID");
      }
      const payload = await postJson(
        companyEndpoint("/accountability-exports").slice(baseUrl.length),
        input,
      );
      const value = await accountabilityExportPackage(payload, companyId());
      return `${JSON.stringify(value, null, 2)}\n`;
    },
    async inspectCompanyBackup(source) {
      let backup: unknown;
      try {
        backup = JSON.parse(source);
      } catch {
        throw new Error("DURABLE_BACKUP_INVALID");
      }
      return companyBackupInspection(await postJson(
        "/api/v1/companies/restore/inspection",
        { backup },
      ));
    },
    async importCompany(source) {
      let backup: unknown;
      try {
        backup = JSON.parse(source);
      } catch {
        throw new Error("DURABLE_BACKUP_INVALID");
      }
      const payload = await postJson(
        "/api/v1/companies/restore",
        { backup },
      );
      if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
          !portableWebId((payload as { companyId?: unknown }).companyId)) {
        throw new Error("COMPANY_IMPORT_PROJECTION_INVALID");
      }
      selectedCompanyId = (payload as { companyId: string }).companyId;
      return selectedCompanyId;
    },
    async archiveCompany(input) {
      const payload = await postJson(
        `/api/v1/companies/${encodeURIComponent(companyId())}/archive`,
        { expectedStatus: "active", ...input },
      );
      if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
          (payload as { companyId?: unknown }).companyId !== companyId() ||
          (payload as { status?: unknown }).status !== "archived") {
        throw new Error("COMPANY_ARCHIVE_PROJECTION_INVALID");
      }
    },
    async assignmentOptions() {
      const value = await projection();
      return {
        viewerId: value.viewer.actorId,
        responsibilities: structuredClone(value.responsibilities),
        lifecycle: structuredClone(value.agentLifecycle),
        agents: value.organization.agents.filter((agent) =>
          value.responsibilities.contracts.some(({ agentId, status }) =>
            agentId === agent.id && status === "ACTIVE") &&
          value.agentLifecycle.agents.some(({ agentId, eligibility }) =>
            agentId === agent.id && eligibility.assignable))
          .map((agent) => ({
          id: agent.id,
          name: agent.name,
          departmentId: agent.departmentId,
          allowedActionIds: value.responsibilities.contracts
            .find(({ agentId }) => agentId === agent.id)?.allowedActions ?? [],
        })),
      };
    },
    async workCatalog() {
      const items: FormalWorkCatalog["items"][number][] = [];
      const seen = new Set<string>();
      let cursor = "0";
      for (let page = 0; page < 100; page += 1) {
        if (!/^\d+$/.test(cursor) || seen.has(cursor)) throw new Error("WORK_CATALOG_PROJECTION_INVALID");
        seen.add(cursor);
        const payload = await getJson(companyEndpoint(`/work?cursor=${encodeURIComponent(cursor)}&limit=100`));
        const candidate = formalWorkCatalogPage(payload, companyId());
        items.push(...candidate.items);
        if (candidate.nextCursor === null) return { schemaVersion: 1, items, nextCursor: null };
        cursor = candidate.nextCursor;
      }
      throw new Error("WORK_CATALOG_PAGE_LIMIT_EXCEEDED");
    },
    async workRunTimeline(workId, attemptId) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(workId) || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(attemptId)) {
        throw new Error("WORK_ATTEMPT_ID_INVALID");
      }
      const items: WorkRunTimelinePage["items"][number][] = [];
      const seen = new Set<number>();
      let afterSequence = 0;
      for (let page = 0; page < 100; page += 1) {
        if (seen.has(afterSequence)) throw new Error("WORK_RUN_TIMELINE_PROJECTION_INVALID");
        seen.add(afterSequence);
        const payload = await getJson(companyEndpoint(
          `/work/${encodeURIComponent(workId)}/attempts/${encodeURIComponent(attemptId)}/events?afterSequence=${afterSequence}&limit=100`,
        ));
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          throw new Error("WORK_RUN_TIMELINE_PROJECTION_INVALID");
        }
        const candidate = payload as Partial<WorkRunTimelinePage>;
        const nextSequence = candidate.nextSequence;
        if (candidate.schemaVersion !== 1 || candidate.workId !== workId || candidate.attemptId !== attemptId ||
            !Array.isArray(candidate.items) || candidate.items.length > 100 ||
            !(nextSequence === null || Number.isSafeInteger(nextSequence))) {
          throw new Error("WORK_RUN_TIMELINE_PROJECTION_INVALID");
        }
        let previousSequence = afterSequence;
        for (const item of candidate.items) {
          if (!item || typeof item !== "object" || !Number.isSafeInteger(item.sequence) ||
              item.sequence <= previousSequence ||
              typeof item.id !== "string" || typeof item.type !== "string" || typeof item.occurredAt !== "string" ||
              !Number.isFinite(Date.parse(item.occurredAt)) ||
              typeof item.actorId !== "string" || typeof item.summary !== "string" ||
              !item.attributes || typeof item.attributes !== "object" || Array.isArray(item.attributes)) {
            throw new Error("WORK_RUN_TIMELINE_PROJECTION_INVALID");
          }
          previousSequence = item.sequence;
        }
        if (nextSequence !== null && (candidate.items.length === 0 || nextSequence !== previousSequence)) {
          throw new Error("WORK_RUN_TIMELINE_PROJECTION_INVALID");
        }
        items.push(...candidate.items);
        if (nextSequence === null) {
          return { schemaVersion: 1, workId, attemptId, items, nextSequence: null };
        }
        if (nextSequence === undefined || nextSequence <= afterSequence) {
            throw new Error("WORK_RUN_TIMELINE_PROJECTION_INVALID");
        }
        afterSequence = nextSequence;
      }
      throw new Error("WORK_RUN_TIMELINE_PAGE_LIMIT_EXCEEDED");
    },
    async activity() {
      const items: CompanyActivityPage["items"][number][] = [];
      const seen = new Set<number>();
      let afterSequence = 0;
      for (let page = 0; page < 100; page += 1) {
        if (seen.has(afterSequence)) throw new Error("COMPANY_ACTIVITY_PROJECTION_INVALID");
        seen.add(afterSequence);
        const payload = await getJson(
          companyEndpoint(`/activity?afterSequence=${afterSequence}&limit=100`),
        );
        const candidate = companyActivityPage(payload, afterSequence);
        items.push(...candidate.items);
        if (candidate.nextSequence === null) return { schemaVersion: 1, items, nextSequence: null };
        if (candidate.nextSequence <= afterSequence) throw new Error("COMPANY_ACTIVITY_PROJECTION_INVALID");
        afterSequence = candidate.nextSequence;
      }
      throw new Error("COMPANY_ACTIVITY_PAGE_LIMIT_EXCEEDED");
    },
    async accountabilityLedger() {
      const payload = await getJson(companyEndpoint("/accountability-ledger"));
      return accountabilityLedgerProjection(payload, companyId());
    },
    async beginSecretReferenceManagement(input) {
      const payload = await postJson(companyEndpoint("/secret-reference-sessions").slice(baseUrl.length), input);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("SECRET_MANAGEMENT_SESSION_INVALID");
      }
      const session = payload as Partial<SecretReferenceManagementSession>;
      if (!portableWebId(session.id) || session.companyId !== companyId() ||
          !portableWebId(session.referenceId) || !["CREATE", "ROTATE", "SUSPEND", "REVOKE"].includes(String(session.operation)) ||
          typeof session.managementUrl !== "string" || !validDate(session.expiresAt)) {
        throw new Error("SECRET_MANAGEMENT_SESSION_INVALID");
      }
      let url: URL;
      try { url = new URL(session.managementUrl); } catch { throw new Error("SECRET_MANAGEMENT_URL_INVALID"); }
      const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
      if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) {
        throw new Error("SECRET_MANAGEMENT_URL_INVALID");
      }
      return structuredClone(payload) as SecretReferenceManagementSession;
    },
    async confirmSecretReferenceManagement(sessionId) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(sessionId)) throw new Error("SECRET_MANAGEMENT_SESSION_INVALID");
      const payload = await getJson(companyEndpoint(`/secret-reference-sessions/${encodeURIComponent(sessionId)}`));
      if (!recordValue(payload) || !["PENDING", "FAILED", "COMPLETED"].includes(String(payload.status))) {
        throw new Error("SECRET_MANAGEMENT_RESULT_INVALID");
      }
      if (payload.status === "PENDING") {
        if (Object.keys(payload).some((key) => key !== "status")) throw new Error("SECRET_MANAGEMENT_RESULT_INVALID");
      } else if (payload.status === "FAILED") {
        if (typeof payload.code !== "string" || !/^[A-Z][A-Z0-9_]{0,127}$/.test(payload.code) ||
            typeof payload.retryable !== "boolean" || Object.keys(payload).some((key) => !["status", "code", "retryable"].includes(key))) {
          throw new Error("SECRET_MANAGEMENT_RESULT_INVALID");
        }
      } else {
        if (!recordValue(payload.reference) || !portableWebId(payload.reference.id) ||
            payload.reference.companyId !== companyId() ||
            !["MODEL_PROVIDER", "DATA_CONNECTOR", "AGENT_CONNECTOR", "IDENTITY_ADAPTER"].includes(String(payload.reference.purpose)) ||
            !portableWebId(payload.reference.providerAdapterId) || !Number.isSafeInteger(payload.reference.currentVersion) ||
            Number(payload.reference.currentVersion) < 1 || !["ACTIVE", "SUSPENDED", "REVOKED"].includes(String(payload.reference.status)) ||
            Object.keys(payload).some((key) => !["status", "reference"].includes(key))) {
          throw new Error("SECRET_MANAGEMENT_RESULT_INVALID");
        }
      }
      return structuredClone(payload) as SecretReferenceManagementResult;
    },
    async requestWorkCancellation(workId, attemptId) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(workId) || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(attemptId)) {
        throw new Error("WORK_ATTEMPT_ID_INVALID");
      }
      await postJson(companyEndpoint(`/work/${encodeURIComponent(workId)}/attempts/${encodeURIComponent(attemptId)}/cancellation`).slice(baseUrl.length), {});
    },
    async reconcileWorkAttempt(workId, attemptId, input) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(workId) || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(attemptId) ||
          !/^[a-z0-9][a-z0-9-]{0,63}$/.test(input.evidenceId)) throw new Error("WORK_ATTEMPT_ID_INVALID");
      await postJson(companyEndpoint(`/work/${encodeURIComponent(workId)}/attempts/${encodeURIComponent(attemptId)}/reconciliation`).slice(baseUrl.length), input);
    },
    async retryWorkAttempt(workId, attemptId) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(workId) || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(attemptId)) {
        throw new Error("WORK_ATTEMPT_ID_INVALID");
      }
      await postJson(companyEndpoint(`/work/${encodeURIComponent(workId)}/attempts/${encodeURIComponent(attemptId)}/retry`).slice(baseUrl.length), {});
    },
    async retryWorkExecutionPreparation(workId, attemptId) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(workId) || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(attemptId)) {
        throw new Error("WORK_ATTEMPT_ID_INVALID");
      }
      await postJson(companyEndpoint(`/work/${encodeURIComponent(workId)}/attempts/${encodeURIComponent(attemptId)}/preparation/retry`).slice(baseUrl.length), {});
    },
    snapshot,
    async assignWork(input) {
      if (!input) throw new Error("FORMAL_WORK_INPUT_REQUIRED");
      const workId = `work-${crypto.randomUUID()}`;
      await command(`/api/v1/companies/${encodeURIComponent(companyId())}/work`, {
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
        ...(input.executionPreparation ? { executionPreparation: input.executionPreparation } : {}),
      });
      return snapshot();
    },
    advanceWork: unsupported,
    async decideApproval(decision) {
      const value = await projection();
      const approval = value.pendingApprovals.at(0);
      if (!approval) throw new Error("APPROVAL_REQUEST_NOT_FOUND");
      await command(
        `/api/v1/companies/${encodeURIComponent(companyId())}/approvals/${encodeURIComponent(approval.id)}/decisions`,
        { decision, expectedBinding: approval.binding },
      );
      return snapshot();
    },
    resetFixture: unsupported,
  };
}
