import {
  validateOrganizationDraft,
  type AgentDraft,
  type HumanDraft,
  type OrganizationDraft,
} from "../../core/organization.ts";

export interface OrganizationSetupInput {
  readonly companyName: string;
  readonly companyPurpose: string;
  readonly departmentName: string;
  readonly humanName: string;
  readonly humanTitle: string;
  readonly agentName?: string;
  readonly agentRole?: string;
}

export interface AddHumanInput {
  readonly name: string;
  readonly title: string;
  readonly departmentId: string;
  readonly avatarId?: string;
}

export interface AddAgentInput {
  readonly name: string;
  readonly role: string;
  readonly departmentId: string;
  readonly accountableHumanId: string;
  readonly runtimeConnectorId?: string;
  readonly autonomyLevel: number;
  readonly avatarId?: string;
}

export interface UpsertDepartmentInput {
  readonly departmentId?: string;
  readonly name: string;
  readonly mandate: string;
}

export interface UpdateHumanProfileInput {
  readonly humanId: string;
  readonly name: string;
  readonly title: string;
  readonly departmentId: string;
}

export interface UpdateAgentProfileInput {
  readonly agentId: string;
  readonly name: string;
  readonly role: string;
  readonly departmentId: string;
}

function portableSlug(value: string, fallback: string): string {
  const normalized = value
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || fallback;
}

function uniqueId(prefix: string, label: string, occupied: readonly string[]): string {
  const base = `${prefix}-${portableSlug(label, "member")}`.slice(0, 58);
  let candidate = base;
  let suffix = 2;
  while (occupied.includes(candidate)) {
    candidate = `${base.slice(0, 54)}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function createOrganizationSetupDraft(input: OrganizationSetupInput): OrganizationDraft {
  const companyId = uniqueId("company", input.companyName, []);
  const departmentId = uniqueId("department", input.departmentName, []);
  const humanId = uniqueId("human", input.humanName, []);
  const agentId = uniqueId("agent", "first-colleague", []);
  return validateOrganizationDraft({
    company: {
      id: companyId,
      name: input.companyName,
      purpose: input.companyPurpose,
      locale: "en",
    },
    departments: [{ id: departmentId, name: input.departmentName, mandate: input.companyPurpose }],
    humans: [{
      id: humanId,
      name: input.humanName,
      title: input.humanTitle,
      departmentId,
      avatarId: "human-default",
    }],
    agents: [{
      id: agentId,
      name: input.agentName ?? "Research Assistant",
      role: input.agentRole ?? "Organize information and submit evidence-backed results",
      departmentId,
      accountableHumanId: humanId,
      runtimeConnectorId: "connector-unbound",
      avatarId: "fish-bumble",
      autonomyLevel: 1,
    }],
  });
}

export function addHumanColleague(
  organization: OrganizationDraft,
  input: AddHumanInput,
): OrganizationDraft {
  const human: HumanDraft = {
    id: uniqueId("human", input.name, organization.humans.map(({ id }) => id)),
    name: input.name,
    title: input.title,
    departmentId: input.departmentId,
    avatarId: input.avatarId ?? "human-default",
  };
  return validateOrganizationDraft({
    ...organization,
    humans: [...organization.humans, human],
  });
}

export function addAgentColleague(
  organization: OrganizationDraft,
  input: AddAgentInput,
): OrganizationDraft {
  const agent: AgentDraft = {
    id: uniqueId("agent", input.name, organization.agents.map(({ id }) => id)),
    name: input.name,
    role: input.role,
    departmentId: input.departmentId,
    accountableHumanId: input.accountableHumanId,
    runtimeConnectorId: input.runtimeConnectorId ?? "connector-unbound",
    avatarId: input.avatarId ?? "fish-bumble",
    autonomyLevel: input.autonomyLevel,
  };
  return validateOrganizationDraft({
    ...organization,
    agents: [...organization.agents, agent],
  });
}

export function upsertDepartment(
  organization: OrganizationDraft,
  input: UpsertDepartmentInput,
): OrganizationDraft {
  const existing = input.departmentId
    ? organization.departments.find(({ id }) => id === input.departmentId)
    : undefined;
  if (input.departmentId && !existing) throw new Error("DEPARTMENT_NOT_FOUND");
  const department = {
    id: existing?.id ?? uniqueId("department", input.name, organization.departments.map(({ id }) => id)),
    name: input.name,
    mandate: input.mandate,
  };
  return validateOrganizationDraft({
    ...organization,
    departments: existing
      ? organization.departments.map((candidate) => candidate.id === existing.id ? department : candidate)
      : [...organization.departments, department],
  });
}

export function updateHumanProfile(
  organization: OrganizationDraft,
  input: UpdateHumanProfileInput,
): OrganizationDraft {
  if (!organization.humans.some(({ id }) => id === input.humanId)) throw new Error("HUMAN_NOT_FOUND");
  return validateOrganizationDraft({
    ...organization,
    humans: organization.humans.map((human) => human.id === input.humanId
      ? { ...human, name: input.name, title: input.title, departmentId: input.departmentId }
      : human),
  });
}

/** Profile editing deliberately cannot alter runtime, autonomy or responsibility. */
export function updateAgentProfile(
  organization: OrganizationDraft,
  input: UpdateAgentProfileInput,
): OrganizationDraft {
  if (!organization.agents.some(({ id }) => id === input.agentId)) throw new Error("AGENT_NOT_FOUND");
  return validateOrganizationDraft({
    ...organization,
    agents: organization.agents.map((agent) => agent.id === input.agentId
      ? { ...agent, name: input.name, role: input.role, departmentId: input.departmentId }
      : agent),
  });
}
