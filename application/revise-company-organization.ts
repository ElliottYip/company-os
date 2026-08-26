import { validateCompanyStructure, type CompanyStructure } from "../core/company-structure.ts";
import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";
import type { AgentDraft, OrganizationDraft } from "../core/organization.ts";
import {
  validateResponsibilityContracts,
  type ResponsibilityContract,
} from "../core/responsibility.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { CompanyProfileStorePort } from "../ports/company-profile-store-port.ts";
import { validatePlanningCatalog, type PlanningCatalog } from "../core/planning.ts";

export interface ReviseCompanyOrganizationInput {
  readonly companyId: Identifier;
  readonly organization: OrganizationDraft;
}

export interface TransferAgentResponsibilityInput {
  readonly companyId: Identifier;
  readonly agentId: Identifier;
  readonly newAccountableHumanId: Identifier;
  readonly newBackupHumanId: Identifier | null;
  readonly expectedResponsibilityRevision: number;
  readonly reason: string;
}

export interface UpdateCompanyProfileInput {
  readonly companyId: Identifier;
  readonly expected: { readonly name: string; readonly purpose: string; readonly locale: string };
  readonly next: { readonly name: string; readonly purpose: string; readonly locale: string };
}

export interface ArchiveDepartmentInput {
  readonly companyId: Identifier;
  readonly departmentId: Identifier;
  readonly destinationDepartmentId: Identifier;
  readonly expectedResponsibilityRevision: number;
  readonly reason: string;
}

/**
 * Revises the durable organization projection and its responsibility snapshot
 * in one event. New Agents enter as non-executable responsibility drafts.
 */
export class ReviseCompanyOrganization {
  readonly #identity: IdentityPort;
  readonly #events: EventDataStorePort;
  readonly #now: () => string;
  readonly #nextId: () => Identifier;

  constructor(dependencies: {
    readonly identity: IdentityPort;
    readonly events: EventDataStorePort;
    readonly now: () => string;
    readonly nextId: () => Identifier;
  }) {
    this.#identity = dependencies.identity;
    this.#events = dependencies.events;
    this.#now = dependencies.now;
    this.#nextId = dependencies.nextId;
  }

  async execute(input: ReviseCompanyOrganizationInput): Promise<OrganizationDraft> {
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== input.companyId || input.organization.company.id !== input.companyId) {
      throw new Error("TENANT_MISMATCH");
    }
    const events = await this.#events.read(input.companyId);
    const currentEvent = events.filter(({ type }) =>
      type === "organization.registered" || type === "organization.revised").at(-1);
    if (!currentEvent) throw new Error("ORGANIZATION_NOT_FOUND");
    const currentStructure = structureFrom(currentEvent);
    if (input.organization.company.name !== currentStructure.organization.company.name ||
        input.organization.company.purpose !== currentStructure.organization.company.purpose ||
        input.organization.company.locale !== currentStructure.organization.company.locale) {
      throw new Error("COMPANY_PROFILE_MUTATION_REQUIRES_SETTINGS_COMMAND");
    }
    assertAppendOnlyPrincipals(currentStructure.organization, input.organization);
    assertPendingAgentConfigurationFrozen(currentStructure.organization, input.organization, events);
    const prior = responsibilitySnapshotFrom(events);
    assertResponsibilityOwnedFields(input.organization, prior.contracts);

    const staffing = nextStaffing(currentStructure, input.organization, this.#nextId);
    const structure = validateCompanyStructure({
      ...currentStructure,
      organization: input.organization,
      positions: staffing.positions,
      reportingLines: staffing.reportingLines,
    });
    const contracts = contractsFor(structure.organization, prior.contracts, this.#nextId);
    validateResponsibilityContracts(contracts, structure.organization);
    const receipt = await this.#identity.authorize({
      companyId: input.companyId,
      action: "organization:update",
      resourceId: input.companyId,
      reason: "Revise company organization and responsibility drafts",
    });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    const event: CompanyDomainEvent = {
      id: this.#nextId(),
      companyId: input.companyId,
      type: "organization.revised",
      occurredAt: this.#now(),
      actorId: identity.actorId,
      payload: {
        structure,
        responsibilitySnapshot: { revision: prior.revision + 1, contracts },
        authorizationReceiptId: receipt.id,
      },
      provenance: "PRODUCTION",
    };
    await this.#events.append(event, events.length);
    return structuredClone(structure.organization);
  }
}

/** Atomically updates the organization chain and responsibility contract. */
export class TransferAgentResponsibility {
  readonly #identity: IdentityPort;
  readonly #events: EventDataStorePort;
  readonly #now: () => string;
  readonly #nextId: () => Identifier;

  constructor(dependencies: { readonly identity: IdentityPort; readonly events: EventDataStorePort;
    readonly now: () => string; readonly nextId: () => Identifier }) {
    this.#identity = dependencies.identity;
    this.#events = dependencies.events;
    this.#now = dependencies.now;
    this.#nextId = dependencies.nextId;
  }

  async execute(input: TransferAgentResponsibilityInput): Promise<{
    readonly organization: OrganizationDraft;
    readonly responsibilitySnapshot: { readonly revision: number; readonly contracts: readonly ResponsibilityContract[] };
  }> {
    if (!Number.isSafeInteger(input.expectedResponsibilityRevision) || input.expectedResponsibilityRevision < 0 ||
        !input.reason.trim() || input.reason.length > 1_000) throw new Error("RESPONSIBILITY_TRANSFER_COMMAND_INVALID");
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== input.companyId) throw new Error("TENANT_MISMATCH");
    const events = await this.#events.read(input.companyId);
    const latest = events.filter(({ type }) => type === "organization.registered" || type === "organization.revised").at(-1);
    if (!latest) throw new Error("ORGANIZATION_NOT_FOUND");
    const structure = structureFrom(latest);
    const agent = structure.organization.agents.find(({ id }) => id === input.agentId);
    if (!agent) throw new Error("AGENT_NOT_FOUND");
    if (agent.accountableHumanId === input.newAccountableHumanId) throw new Error("RESPONSIBILITY_TRANSFER_NO_CHANGE");
    if (!structure.organization.humans.some(({ id }) => id === input.newAccountableHumanId) ||
        input.newBackupHumanId !== null && !structure.organization.humans.some(({ id }) => id === input.newBackupHumanId) ||
        input.newBackupHumanId === input.newAccountableHumanId) {
      throw new Error("RESPONSIBILITY_TRANSFER_HUMAN_INVALID");
    }
    const prior = responsibilitySnapshotFrom(events);
    if (prior.revision !== input.expectedResponsibilityRevision) throw new Error("RESPONSIBILITY_CONTRACT_REVISION_CONFLICT");
    const contract = prior.contracts.find(({ agentId }) => agentId === input.agentId);
    if (!contract) throw new Error("RESPONSIBILITY_CONTRACT_NOT_FOUND");
    assertNoPendingApproval(events, input.agentId);
    const organization: OrganizationDraft = { ...structure.organization,
      agents: structure.organization.agents.map((candidate) => candidate.id === input.agentId
        ? { ...candidate, accountableHumanId: input.newAccountableHumanId } : candidate) };
    const staffing = nextStaffing(structure, organization, this.#nextId);
    const nextStructure = validateCompanyStructure({ ...structure, organization,
      positions: staffing.positions, reportingLines: staffing.reportingLines });
    const contracts = prior.contracts.map((candidate) => candidate.agentId === input.agentId
      ? { ...candidate, accountableHumanId: input.newAccountableHumanId, backupHumanId: input.newBackupHumanId }
      : candidate);
    validateResponsibilityContracts(contracts, organization);
    const receipt = await this.#identity.authorize({ companyId: input.companyId,
      action: "responsibility:transfer", resourceId: input.agentId, reason: input.reason.trim() });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    const responsibilitySnapshot = { revision: prior.revision + 1, contracts };
    await this.#events.append({ id: this.#nextId(), companyId: input.companyId,
      type: "organization.revised", occurredAt: this.#now(), actorId: identity.actorId,
      payload: { structure: nextStructure, responsibilitySnapshot, authorizationReceiptId: receipt.id,
        responsibilityTransfer: { agentId: input.agentId, previousAccountableHumanId: agent.accountableHumanId,
          newAccountableHumanId: input.newAccountableHumanId, newBackupHumanId: input.newBackupHumanId,
          reason: input.reason.trim() } }, provenance: "PRODUCTION" }, events.length);
    return { organization: structuredClone(organization), responsibilitySnapshot: structuredClone(responsibilitySnapshot) };
  }
}

/** Changes company presentation metadata without changing identity, access, or responsibility. */
export class UpdateCompanyProfile {
  readonly #identity: IdentityPort;
  readonly #events: EventDataStorePort;
  readonly #now: () => string;
  readonly #nextId: () => Identifier;
  readonly #profileStore: CompanyProfileStorePort;

  constructor(dependencies: { readonly identity: IdentityPort; readonly events: EventDataStorePort;
    readonly profileStore: CompanyProfileStorePort; readonly now: () => string; readonly nextId: () => Identifier }) {
    this.#identity = dependencies.identity;
    this.#events = dependencies.events;
    this.#now = dependencies.now;
    this.#nextId = dependencies.nextId;
    this.#profileStore = dependencies.profileStore;
  }

  async execute(input: UpdateCompanyProfileInput): Promise<OrganizationDraft> {
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== input.companyId) throw new Error("TENANT_MISMATCH");
    const events = await this.#events.read(input.companyId);
    const latest = events.filter(({ type }) => type === "organization.registered" || type === "organization.revised").at(-1);
    if (!latest) throw new Error("ORGANIZATION_NOT_FOUND");
    const current = structureFrom(latest);
    const profile = current.organization.company;
    if (profile.name !== input.expected.name || profile.purpose !== input.expected.purpose ||
        profile.locale !== input.expected.locale) throw new Error("COMPANY_PROFILE_REVISION_CONFLICT");
    const name = input.next.name.trim();
    const purpose = input.next.purpose.trim();
    const locale = input.next.locale.trim();
    if (!name || [...name].length > 120 || [...purpose].length > 2_000 ||
        !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(locale)) throw new Error("COMPANY_PROFILE_COMMAND_INVALID");
    if (name === profile.name && purpose === profile.purpose && locale === profile.locale) {
      throw new Error("COMPANY_PROFILE_NO_CHANGE");
    }
    const organization: OrganizationDraft = { ...current.organization,
      company: { ...profile, name, purpose, locale } };
    const structure = validateCompanyStructure({ ...current, organization });
    const receipt = await this.#identity.authorize({ companyId: input.companyId,
      action: "company:update_settings", resourceId: input.companyId,
      reason: "Update company profile metadata" });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    const event: CompanyDomainEvent = { id: this.#nextId(), companyId: input.companyId,
      type: "organization.revised", occurredAt: this.#now(), actorId: identity.actorId,
      payload: { structure, responsibilitySnapshot: responsibilitySnapshotFrom(events),
        authorizationReceiptId: receipt.id, companyProfileChange: { previous: input.expected, next: { name, purpose, locale } } },
      provenance: "PRODUCTION" };
    await this.#profileStore.updateCompanyProfileAtomically({ companyId: input.companyId,
      expected: input.expected, next: { name, purpose, locale }, event, expectedEventSequence: events.length });
    return structuredClone(organization);
  }
}

/** Archives one department by atomically rehoming all of its owned structure. */
export class ArchiveDepartment {
  readonly #identity: IdentityPort;
  readonly #events: EventDataStorePort;
  readonly #now: () => string;
  readonly #nextId: () => Identifier;

  constructor(dependencies: { readonly identity: IdentityPort; readonly events: EventDataStorePort;
    readonly now: () => string; readonly nextId: () => Identifier }) {
    this.#identity = dependencies.identity; this.#events = dependencies.events;
    this.#now = dependencies.now; this.#nextId = dependencies.nextId;
  }

  async execute(input: ArchiveDepartmentInput): Promise<OrganizationDraft> {
    if (input.departmentId === input.destinationDepartmentId || !input.reason.trim() || input.reason.length > 1_000 ||
        !Number.isSafeInteger(input.expectedResponsibilityRevision) || input.expectedResponsibilityRevision < 0) {
      throw new Error("DEPARTMENT_ARCHIVE_COMMAND_INVALID");
    }
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== input.companyId) throw new Error("TENANT_MISMATCH");
    const events = await this.#events.read(input.companyId);
    const latest = events.filter(({ type }) => type === "organization.registered" || type === "organization.revised").at(-1);
    if (!latest) throw new Error("ORGANIZATION_NOT_FOUND");
    const current = structureFrom(latest);
    if (current.organization.departments.length <= 1) throw new Error("LAST_DEPARTMENT_REQUIRED");
    if (!current.organization.departments.some(({ id }) => id === input.departmentId) ||
        !current.organization.departments.some(({ id }) => id === input.destinationDepartmentId)) {
      throw new Error("DEPARTMENT_NOT_FOUND");
    }
    const prior = responsibilitySnapshotFrom(events);
    if (prior.revision !== input.expectedResponsibilityRevision) {
      throw new Error("RESPONSIBILITY_CONTRACT_REVISION_CONFLICT");
    }
    const affectedAgentIds = current.organization.agents
      .filter(({ departmentId }) => departmentId === input.departmentId).map(({ id }) => id);
    for (const agentId of affectedAgentIds) assertNoPendingApproval(events, agentId);
    assertNoActiveDepartmentWork(events, affectedAgentIds);
    const move = <T extends { readonly departmentId: Identifier }>(record: T): T =>
      record.departmentId === input.departmentId
        ? { ...record, departmentId: input.destinationDepartmentId } : record;
    const organization: OrganizationDraft = { ...current.organization,
      departments: current.organization.departments.filter(({ id }) => id !== input.departmentId),
      humans: current.organization.humans.map(move), agents: current.organization.agents.map(move) };
    const staffing = nextStaffing(current, organization, this.#nextId);
    const structure = validateCompanyStructure({ ...current, organization,
      projects: current.projects.map((project) => ({ ...project,
        departmentIds: [...new Set(project.departmentIds.map((id) =>
          id === input.departmentId ? input.destinationDepartmentId : id))] })),
      workspaces: current.workspaces.map((workspace) => workspace.departmentId === input.departmentId
        ? { ...workspace, departmentId: input.destinationDepartmentId } : workspace),
      positions: staffing.positions, reportingLines: staffing.reportingLines });
    validateResponsibilityContracts(prior.contracts, organization);
    const planning = planningCatalogFrom(events, input.companyId);
    const planningCatalog = validatePlanningCatalog({ ...planning, revision: planning.revision + 1,
      projects: planning.projects.map((project) => ({ ...project,
        departmentIds: [...new Set(project.departmentIds.map((id) =>
          id === input.departmentId ? input.destinationDepartmentId : id))],
        updatedAt: this.#now(),
      })) }, organization);
    const receipt = await this.#identity.authorize({ companyId: input.companyId,
      action: "organization:archive_department", resourceId: input.departmentId, reason: input.reason.trim() });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    await this.#events.append({ id: this.#nextId(), companyId: input.companyId, type: "organization.revised",
      occurredAt: this.#now(), actorId: identity.actorId, provenance: "PRODUCTION",
      payload: { structure, responsibilitySnapshot: prior, authorizationReceiptId: receipt.id,
        planningCatalog,
        departmentArchive: { departmentId: input.departmentId,
          destinationDepartmentId: input.destinationDepartmentId, reason: input.reason.trim() } } }, events.length);
    return structuredClone(organization);
  }
}

function planningCatalogFrom(events: readonly CompanyDomainEvent[], companyId: Identifier): PlanningCatalog {
  for (const event of [...events].reverse()) {
    if (event.type === "planning.catalog.replaced") {
      const catalog = (event.payload as { catalog?: PlanningCatalog }).catalog;
      if (catalog) return structuredClone(catalog);
    }
    if (event.type === "organization.revised") {
      const catalog = (event.payload as { planningCatalog?: PlanningCatalog }).planningCatalog;
      if (catalog) return structuredClone(catalog);
    }
  }
  return { companyId, revision: 0, goals: [], projects: [] };
}

function assertNoActiveDepartmentWork(events: readonly CompanyDomainEvent[], agentIds: readonly Identifier[]): void {
  if (!agentIds.length) return;
  const agents = new Set(agentIds);
  const workAgents = new Map<Identifier, Identifier>();
  const latestAttempts = new Map<Identifier, { readonly workId: Identifier; readonly status: string }>();
  for (const event of events) {
    if (event.type === "work.dispatched") {
      const work = (event.payload as { work?: { id?: Identifier; agentId?: Identifier } }).work;
      if (work?.id && work.agentId) workAgents.set(work.id, work.agentId);
    }
    if (event.type === "work-attempt.recorded") {
      const attempt = (event.payload as { attempt?: { id?: Identifier; workId?: Identifier; status?: string } }).attempt;
      if (attempt?.id && attempt.workId && attempt.status) latestAttempts.set(attempt.id,
        { workId: attempt.workId, status: attempt.status });
    }
  }
  const terminal = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"]);
  if ([...latestAttempts.values()].some((attempt) =>
    agents.has(workAgents.get(attempt.workId) ?? "") && !terminal.has(attempt.status))) {
    throw new Error("DEPARTMENT_ARCHIVE_ACTIVE_WORK");
  }
}

function assertNoPendingApproval(events: readonly CompanyDomainEvent[], agentId: Identifier): void {
  const decided = new Set(events.flatMap(({ type, payload }) => type === "approval.publication.decided"
    ? [String((payload as { decision?: { requestId?: unknown } }).decision?.requestId ?? "")] : []));
  const pending = events.some(({ type, payload }) => {
    if (type !== "approval.publication.requested") return false;
    const request = (payload as { request?: { id?: Identifier; binding?: { executingAgentId?: Identifier } } }).request;
    return request?.binding?.executingAgentId === agentId && Boolean(request.id) && !decided.has(request.id as string);
  });
  if (pending) throw new Error("RESPONSIBILITY_TRANSFER_PENDING_APPROVAL");
}

function assertResponsibilityOwnedFields(
  organization: OrganizationDraft,
  contracts: readonly ResponsibilityContract[],
): void {
  const byAgent = new Map(contracts.map((contract) => [contract.agentId, contract]));
  for (const agent of organization.agents) {
    const contract = byAgent.get(agent.id);
    if (!contract) continue;
    if (agent.accountableHumanId !== contract.accountableHumanId) {
      throw new Error(`RESPONSIBILITY_TRANSFER_COMMAND_REQUIRED:${agent.id}`);
    }
    if (agent.autonomyLevel !== contract.autonomyLevel) {
      throw new Error(`RESPONSIBILITY_AUTONOMY_COMMAND_REQUIRED:${agent.id}`);
    }
  }
}

function assertPendingAgentConfigurationFrozen(
  current: OrganizationDraft,
  next: OrganizationDraft,
  events: readonly CompanyDomainEvent[],
): void {
  const lifecycle = lifecycleStatusesFrom(events);
  for (const existing of current.agents) {
    if ((lifecycle.get(existing.id) ?? "pending_approval") !== "pending_approval") continue;
    const candidate = next.agents.find(({ id }) => id === existing.id);
    if (!candidate) continue;
    const changedFields = pendingAgentChangedFields(existing, candidate);
    if (changedFields.length) {
      throw new Error(`PENDING_APPROVAL_AGENT_CONFIG_FROZEN:${existing.id}:${changedFields.join(",")}`);
    }
  }
}

function pendingAgentChangedFields(current: AgentDraft, next: AgentDraft): string[] {
  const fields = [
    "name", "role", "departmentId", "accountableHumanId", "runtimeConnectorId",
    "avatarId", "autonomyLevel",
  ] as const satisfies readonly (keyof AgentDraft)[];
  return fields.filter((field) => current[field] !== next[field]);
}

function lifecycleStatusesFrom(events: readonly CompanyDomainEvent[]): Map<Identifier, string> {
  const statuses = new Map<Identifier, string>();
  for (const event of events) {
    if (event.type === "organization.registered" || event.type === "organization.revised") {
      const structure = (event.payload as { readonly structure?: CompanyStructure }).structure;
      if (!structure) throw new Error("ORGANIZATION_PROJECTION_CORRUPT");
      for (const agent of structure.organization.agents) {
        if (!statuses.has(agent.id)) statuses.set(agent.id, "pending_approval");
      }
    }
    if (event.type === "agent.lifecycle.changed") {
      const agents = (event.payload as { readonly agents?: readonly { readonly agentId: Identifier; readonly status: string }[] }).agents;
      if (!Array.isArray(agents)) throw new Error("AGENT_LIFECYCLE_PROJECTION_CORRUPT");
      statuses.clear();
      for (const agent of agents) statuses.set(agent.agentId, agent.status);
    }
  }
  return statuses;
}

function structureFrom(event: CompanyDomainEvent): CompanyStructure {
  const structure = (event.payload as { readonly structure?: CompanyStructure }).structure;
  if (!structure) throw new Error("ORGANIZATION_PROJECTION_CORRUPT");
  return validateCompanyStructure(structure);
}

function assertAppendOnlyPrincipals(current: OrganizationDraft, next: OrganizationDraft): void {
  for (const department of current.departments) {
    if (!next.departments.some(({ id }) => id === department.id)) throw new Error("DEPARTMENT_ARCHIVE_REQUIRED");
  }
  for (const human of current.humans) {
    if (!next.humans.some(({ id }) => id === human.id)) throw new Error("HUMAN_ARCHIVE_REQUIRED");
  }
  for (const agent of current.agents) {
    if (!next.agents.some(({ id }) => id === agent.id)) throw new Error("AGENT_ARCHIVE_REQUIRED");
  }
}

function nextStaffing(
  current: CompanyStructure,
  organization: OrganizationDraft,
  nextId: () => Identifier,
): Pick<CompanyStructure, "positions" | "reportingLines"> {
  const humansById = new Map(organization.humans.map((human) => [human.id, human]));
  const agentsById = new Map(organization.agents.map((agent) => [agent.id, agent]));
  const positions = current.positions.map((position) => {
    const human = humansById.get(position.principalId);
    if (human) return {
      ...position,
      title: human.title,
      departmentId: human.departmentId,
      accountableHumanId: human.id,
    };
    const agent = agentsById.get(position.principalId);
    if (agent) return {
      ...position,
      title: agent.role,
      departmentId: agent.departmentId,
      accountableHumanId: agent.accountableHumanId,
    };
    return position;
  });
  const positioned = new Set(positions.map(({ principalId }) => principalId));
  for (const human of organization.humans) {
    if (!positioned.has(human.id)) positions.push({
      id: nextId(), title: human.title, departmentId: human.departmentId,
      principalId: human.id, accountableHumanId: human.id,
    });
  }
  for (const agent of organization.agents) {
    if (!positioned.has(agent.id)) positions.push({
      id: nextId(), title: agent.role, departmentId: agent.departmentId,
      principalId: agent.id, accountableHumanId: agent.accountableHumanId,
    });
  }
  const agentPositionIds = new Set(positions
    .filter(({ principalId }) => agentsById.has(principalId))
    .map(({ id }) => id));
  const reportingLines = current.reportingLines.filter(
    ({ subordinatePositionId }) => !agentPositionIds.has(subordinatePositionId),
  );
  const managed = new Set(reportingLines.map(({ subordinatePositionId }) => subordinatePositionId));
  for (const agent of organization.agents) {
    const subordinate = positions.find(({ principalId }) => principalId === agent.id);
    const manager = positions.find(({ principalId }) => principalId === agent.accountableHumanId);
    if (subordinate && manager && !managed.has(subordinate.id)) {
      reportingLines.push({ subordinatePositionId: subordinate.id, managerPositionId: manager.id });
      managed.add(subordinate.id);
    }
  }
  return { positions, reportingLines };
}

function responsibilitySnapshotFrom(events: readonly CompanyDomainEvent[]): {
  readonly revision: number;
  readonly contracts: readonly ResponsibilityContract[];
} {
  for (const event of [...events].reverse()) {
    if (event.type === "responsibility.contracts.replaced") {
      const value = event.payload as { revision?: number; contracts?: ResponsibilityContract[] };
      if (Number.isInteger(value.revision) && Array.isArray(value.contracts)) {
        return { revision: value.revision as number, contracts: structuredClone(value.contracts) };
      }
    }
    if (event.type === "organization.revised") {
      const value = (event.payload as { responsibilitySnapshot?: {
        revision?: number; contracts?: ResponsibilityContract[];
      } }).responsibilitySnapshot;
      if (value && Number.isInteger(value.revision) && Array.isArray(value.contracts)) {
        return { revision: value.revision as number, contracts: structuredClone(value.contracts) };
      }
    }
  }
  return { revision: 0, contracts: [] };
}

function contractsFor(
  organization: OrganizationDraft,
  current: readonly ResponsibilityContract[],
  nextId: () => Identifier,
): ResponsibilityContract[] {
  const byAgent = new Map(current.map((contract) => [contract.agentId, contract]));
  return organization.agents.map((agent) => structuredClone(byAgent.get(agent.id) ?? {
    id: nextId(), companyId: organization.company.id, agentId: agent.id,
    accountableHumanId: agent.accountableHumanId, backupHumanId: null,
    autonomyLevel: agent.autonomyLevel,
    allowedActions: ["read-knowledge", "draft-content"],
    approvalRequiredActions: [], escalationTimeoutSeconds: null,
    status: "DRAFT",
  }));
}
