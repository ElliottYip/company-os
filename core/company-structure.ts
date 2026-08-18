import type { Identifier } from "./control-plane.ts";
import {
  validateOrganizationDraft,
  type OrganizationDraft,
} from "./organization.ts";

export interface ProjectDraft {
  readonly id: Identifier;
  readonly name: string;
  readonly departmentIds: readonly Identifier[];
  readonly ownerHumanId: Identifier;
}

export interface WorkspaceDraft {
  readonly id: Identifier;
  readonly name: string;
  readonly projectId: Identifier | null;
  readonly departmentId: Identifier | null;
}

export interface PositionDraft {
  readonly id: Identifier;
  readonly title: string;
  readonly departmentId: Identifier;
  readonly principalId: Identifier;
  readonly accountableHumanId: Identifier;
}

export interface ReportingLineDraft {
  readonly subordinatePositionId: Identifier;
  readonly managerPositionId: Identifier;
}

export interface CompanyStructure {
  readonly organization: OrganizationDraft;
  readonly projects: readonly ProjectDraft[];
  readonly workspaces: readonly WorkspaceDraft[];
  readonly positions: readonly PositionDraft[];
  readonly reportingLines: readonly ReportingLineDraft[];
}

const PORTABLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

function id(value: string, label: string): Identifier {
  if (!PORTABLE_ID.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function text(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || [...normalized].length > 120) throw new Error(`${label} is invalid.`);
  return normalized;
}

function unique(values: readonly Identifier[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} IDs must be unique.`);
}

export function validateCompanyStructure(input: CompanyStructure): CompanyStructure {
  const organization = validateOrganizationDraft(input.organization);
  const departments = new Set(organization.departments.map(({ id: value }) => value));
  const humans = new Set(organization.humans.map(({ id: value }) => value));
  const agents = new Set(organization.agents.map(({ id: value }) => value));
  const principals = new Set([...humans, ...agents]);

  unique(input.projects.map(({ id: value }) => value), "Project");
  const projects = input.projects.map((project) => {
    if (!project.departmentIds.length || project.departmentIds.some((value) => !departments.has(value))) {
      throw new Error("Project departments must exist in the company.");
    }
    if (!humans.has(project.ownerHumanId)) throw new Error("Project owner must be a company human.");
    return { ...project, id: id(project.id, "Project ID"), name: text(project.name, "Project name") };
  });
  const projectIds = new Set(projects.map(({ id: value }) => value));

  unique(input.workspaces.map(({ id: value }) => value), "Workspace");
  const workspaces = input.workspaces.map((workspace) => {
    if ((workspace.projectId === null) === (workspace.departmentId === null)) {
      throw new Error("Workspace must belong to exactly one project or department.");
    }
    if (workspace.projectId && !projectIds.has(workspace.projectId)) {
      throw new Error("Workspace project does not exist.");
    }
    if (workspace.departmentId && !departments.has(workspace.departmentId)) {
      throw new Error("Workspace department does not exist.");
    }
    return { ...workspace, id: id(workspace.id, "Workspace ID"), name: text(workspace.name, "Workspace name") };
  });

  unique(input.positions.map(({ id: value }) => value), "Position");
  const positions = input.positions.map((position) => {
    if (!departments.has(position.departmentId)) throw new Error("Position department does not exist.");
    if (!principals.has(position.principalId)) throw new Error("Position principal does not exist.");
    if (!humans.has(position.accountableHumanId)) throw new Error("Position accountable human does not exist.");
    const agent = organization.agents.find(({ id: value }) => value === position.principalId);
    if (agent && agent.accountableHumanId !== position.accountableHumanId) {
      throw new Error("Position accountable human must match the Agent contract owner.");
    }
    return { ...position, id: id(position.id, "Position ID"), title: text(position.title, "Position title") };
  });
  const positionIds = new Set(positions.map(({ id: value }) => value));
  const managerBySubordinate = new Map<Identifier, Identifier>();
  for (const line of input.reportingLines) {
    if (!positionIds.has(line.subordinatePositionId) || !positionIds.has(line.managerPositionId)) {
      throw new Error("Reporting line position does not exist.");
    }
    if (line.subordinatePositionId === line.managerPositionId || managerBySubordinate.has(line.subordinatePositionId)) {
      throw new Error("Each position needs at most one distinct manager.");
    }
    managerBySubordinate.set(line.subordinatePositionId, line.managerPositionId);
  }
  for (const position of positions) {
    const visited = new Set<Identifier>([position.id]);
    let manager = managerBySubordinate.get(position.id);
    while (manager) {
      if (visited.has(manager)) throw new Error("Reporting cycle is not allowed.");
      visited.add(manager);
      manager = managerBySubordinate.get(manager);
    }
  }

  return {
    organization,
    projects,
    workspaces,
    positions,
    reportingLines: structuredClone(input.reportingLines),
  };
}
