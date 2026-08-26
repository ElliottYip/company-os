import type { Identifier } from "../core/control-plane.ts";
import {
  GOAL_STATUSES,
  PROJECT_STATUSES,
  validatePlanningCatalog,
  type GoalLevel,
  type GoalRecord,
  type GoalStatus,
  type PlanningCatalog,
  type ProjectRecord,
  type ProjectStatus,
} from "../core/planning.ts";
import type { CompanyStructurePort } from "../ports/company-structure-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { PlanningStorePort } from "../ports/planning-store-port.ts";

export class PlanningRegistry {
  readonly #dependencies: {
    readonly identity: IdentityPort; readonly structure: CompanyStructurePort;
    readonly store: PlanningStorePort; readonly now: () => string;
    readonly nextId: () => Identifier;
  };
  constructor(dependencies: {
    readonly identity: IdentityPort; readonly structure: CompanyStructurePort;
    readonly store: PlanningStorePort; readonly now: () => string;
    readonly nextId: () => Identifier;
  }) { this.#dependencies = dependencies; }
  async load(companyId: Identifier): Promise<PlanningCatalog> {
    await this.authorize(companyId, "planning:read");
    return this.#dependencies.store.load(companyId);
  }
  async replace(companyId: Identifier, input: Omit<PlanningCatalog, "companyId">, expectedRevision: number): Promise<PlanningCatalog> {
    return this.#mutate(companyId, expectedRevision, () => ({ ...input, companyId }));
  }
  async createGoal(companyId: Identifier, input: CreateGoalInput): Promise<PlanningCatalog> {
    return this.#mutate(companyId, input.expectedRevision, (current) => {
      const now = this.#dependencies.now();
      return {
      ...current,
      goals: [...current.goals, {
        id: this.#dependencies.nextId(), companyId,
        title: input.title, description: input.description,
        level: input.level, status: "planned",
        parentId: input.parentId, ownerAgentId: input.ownerAgentId,
        accountableHumanId: input.accountableHumanId,
        createdAt: now, updatedAt: now,
      }],
      };
    });
  }
  async updateGoal(companyId: Identifier, goalId: Identifier, input: UpdateGoalInput): Promise<PlanningCatalog> {
    return this.#mutate(companyId, input.expectedRevision, (current) => {
      const existing = current.goals.find(({ id }) => id === goalId);
      if (!existing) throw new Error("GOAL_NOT_FOUND");
      assertGoalTransition(existing.status, input.status);
      const updated: GoalRecord = {
        ...existing,
        title: input.title,
        description: input.description,
        level: input.level,
        status: input.status,
        parentId: input.parentId,
        ownerAgentId: input.ownerAgentId,
        accountableHumanId: input.accountableHumanId,
        updatedAt: this.#dependencies.now(),
      };
      return {
        ...current,
        goals: current.goals.map((goal) => goal.id === goalId ? updated : goal),
      };
    });
  }
  async createProject(companyId: Identifier, input: CreateProjectInput): Promise<PlanningCatalog> {
    return this.#mutate(companyId, input.expectedRevision, (current) => {
      const now = this.#dependencies.now();
      return {
      ...current,
      projects: [...current.projects, {
        id: this.#dependencies.nextId(), companyId,
        goalIds: input.goalIds, name: input.name, description: input.description,
        status: "backlog", leadAgentId: input.leadAgentId,
        accountableHumanId: input.accountableHumanId,
        departmentIds: input.departmentIds, targetDate: input.targetDate,
        archivedAt: null, createdAt: now, updatedAt: now,
      }],
      };
    });
  }
  async updateProject(companyId: Identifier, projectId: Identifier, input: UpdateProjectInput): Promise<PlanningCatalog> {
    return this.#mutate(companyId, input.expectedRevision, (current) => {
      const existing = current.projects.find(({ id }) => id === projectId);
      if (!existing) throw new Error("PROJECT_NOT_FOUND");
      if (existing.archivedAt) throw new Error("PROJECT_ARCHIVED_TERMINAL");
      assertProjectTransition(existing.status, input.status);
      const updated: ProjectRecord = {
        ...existing,
        goalIds: input.goalIds,
        name: input.name,
        description: input.description,
        status: input.status,
        leadAgentId: input.leadAgentId,
        accountableHumanId: input.accountableHumanId,
        departmentIds: input.departmentIds,
        targetDate: input.targetDate,
        updatedAt: this.#dependencies.now(),
      };
      return {
        ...current,
        projects: current.projects.map((project) => project.id === projectId ? updated : project),
      };
    });
  }
  async archiveProject(companyId: Identifier, projectId: Identifier, expectedRevision: number): Promise<PlanningCatalog> {
    return this.#mutate(companyId, expectedRevision, (current) => {
      const existing = current.projects.find(({ id }) => id === projectId);
      if (!existing) throw new Error("PROJECT_NOT_FOUND");
      if (existing.archivedAt) throw new Error("PROJECT_ARCHIVED_TERMINAL");
      if (existing.status !== "completed" && existing.status !== "cancelled") {
        throw new Error("PROJECT_TERMINAL_STATUS_REQUIRED");
      }
      const now = this.#dependencies.now();
      const updated: ProjectRecord = { ...existing, archivedAt: now, updatedAt: now };
      return {
        ...current,
        projects: current.projects.map((project) => project.id === projectId ? updated : project),
      };
    });
  }
  async #mutate(
    companyId: Identifier,
    expectedRevision: number,
    transform: (current: PlanningCatalog) => PlanningCatalog,
  ): Promise<PlanningCatalog> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new Error("PLANNING_REVISION_INVALID");
    }
    const { identity, receipt } = await this.authorize(companyId, "planning:update");
    const current = await this.#dependencies.store.load(companyId);
    if (current.revision !== expectedRevision) throw new Error("PLANNING_REVISION_CONFLICT");
    const structure = await this.#dependencies.structure.load(companyId);
    if (!structure) throw new Error("ORGANIZATION_NOT_FOUND");
    const catalog = validatePlanningCatalog(transform(current), structure.organization);
    if (catalog.revision !== expectedRevision) throw new Error("PLANNING_REVISION_CONFLICT");
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    return this.#dependencies.store.replace(
      catalog,
      expectedRevision,
      identity.actorId,
      this.#dependencies.now(),
    );
  }
  async authorize(companyId: Identifier, action: string) {
    const identity = await this.#dependencies.identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== companyId) throw new Error("TENANT_MISMATCH");
    const receipt = await this.#dependencies.identity.authorize({ companyId, action, resourceId: companyId, reason: "Manage goals and projects" });
    return { identity, receipt };
  }
}

export interface CreateGoalInput {
  readonly title: string;
  readonly description: string | null;
  readonly level: GoalLevel;
  readonly parentId: Identifier | null;
  readonly ownerAgentId: Identifier | null;
  readonly accountableHumanId: Identifier;
  readonly expectedRevision: number;
}

export interface UpdateGoalInput extends Omit<CreateGoalInput, "expectedRevision"> {
  readonly status: GoalStatus;
  readonly expectedRevision: number;
}

export interface CreateProjectInput {
  readonly goalIds: readonly Identifier[];
  readonly name: string;
  readonly description: string | null;
  readonly leadAgentId: Identifier | null;
  readonly accountableHumanId: Identifier;
  readonly departmentIds: readonly Identifier[];
  readonly targetDate: string | null;
  readonly expectedRevision: number;
}

export interface UpdateProjectInput extends CreateProjectInput {
  readonly status: ProjectStatus;
}

const GOAL_TRANSITIONS: Readonly<Record<GoalStatus, readonly GoalStatus[]>> = {
  planned: ["planned", "active", "cancelled"],
  active: ["active", "achieved", "cancelled"],
  achieved: ["achieved"],
  cancelled: ["cancelled"],
};

const PROJECT_TRANSITIONS: Readonly<Record<ProjectStatus, readonly ProjectStatus[]>> = {
  backlog: ["backlog", "planned", "cancelled"],
  planned: ["planned", "backlog", "in_progress", "cancelled"],
  in_progress: ["in_progress", "completed", "cancelled"],
  completed: ["completed"],
  cancelled: ["cancelled"],
};

function assertGoalTransition(current: GoalStatus, next: GoalStatus): void {
  if (!GOAL_STATUSES.includes(next) || !GOAL_TRANSITIONS[current].includes(next)) {
    throw new Error("GOAL_STATUS_TRANSITION_INVALID");
  }
}

function assertProjectTransition(current: ProjectStatus, next: ProjectStatus): void {
  if (!PROJECT_STATUSES.includes(next) || !PROJECT_TRANSITIONS[current].includes(next)) {
    throw new Error("PROJECT_STATUS_TRANSITION_INVALID");
  }
}
