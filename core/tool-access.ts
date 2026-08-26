import type { Identifier } from "./control-plane.ts";

export type ToolRiskLevel = "low" | "medium" | "high" | "critical" | "read" | "write" | "destructive";
export type ToolProfileStatus = "draft" | "active" | "disabled" | "archived";
export type ToolProfileDefaultAction = "deny" | "allow";
export type ToolProfileEntrySelectorType = "application" | "connection" | "catalog_entry" | "tool_name" | "risk_level";
export type ToolProfileEntryEffect = "include" | "exclude";
export type ToolProfileBindingTargetType = "company" | "agent" | "project" | "routine" | "issue" | "gateway";
export type ToolPolicyType = "allow" | "block" | "require_approval" | "trust_rule" | "rate_limit";
export type ToolPolicyDecision = "allow" | "deny" | "require_approval" | "rate_limited" | "defer_runtime";

export interface ToolProfile {
  readonly id: Identifier; readonly companyId: Identifier; readonly profileKey: Identifier;
  readonly name: string; readonly description: string | null; readonly status: ToolProfileStatus;
  readonly defaultAction: ToolProfileDefaultAction;
}
export interface ToolProfileEntry {
  readonly id: Identifier; readonly companyId: Identifier; readonly profileId: Identifier;
  readonly selectorType: ToolProfileEntrySelectorType; readonly selectorValue: Identifier;
  readonly effect: ToolProfileEntryEffect;
}
export interface ToolProfileBinding {
  readonly id: Identifier; readonly companyId: Identifier; readonly profileId: Identifier;
  readonly targetType: ToolProfileBindingTargetType; readonly targetId: Identifier; readonly priority: number;
}
export interface ToolPolicy {
  readonly id: Identifier; readonly companyId: Identifier; readonly name: string;
  readonly description: string | null; readonly policyType: ToolPolicyType;
  readonly priority: number; readonly enabled: boolean;
  readonly selectors: Readonly<Partial<Record<"agentId" | "projectId" | "applicationId" | "connectionId" | "catalogEntryId" | "toolName" | "riskLevel", Identifier>>>;
}
export interface ToolAccessCatalog {
  readonly companyId: Identifier; readonly revision: number;
  readonly profiles: readonly ToolProfile[]; readonly entries: readonly ToolProfileEntry[];
  readonly bindings: readonly ToolProfileBinding[]; readonly policies: readonly ToolPolicy[];
}
export interface ToolAccessIntent {
  readonly companyId: Identifier; readonly agentId: Identifier; readonly projectId: Identifier | null;
  readonly applicationId: Identifier; readonly connectionId: Identifier;
  readonly catalogEntryId: Identifier; readonly toolName: Identifier; readonly riskLevel: ToolRiskLevel;
}
export interface ToolAccessDecision {
  readonly decision: ToolPolicyDecision; readonly reasonCode: string;
  readonly effectiveProfileIds: readonly Identifier[]; readonly matchedPolicyIds: readonly Identifier[];
}

const ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const PROFILE_STATUSES: readonly ToolProfileStatus[] = ["draft", "active", "disabled", "archived"];
const SELECTORS: readonly ToolProfileEntrySelectorType[] = ["application", "connection", "catalog_entry", "tool_name", "risk_level"];
const RISKS: readonly ToolRiskLevel[] = ["low", "medium", "high", "critical", "read", "write", "destructive"];
const TARGETS: readonly ToolProfileBindingTargetType[] = ["company", "agent", "project", "routine", "issue", "gateway"];
const POLICY_TYPES: readonly ToolPolicyType[] = ["allow", "block", "require_approval", "trust_rule", "rate_limit"];

function unique(values: readonly string[], code: string) {
  if (new Set(values).size !== values.length) throw new Error(code);
}
function text(value: string, maximum: number, code: string) {
  const normalized = value.trim(); if (!normalized || [...normalized].length > maximum) throw new Error(code);
  return normalized;
}

export function validateToolAccessCatalog(catalog: ToolAccessCatalog): ToolAccessCatalog {
  if (!ID.test(catalog.companyId) || !Number.isSafeInteger(catalog.revision) || catalog.revision < 0) {
    throw new Error("TOOL_ACCESS_CATALOG_INVALID");
  }
  unique(catalog.profiles.map(({ id }) => id), "TOOL_PROFILE_IDS_DUPLICATE");
  unique(catalog.profiles.map(({ profileKey }) => profileKey), "TOOL_PROFILE_KEYS_DUPLICATE");
  unique(catalog.entries.map(({ id }) => id), "TOOL_PROFILE_ENTRY_IDS_DUPLICATE");
  unique(catalog.bindings.map(({ id }) => id), "TOOL_PROFILE_BINDING_IDS_DUPLICATE");
  unique(catalog.policies.map(({ id }) => id), "TOOL_POLICY_IDS_DUPLICATE");
  const profiles = catalog.profiles.map((profile) => {
    if (profile.companyId !== catalog.companyId || !ID.test(profile.id) || !ID.test(profile.profileKey) ||
        !PROFILE_STATUSES.includes(profile.status) || !["deny", "allow"].includes(profile.defaultAction)) {
      throw new Error("TOOL_PROFILE_INVALID");
    }
    return { ...profile, name: text(profile.name, 160, "TOOL_PROFILE_INVALID"),
      description: profile.description === null ? null : text(profile.description, 4000, "TOOL_PROFILE_INVALID") };
  });
  const profileIds = new Set(profiles.map(({ id }) => id));
  const entries = catalog.entries.map((entry) => {
    if (entry.companyId !== catalog.companyId || !ID.test(entry.id) || !profileIds.has(entry.profileId) ||
        !SELECTORS.includes(entry.selectorType) || !["include", "exclude"].includes(entry.effect) ||
        !ID.test(entry.selectorValue) || (entry.selectorType === "risk_level" && !RISKS.includes(entry.selectorValue as ToolRiskLevel))) {
      throw new Error("TOOL_PROFILE_ENTRY_INVALID");
    }
    return { ...entry };
  });
  const bindings = catalog.bindings.map((binding) => {
    if (binding.companyId !== catalog.companyId || !ID.test(binding.id) || !profileIds.has(binding.profileId) ||
        !TARGETS.includes(binding.targetType) || !ID.test(binding.targetId) ||
        !Number.isSafeInteger(binding.priority) || binding.priority < 0 || binding.priority > 10_000) {
      throw new Error("TOOL_PROFILE_BINDING_INVALID");
    }
    return { ...binding };
  });
  const policies = catalog.policies.map((policy) => {
    if (policy.companyId !== catalog.companyId || !ID.test(policy.id) || !POLICY_TYPES.includes(policy.policyType) ||
        !Number.isSafeInteger(policy.priority) || policy.priority < 0 || policy.priority > 10_000 ||
        typeof policy.enabled !== "boolean" || Object.values(policy.selectors).some((value) => value && !ID.test(value))) {
      throw new Error("TOOL_POLICY_INVALID");
    }
    return { ...policy, name: text(policy.name, 160, "TOOL_POLICY_INVALID"),
      description: policy.description === null ? null : text(policy.description, 4000, "TOOL_POLICY_INVALID"),
      selectors: { ...policy.selectors } };
  });
  return { companyId: catalog.companyId, revision: catalog.revision, profiles, entries, bindings, policies };
}

function selectorMatches(selectors: ToolPolicy["selectors"], intent: ToolAccessIntent) {
  return Object.entries(selectors).every(([key, value]) => value === intent[key as keyof ToolAccessIntent]);
}
function entryMatches(entry: ToolProfileEntry, intent: ToolAccessIntent) {
  const values = { application: intent.applicationId, connection: intent.connectionId,
    catalog_entry: intent.catalogEntryId, tool_name: intent.toolName, risk_level: intent.riskLevel };
  return values[entry.selectorType] === entry.selectorValue;
}

export function evaluateToolAccess(catalog: ToolAccessCatalog, intent: ToolAccessIntent): ToolAccessDecision {
  if (catalog.companyId !== intent.companyId) return { decision: "deny", reasonCode: "TENANT_MISMATCH", effectiveProfileIds: [], matchedPolicyIds: [] };
  const bindings = catalog.bindings.filter((binding) =>
    (binding.targetType === "company" && binding.targetId === intent.companyId) ||
    (binding.targetType === "agent" && binding.targetId === intent.agentId) ||
    (binding.targetType === "project" && binding.targetId === intent.projectId)).sort((a, b) => a.priority - b.priority);
  const profiles = bindings.map(({ profileId }) => catalog.profiles.find(({ id }) => id === profileId))
    .filter((profile): profile is ToolProfile => profile?.status === "active");
  const effectiveProfileIds = profiles.map(({ id }) => id);
  const policies = catalog.policies.filter(({ enabled, selectors }) => enabled && selectorMatches(selectors, intent))
    .sort((a, b) => a.priority - b.priority);
  for (const policy of policies) {
    if (policy.policyType === "block") return { decision: "deny", reasonCode: "deny_policy_block", effectiveProfileIds, matchedPolicyIds: [policy.id] };
    if (policy.policyType === "require_approval") return { decision: "require_approval", reasonCode: "requires_approval_policy", effectiveProfileIds, matchedPolicyIds: [policy.id] };
    if (policy.policyType === "allow") return { decision: "allow", reasonCode: "allow_policy", effectiveProfileIds, matchedPolicyIds: [policy.id] };
    return { decision: "deny", reasonCode: "deny_unsupported_policy_runtime", effectiveProfileIds, matchedPolicyIds: [policy.id] };
  }
  for (const profile of profiles) {
    const matches = catalog.entries.filter((entry) => entry.profileId === profile.id && entryMatches(entry, intent));
    if (matches.some(({ effect }) => effect === "exclude")) continue;
    if (profile.defaultAction === "allow" || matches.some(({ effect }) => effect === "include")) {
      return { decision: "allow", reasonCode: "allow_profile", effectiveProfileIds, matchedPolicyIds: [] };
    }
  }
  return { decision: "deny", reasonCode: "deny_default", effectiveProfileIds, matchedPolicyIds: [] };
}
