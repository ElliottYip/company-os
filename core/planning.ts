import type { Identifier } from "./control-plane.ts";
import type { OrganizationDraft } from "./organization.ts";

export const GOAL_LEVELS = ["company", "team", "agent", "task"] as const;
export type GoalLevel = typeof GOAL_LEVELS[number];
export const GOAL_STATUSES = ["planned", "active", "achieved", "cancelled"] as const;
export type GoalStatus = typeof GOAL_STATUSES[number];
export const PROJECT_STATUSES = ["backlog", "planned", "in_progress", "completed", "cancelled"] as const;
export type ProjectStatus = typeof PROJECT_STATUSES[number];

export interface GoalRecord {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly title: string;
  readonly description: string | null;
  readonly level: GoalLevel;
  readonly status: GoalStatus;
  readonly parentId: Identifier | null;
  readonly ownerAgentId: Identifier | null;
  /** Company OS responsibility extension: every goal has a real accountable owner. */
  readonly accountableHumanId: Identifier;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectRecord {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly goalIds: readonly Identifier[];
  readonly name: string;
  readonly description: string | null;
  readonly status: ProjectStatus;
  readonly leadAgentId: Identifier | null;
  readonly accountableHumanId: Identifier;
  readonly departmentIds: readonly Identifier[];
  readonly targetDate: string | null;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PlanningCatalog {
  readonly companyId: Identifier;
  readonly revision: number;
  readonly goals: readonly GoalRecord[];
  readonly projects: readonly ProjectRecord[];
}

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function id(value: string): string { if (!ID.test(value)) throw new Error("PLANNING_ID_INVALID"); return value; }
function text(value: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized || [...normalized].length > maximum) throw new Error("PLANNING_TEXT_INVALID");
  return normalized;
}

export function validatePlanningCatalog(input: PlanningCatalog, organization: OrganizationDraft): PlanningCatalog {
  if (input.companyId !== organization.company.id) throw new Error("TENANT_MISMATCH");
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error("PLANNING_REVISION_INVALID");
  const humans = new Set(organization.humans.map(({ id }) => id));
  const agents = new Map(organization.agents.map((agent) => [agent.id, agent]));
  const departments = new Set(organization.departments.map(({ id }) => id));
  const goalIds = new Set<string>();
  const goals = input.goals.map((goal) => {
    id(goal.id); if (goalIds.has(goal.id)) throw new Error("GOAL_ID_DUPLICATE"); goalIds.add(goal.id);
    if (goal.companyId !== input.companyId || !GOAL_LEVELS.includes(goal.level) || !GOAL_STATUSES.includes(goal.status)) throw new Error("GOAL_INVALID");
    if (!humans.has(goal.accountableHumanId)) throw new Error("GOAL_ACCOUNTABLE_HUMAN_INVALID");
    const agent = goal.ownerAgentId ? agents.get(goal.ownerAgentId) : null;
    if (goal.ownerAgentId && (!agent || agent.accountableHumanId !== goal.accountableHumanId)) throw new Error("GOAL_OWNER_AGENT_INVALID");
    return { ...goal, title: text(goal.title, 120), description: goal.description === null ? null : text(goal.description, 2_000) };
  });
  const byGoal = new Map(goals.map((goal) => [goal.id, goal]));
  for (const goal of goals) {
    if (goal.parentId && !byGoal.has(goal.parentId)) throw new Error("GOAL_PARENT_NOT_FOUND");
    const visited = new Set([goal.id]); let cursor = goal.parentId;
    while (cursor) { if (visited.has(cursor)) throw new Error("GOAL_CYCLE"); visited.add(cursor); cursor = byGoal.get(cursor)?.parentId ?? null; }
  }
  const projectIds = new Set<string>();
  const projects = input.projects.map((project) => {
    id(project.id); if (projectIds.has(project.id)) throw new Error("PROJECT_ID_DUPLICATE"); projectIds.add(project.id);
    if (project.companyId !== input.companyId || !PROJECT_STATUSES.includes(project.status)) throw new Error("PROJECT_INVALID");
    if (!humans.has(project.accountableHumanId)) throw new Error("PROJECT_ACCOUNTABLE_HUMAN_INVALID");
    const lead = project.leadAgentId ? agents.get(project.leadAgentId) : null;
    if (project.leadAgentId && (!lead || lead.accountableHumanId !== project.accountableHumanId)) throw new Error("PROJECT_LEAD_AGENT_INVALID");
    if (new Set(project.goalIds).size !== project.goalIds.length || project.goalIds.some((value) => !goalIds.has(value))) throw new Error("PROJECT_GOAL_INVALID");
    if (!project.departmentIds.length || new Set(project.departmentIds).size !== project.departmentIds.length || project.departmentIds.some((value) => !departments.has(value))) throw new Error("PROJECT_DEPARTMENT_INVALID");
    if (project.targetDate !== null && !DATE.test(project.targetDate)) throw new Error("PROJECT_TARGET_DATE_INVALID");
    return { ...project, name: text(project.name, 120), description: project.description === null ? null : text(project.description, 2_000) };
  });
  return structuredClone({ ...input, goals, projects });
}
