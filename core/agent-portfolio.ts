import type { AgentDescriptor, Identifier } from "./control-plane.ts";

export const AGENT_CLASSES = ["PERSONAL", "SHARED", "FEDERATED_RUNTIME"] as const;
export type AgentClass = typeof AGENT_CLASSES[number];

export const AGENT_MANAGEMENT_DEPTHS = [
  "INVENTORY", "OBSERVED", "GOVERNED", "FEDERATED",
] as const;
export type AgentManagementDepth = typeof AGENT_MANAGEMENT_DEPTHS[number];

export const AGENT_EXECUTION_OWNERS = [
  "HUMAN_ENDPOINT", "ANC_CONNECTOR", "EXTERNAL_PLATFORM",
] as const;
export type AgentExecutionOwner = typeof AGENT_EXECUTION_OWNERS[number];

export type AgentWorkVisibility = "NONE" | "SUMMARY_AND_REFERENCES" | "GOVERNED_RECORD";
export type AgentPrivacyBoundary =
  | "PRIVATE_ACTIVITY_EXCLUDED"
  | "BOUNDED_SOURCE_RECORDS"
  | "GOVERNED_AUTHORITY_ONLY";

export interface AgentPortfolioRecord {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly displayName: string;
  readonly accountableHumanId: Identifier | null;
  readonly providerReference: Identifier | null;
  readonly runtimeReference: Identifier | null;
  readonly source: {
    readonly connectorId: Identifier | null;
    readonly externalId: string | null;
    readonly externalUrl: string | null;
  };
  readonly permissionIds: readonly Identifier[];
  readonly dataAuthorizationIds: readonly Identifier[];
  readonly lifecycleStatus: "REQUESTED" | "ACTIVE" | "PAUSED" | "RETIRED" | "ERROR";
  readonly connectorHealth: "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "NOT_BOUND";
  readonly synchronizedAt: string | null;
  readonly agentClass: AgentClass;
  readonly managementDepth: AgentManagementDepth;
  readonly executionOwner: AgentExecutionOwner;
  readonly workVisibility: AgentWorkVisibility;
  readonly privacyBoundary: AgentPrivacyBoundary;
}

const PORTABLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const EXTERNAL_ID = /^[\p{L}\p{N}._:/@#-]{1,240}$/u;
const values = <T extends string>(candidates: readonly T[]) => new Set<string>(candidates);
const AGENT_CLASS_SET = values(AGENT_CLASSES);
const MANAGEMENT_DEPTH_SET = values(AGENT_MANAGEMENT_DEPTHS);
const EXECUTION_OWNER_SET = values(AGENT_EXECUTION_OWNERS);
const LIFECYCLE_SET = values(["REQUESTED", "ACTIVE", "PAUSED", "RETIRED", "ERROR"] as const);
const HEALTH_SET = values(["HEALTHY", "DEGRADED", "UNAVAILABLE", "NOT_BOUND"] as const);
const VISIBILITY_SET = values(["NONE", "SUMMARY_AND_REFERENCES", "GOVERNED_RECORD"] as const);
const PRIVACY_SET = values([
  "PRIVATE_ACTIVITY_EXCLUDED", "BOUNDED_SOURCE_RECORDS", "GOVERNED_AUTHORITY_ONLY",
] as const);

function id(value: string, code: string): Identifier {
  const normalized = value.trim();
  if (!PORTABLE_ID.test(normalized)) throw new Error(code);
  return normalized;
}

function optionalId(value: string | null, code: string): Identifier | null {
  return value === null ? null : id(value, code);
}

function uniqueIds(candidates: readonly Identifier[], code: string): readonly Identifier[] {
  const normalized = candidates.map((candidate) => id(candidate, code));
  if (new Set(normalized).size !== normalized.length) throw new Error(code);
  return normalized;
}

function timestamp(value: string | null): string | null {
  if (value !== null && !Number.isFinite(Date.parse(value))) {
    throw new Error("AGENT_PORTFOLIO_SYNCHRONIZED_AT_INVALID");
  }
  return value;
}

function externalUrl(value: string | null): string | null {
  if (value === null) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("AGENT_PORTFOLIO_EXTERNAL_URL_INVALID");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("AGENT_PORTFOLIO_EXTERNAL_URL_INVALID");
  }
  return parsed.toString();
}

export function validateAgentPortfolioRecord(
  candidate: AgentPortfolioRecord,
): AgentPortfolioRecord {
  if (!AGENT_CLASS_SET.has(candidate.agentClass)) throw new Error("AGENT_PORTFOLIO_CLASS_INVALID");
  if (!MANAGEMENT_DEPTH_SET.has(candidate.managementDepth)) {
    throw new Error("AGENT_PORTFOLIO_MANAGEMENT_DEPTH_INVALID");
  }
  if (!EXECUTION_OWNER_SET.has(candidate.executionOwner)) {
    throw new Error("AGENT_PORTFOLIO_EXECUTION_OWNER_INVALID");
  }
  if (!LIFECYCLE_SET.has(candidate.lifecycleStatus)) {
    throw new Error("AGENT_PORTFOLIO_LIFECYCLE_STATUS_INVALID");
  }
  if (!HEALTH_SET.has(candidate.connectorHealth)) {
    throw new Error("AGENT_PORTFOLIO_CONNECTOR_HEALTH_INVALID");
  }
  if (!VISIBILITY_SET.has(candidate.workVisibility)) {
    throw new Error("AGENT_PORTFOLIO_WORK_VISIBILITY_INVALID");
  }
  if (!PRIVACY_SET.has(candidate.privacyBoundary)) {
    throw new Error("AGENT_PORTFOLIO_PRIVACY_BOUNDARY_INVALID");
  }

  if (candidate.agentClass === "PERSONAL" &&
      (candidate.managementDepth !== "INVENTORY" ||
       candidate.executionOwner !== "HUMAN_ENDPOINT" ||
       candidate.privacyBoundary !== "PRIVATE_ACTIVITY_EXCLUDED")) {
    throw new Error("AGENT_PORTFOLIO_PERSONAL_BOUNDARY_INVALID");
  }
  if (candidate.managementDepth === "INVENTORY" && candidate.workVisibility !== "NONE") {
    throw new Error("AGENT_PORTFOLIO_INVENTORY_VISIBILITY_INVALID");
  }
  if (candidate.managementDepth === "OBSERVED" &&
      (candidate.workVisibility !== "SUMMARY_AND_REFERENCES" ||
       candidate.privacyBoundary !== "BOUNDED_SOURCE_RECORDS" ||
       candidate.executionOwner === "ANC_CONNECTOR")) {
    throw new Error("AGENT_PORTFOLIO_OBSERVED_BOUNDARY_INVALID");
  }
  if (candidate.managementDepth === "GOVERNED" &&
      candidate.executionOwner !== "ANC_CONNECTOR") {
    throw new Error("AGENT_PORTFOLIO_GOVERNED_EXECUTION_OWNER_INVALID");
  }
  if (candidate.managementDepth === "GOVERNED" &&
      (candidate.workVisibility !== "GOVERNED_RECORD" ||
       candidate.privacyBoundary !== "GOVERNED_AUTHORITY_ONLY")) {
    throw new Error("AGENT_PORTFOLIO_GOVERNED_BOUNDARY_INVALID");
  }
  if (candidate.agentClass === "FEDERATED_RUNTIME" &&
      candidate.executionOwner !== "EXTERNAL_PLATFORM") {
    throw new Error("AGENT_PORTFOLIO_FEDERATED_EXECUTION_OWNER_INVALID");
  }
  if (candidate.agentClass === "FEDERATED_RUNTIME" &&
      (candidate.managementDepth !== "FEDERATED" ||
       candidate.workVisibility !== "SUMMARY_AND_REFERENCES" ||
       candidate.privacyBoundary !== "BOUNDED_SOURCE_RECORDS")) {
    throw new Error("AGENT_PORTFOLIO_FEDERATED_BOUNDARY_INVALID");
  }
  if (candidate.managementDepth === "FEDERATED" &&
      candidate.agentClass !== "FEDERATED_RUNTIME") {
    throw new Error("AGENT_PORTFOLIO_FEDERATED_CLASS_INVALID");
  }

  const displayName = candidate.displayName.trim();
  if (!displayName || [...displayName].length > 120) {
    throw new Error("AGENT_PORTFOLIO_DISPLAY_NAME_INVALID");
  }
  const externalId = candidate.source.externalId?.trim() ?? null;
  if (externalId !== null && !EXTERNAL_ID.test(externalId)) {
    throw new Error("AGENT_PORTFOLIO_EXTERNAL_ID_INVALID");
  }

  return {
    ...candidate,
    id: id(candidate.id, "AGENT_PORTFOLIO_ID_INVALID"),
    companyId: id(candidate.companyId, "AGENT_PORTFOLIO_COMPANY_ID_INVALID"),
    displayName,
    accountableHumanId: optionalId(
      candidate.accountableHumanId,
      "AGENT_PORTFOLIO_ACCOUNTABLE_HUMAN_ID_INVALID",
    ),
    providerReference: optionalId(
      candidate.providerReference,
      "AGENT_PORTFOLIO_PROVIDER_REFERENCE_INVALID",
    ),
    runtimeReference: optionalId(
      candidate.runtimeReference,
      "AGENT_PORTFOLIO_RUNTIME_REFERENCE_INVALID",
    ),
    source: {
      connectorId: optionalId(
        candidate.source.connectorId,
        "AGENT_PORTFOLIO_CONNECTOR_ID_INVALID",
      ),
      externalId,
      externalUrl: externalUrl(candidate.source.externalUrl),
    },
    permissionIds: uniqueIds(
      candidate.permissionIds,
      "AGENT_PORTFOLIO_PERMISSION_IDS_INVALID",
    ),
    dataAuthorizationIds: uniqueIds(
      candidate.dataAuthorizationIds,
      "AGENT_PORTFOLIO_DATA_AUTHORIZATION_IDS_INVALID",
    ),
    synchronizedAt: timestamp(candidate.synchronizedAt),
  };
}

export function migrateLegacyGovernedAgent(
  agent: AgentDescriptor,
  state: Pick<AgentPortfolioRecord, "lifecycleStatus" | "connectorHealth">,
): AgentPortfolioRecord {
  return validateAgentPortfolioRecord({
    id: agent.id,
    companyId: agent.companyId,
    displayName: agent.displayName,
    accountableHumanId: agent.accountableHumanId,
    providerReference: null,
    runtimeReference: agent.runtimeConnectorId,
    source: {
      connectorId: agent.runtimeConnectorId,
      externalId: null,
      externalUrl: null,
    },
    permissionIds: [],
    dataAuthorizationIds: [],
    lifecycleStatus: state.lifecycleStatus,
    connectorHealth: state.connectorHealth,
    synchronizedAt: null,
    agentClass: "SHARED",
    managementDepth: "GOVERNED",
    executionOwner: "ANC_CONNECTOR",
    workVisibility: "GOVERNED_RECORD",
    privacyBoundary: "GOVERNED_AUTHORITY_ONLY",
  });
}

