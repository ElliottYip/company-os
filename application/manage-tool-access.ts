import type { Identifier } from "../core/control-plane.ts";
import { validateToolAccessCatalog, type ToolPolicy, type ToolProfileEntry, type ToolProfileStatus } from "../core/tool-access.ts";
import type { CompanyStructurePort } from "../ports/company-structure-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { ToolAccessCatalogPort } from "../ports/tool-access-catalog-port.ts";

interface Dependencies {
  readonly identity: IdentityPort; readonly structure: CompanyStructurePort;
  readonly store: ToolAccessCatalogPort; readonly now: () => string;
}
export class ManageToolAccess {
  readonly #dependencies: Dependencies;
  constructor(dependencies: Dependencies) { this.#dependencies = dependencies; }

  async createProfile(input: {
    readonly companyId: Identifier; readonly profileId: Identifier; readonly profileKey: Identifier;
    readonly name: string; readonly description: string | null; readonly defaultAction: "deny" | "allow";
    readonly entries: readonly Omit<ToolProfileEntry, "companyId" | "profileId">[];
    readonly expectedRevision: number;
  }) {
    const { identity, snapshot } = await this.#context(input.companyId, input.expectedRevision);
    if (snapshot.profiles.some(({ id, profileKey }) => id === input.profileId || profileKey === input.profileKey)) {
      throw new Error("TOOL_PROFILE_ALREADY_EXISTS");
    }
    const next = validateToolAccessCatalog({ ...snapshot,
      profiles: [...snapshot.profiles, { id: input.profileId, companyId: input.companyId,
        profileKey: input.profileKey, name: input.name, description: input.description,
        status: "active", defaultAction: input.defaultAction }],
      entries: [...snapshot.entries, ...input.entries.map((entry) => ({ ...entry,
        companyId: input.companyId, profileId: input.profileId }))],
    });
    return this.#save(identity.actorId, next, input.expectedRevision, "tool-profile:create", input.profileId);
  }

  async bindProfile(input: {
    readonly companyId: Identifier; readonly bindingId: Identifier; readonly profileId: Identifier;
    readonly targetType: "company" | "agent" | "project"; readonly targetId: Identifier;
    readonly priority: number; readonly expectedRevision: number;
  }) {
    const { identity, snapshot } = await this.#context(input.companyId, input.expectedRevision);
    if (!snapshot.profiles.some(({ id }) => id === input.profileId)) throw new Error("TOOL_PROFILE_NOT_FOUND");
    if (snapshot.bindings.some(({ id }) => id === input.bindingId)) throw new Error("TOOL_PROFILE_BINDING_ALREADY_EXISTS");
    const structure = await this.#dependencies.structure.load(input.companyId);
    if (!structure) throw new Error("COMPANY_STRUCTURE_NOT_FOUND");
    const validTarget = input.targetType === "company" ? input.targetId === input.companyId
      : input.targetType === "agent" ? structure.organization.agents.some(({ id }) => id === input.targetId)
        : structure.projects.some(({ id }) => id === input.targetId);
    if (!validTarget) throw new Error("TOOL_PROFILE_BINDING_TARGET_NOT_FOUND");
    const next = validateToolAccessCatalog({ ...snapshot, bindings: [...snapshot.bindings, {
      id: input.bindingId, companyId: input.companyId, profileId: input.profileId,
      targetType: input.targetType, targetId: input.targetId, priority: input.priority,
    }] });
    return this.#save(identity.actorId, next, input.expectedRevision, "tool-profile:bind", input.bindingId);
  }

  async createPolicy(input: {
    readonly companyId: Identifier; readonly policy: Omit<ToolPolicy, "companyId" | "enabled">;
    readonly expectedRevision: number;
  }) {
    const { identity, snapshot } = await this.#context(input.companyId, input.expectedRevision);
    if (snapshot.policies.some(({ id, name }) => id === input.policy.id || name === input.policy.name)) {
      throw new Error("TOOL_POLICY_ALREADY_EXISTS");
    }
    const next = validateToolAccessCatalog({ ...snapshot, policies: [...snapshot.policies,
      { ...input.policy, companyId: input.companyId, enabled: true }] });
    return this.#save(identity.actorId, next, input.expectedRevision, "tool-policy:create", input.policy.id);
  }

  async setProfileStatus(input: { readonly companyId: Identifier; readonly profileId: Identifier;
    readonly status: ToolProfileStatus; readonly expectedRevision: number }) {
    const { identity, snapshot } = await this.#context(input.companyId, input.expectedRevision);
    const profile = snapshot.profiles.find(({ id }) => id === input.profileId);
    if (!profile) throw new Error("TOOL_PROFILE_NOT_FOUND");
    if (profile.status === "archived" && input.status !== "archived") throw new Error("TOOL_PROFILE_ARCHIVED_TERMINAL");
    if (profile.status === input.status) return snapshot;
    const next = validateToolAccessCatalog({ ...snapshot, profiles: snapshot.profiles.map((candidate) =>
      candidate.id === input.profileId ? { ...candidate, status: input.status } : candidate) });
    return this.#save(identity.actorId, next, input.expectedRevision, "tool-profile:update", input.profileId);
  }

  async #context(companyId: Identifier, expectedRevision: number) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("TOOL_ACCESS_INPUT_INVALID");
    const identity = await this.#dependencies.identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== companyId) throw new Error("TENANT_MISMATCH");
    const snapshot = await this.#dependencies.store.load(companyId);
    if (snapshot.revision !== expectedRevision) throw new Error("TOOL_ACCESS_REVISION_CONFLICT");
    return { identity, snapshot };
  }
  async #save(actorId: Identifier, catalog: ReturnType<typeof validateToolAccessCatalog>, expectedRevision: number,
    action: string, resourceId: Identifier) {
    const receipt = await this.#dependencies.identity.authorize({ companyId: catalog.companyId, action, resourceId,
      reason: "Manage tool profile, binding, or policy" });
    if (receipt.principalId !== actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    return this.#dependencies.store.replace(catalog, expectedRevision, actorId, this.#dependencies.now());
  }
}
