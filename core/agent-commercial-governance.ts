import type { CompanyDomainEvent, Identifier } from "./control-plane.ts";
import type { BillingType } from "./usage-budget.ts";

export interface AgentSubscriptionRecord {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly agentId: Identifier;
  readonly humanId: Identifier;
  readonly providerReference: Identifier;
  readonly planReference: Identifier;
  readonly status: "ACTIVE" | "PAUSED" | "EXPIRING" | "EXPIRED" | "CANCELLED";
  readonly seatCount: number;
  readonly quotaUnits: number;
  readonly quotaUnit: "TOKENS" | "RUNS" | "CREDITS" | "UNITS";
  readonly periodCostCents: number;
  readonly renewalAt: string;
  readonly sourceRevision: number;
  readonly synchronizedAt: string;
  readonly provenance: CompanyDomainEvent["provenance"];
}

export interface AgentCredentialStatusRecord {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly agentId: Identifier;
  readonly credentialReferenceId: Identifier;
  readonly kind: "TOKEN" | "SECRET_REFERENCE" | "OAUTH_GRANT_REFERENCE";
  readonly status: "VALID" | "EXPIRING" | "EXPIRED" | "REVOKED" | "UNKNOWN";
  readonly policyStatus: "COMPLIANT" | "NON_COMPLIANT" | "UNKNOWN";
  readonly expiresAt: string | null;
  readonly verifiedAt: string;
  readonly sourceRevision: number;
  readonly provenance: CompanyDomainEvent["provenance"];
}

export interface RenewalRequestInput {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly targetType: "SUBSCRIPTION" | "CREDENTIAL" | "QUOTA";
  readonly targetId: Identifier;
  readonly requestedBy: Identifier;
  readonly accountableHumanId: Identifier;
  readonly reason: string;
  readonly approvalRequired: boolean;
  readonly approvalRequestId: Identifier | null;
  readonly requestedAt: string;
  readonly provenance: CompanyDomainEvent["provenance"];
}

export interface RenewalRequestRecord extends RenewalRequestInput {
  readonly status: "REQUESTED" | "PENDING_APPROVAL";
}

export interface PortfolioUsageRecord {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly agentId: Identifier;
  readonly humanId: Identifier;
  readonly departmentId: Identifier;
  readonly providerReference: Identifier;
  readonly billingType: BillingType;
  readonly inputUnits: number;
  readonly outputUnits: number;
  readonly costCents: number;
  readonly source: {
    readonly connectorId: Identifier;
    readonly externalId: string;
    readonly evidenceReference: Identifier;
  };
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly provenance: CompanyDomainEvent["provenance"];
}

const SUBSCRIPTION_KEYS = [
  "id", "companyId", "agentId", "humanId", "providerReference", "planReference",
  "status", "seatCount", "quotaUnits", "quotaUnit", "periodCostCents", "renewalAt",
  "sourceRevision", "synchronizedAt", "provenance",
] as const;
const CREDENTIAL_KEYS = [
  "id", "companyId", "agentId", "credentialReferenceId", "kind", "status",
  "policyStatus", "expiresAt", "verifiedAt", "sourceRevision", "provenance",
] as const;
const RENEWAL_KEYS = [
  "id", "companyId", "targetType", "targetId", "requestedBy",
  "accountableHumanId", "reason", "approvalRequired", "approvalRequestId",
  "requestedAt", "provenance",
] as const;
const USAGE_KEYS = [
  "id", "companyId", "agentId", "humanId", "departmentId", "providerReference",
  "billingType", "inputUnits", "outputUnits", "costCents", "source",
  "occurredAt", "recordedAt", "provenance",
] as const;
const USAGE_SOURCE_KEYS = ["connectorId", "externalId", "evidenceReference"] as const;
const ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const REFERENCE = /^[\p{L}\p{N}._:/@#-]{1,240}$/u;
const BILLING = new Set<BillingType>([
  "metered_api", "subscription_included", "subscription_overage",
  "credits", "fixed", "unknown",
]);

function exact(value: object, keys: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length ||
      actual.some((key, index) => key !== expected[index])) throw new Error(code);
}

function id(value: string, code: string): Identifier {
  const normalized = value.trim();
  if (!ID.test(normalized)) throw new Error(code);
  return normalized;
}

function time(value: string | null, code: string): string | null {
  if (value !== null && !Number.isFinite(Date.parse(value))) throw new Error(code);
  return value;
}

function provenance(value: CompanyDomainEvent["provenance"]): CompanyDomainEvent["provenance"] {
  if (!["PRODUCTION", "DEMO_FIXTURE"].includes(value)) {
    throw new Error("COMMERCIAL_PROVENANCE_INVALID");
  }
  return value;
}

function count(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(code);
  return value;
}

export function validateAgentSubscription(
  input: AgentSubscriptionRecord,
): AgentSubscriptionRecord {
  exact(input, SUBSCRIPTION_KEYS, "AGENT_SUBSCRIPTION_FIELDS_INVALID");
  if (!["ACTIVE", "PAUSED", "EXPIRING", "EXPIRED", "CANCELLED"].includes(input.status) ||
      !["TOKENS", "RUNS", "CREDITS", "UNITS"].includes(input.quotaUnit)) {
    throw new Error("AGENT_SUBSCRIPTION_STATUS_INVALID");
  }
  if (input.seatCount < 1) throw new Error("AGENT_SUBSCRIPTION_SEAT_COUNT_INVALID");
  if (!Number.isSafeInteger(input.sourceRevision) || input.sourceRevision < 1) {
    throw new Error("AGENT_SUBSCRIPTION_SOURCE_REVISION_INVALID");
  }
  return {
    ...input,
    id: id(input.id, "AGENT_SUBSCRIPTION_ID_INVALID"),
    companyId: id(input.companyId, "AGENT_SUBSCRIPTION_COMPANY_ID_INVALID"),
    agentId: id(input.agentId, "AGENT_SUBSCRIPTION_AGENT_ID_INVALID"),
    humanId: id(input.humanId, "AGENT_SUBSCRIPTION_HUMAN_ID_INVALID"),
    providerReference: id(
      input.providerReference,
      "AGENT_SUBSCRIPTION_PROVIDER_REFERENCE_INVALID",
    ),
    planReference: id(input.planReference, "AGENT_SUBSCRIPTION_PLAN_REFERENCE_INVALID"),
    seatCount: count(input.seatCount, "AGENT_SUBSCRIPTION_SEAT_COUNT_INVALID"),
    quotaUnits: count(input.quotaUnits, "AGENT_SUBSCRIPTION_QUOTA_INVALID"),
    periodCostCents: count(input.periodCostCents, "AGENT_SUBSCRIPTION_COST_INVALID"),
    renewalAt: time(input.renewalAt, "AGENT_SUBSCRIPTION_RENEWAL_AT_INVALID")!,
    synchronizedAt: time(
      input.synchronizedAt,
      "AGENT_SUBSCRIPTION_SYNCHRONIZED_AT_INVALID",
    )!,
    provenance: provenance(input.provenance),
  };
}

export function validateAgentCredentialStatus(
  input: AgentCredentialStatusRecord,
): AgentCredentialStatusRecord {
  exact(input, CREDENTIAL_KEYS, "CREDENTIAL_STATUS_FIELDS_INVALID");
  if (!["TOKEN", "SECRET_REFERENCE", "OAUTH_GRANT_REFERENCE"].includes(input.kind) ||
      !["VALID", "EXPIRING", "EXPIRED", "REVOKED", "UNKNOWN"].includes(input.status) ||
      !["COMPLIANT", "NON_COMPLIANT", "UNKNOWN"].includes(input.policyStatus)) {
    throw new Error("CREDENTIAL_STATUS_VALUE_INVALID");
  }
  if (!Number.isSafeInteger(input.sourceRevision) || input.sourceRevision < 1) {
    throw new Error("CREDENTIAL_STATUS_SOURCE_REVISION_INVALID");
  }
  return {
    ...input,
    id: id(input.id, "CREDENTIAL_STATUS_ID_INVALID"),
    companyId: id(input.companyId, "CREDENTIAL_STATUS_COMPANY_ID_INVALID"),
    agentId: id(input.agentId, "CREDENTIAL_STATUS_AGENT_ID_INVALID"),
    credentialReferenceId: id(
      input.credentialReferenceId,
      "CREDENTIAL_STATUS_REFERENCE_INVALID",
    ),
    expiresAt: time(input.expiresAt, "CREDENTIAL_STATUS_EXPIRES_AT_INVALID"),
    verifiedAt: time(input.verifiedAt, "CREDENTIAL_STATUS_VERIFIED_AT_INVALID")!,
    provenance: provenance(input.provenance),
  };
}

export function validateRenewalRequest(
  input: RenewalRequestInput,
): RenewalRequestRecord {
  exact(input, RENEWAL_KEYS, "RENEWAL_REQUEST_FIELDS_INVALID");
  if (!["SUBSCRIPTION", "CREDENTIAL", "QUOTA"].includes(input.targetType)) {
    throw new Error("RENEWAL_REQUEST_TARGET_TYPE_INVALID");
  }
  if (input.approvalRequired !== (input.approvalRequestId !== null)) {
    throw new Error("RENEWAL_REQUEST_APPROVAL_BINDING_INVALID");
  }
  const reason = input.reason.trim();
  if (!reason || [...reason].length > 1_000) throw new Error("RENEWAL_REQUEST_REASON_INVALID");
  return {
    ...input,
    id: id(input.id, "RENEWAL_REQUEST_ID_INVALID"),
    companyId: id(input.companyId, "RENEWAL_REQUEST_COMPANY_ID_INVALID"),
    targetId: id(input.targetId, "RENEWAL_REQUEST_TARGET_ID_INVALID"),
    requestedBy: id(input.requestedBy, "RENEWAL_REQUEST_REQUESTED_BY_INVALID"),
    accountableHumanId: id(
      input.accountableHumanId,
      "RENEWAL_REQUEST_ACCOUNTABLE_HUMAN_INVALID",
    ),
    reason,
    approvalRequestId: input.approvalRequestId === null
      ? null
      : id(input.approvalRequestId, "RENEWAL_REQUEST_APPROVAL_ID_INVALID"),
    requestedAt: time(input.requestedAt, "RENEWAL_REQUEST_TIME_INVALID")!,
    provenance: provenance(input.provenance),
    status: input.approvalRequired ? "PENDING_APPROVAL" : "REQUESTED",
  };
}

export function validatePortfolioUsage(input: PortfolioUsageRecord): PortfolioUsageRecord {
  exact(input, USAGE_KEYS, "PORTFOLIO_USAGE_FIELDS_INVALID");
  exact(input.source, USAGE_SOURCE_KEYS, "PORTFOLIO_USAGE_SOURCE_FIELDS_INVALID");
  if (!BILLING.has(input.billingType)) throw new Error("PORTFOLIO_USAGE_BILLING_TYPE_INVALID");
  const occurredAt = time(input.occurredAt, "PORTFOLIO_USAGE_OCCURRED_AT_INVALID")!;
  const recordedAt = time(input.recordedAt, "PORTFOLIO_USAGE_RECORDED_AT_INVALID")!;
  if (Date.parse(occurredAt) > Date.parse(recordedAt)) {
    throw new Error("PORTFOLIO_USAGE_TIME_INVALID");
  }
  const externalId = input.source.externalId.trim();
  if (!REFERENCE.test(externalId)) throw new Error("PORTFOLIO_USAGE_EXTERNAL_ID_INVALID");
  return {
    ...input,
    id: id(input.id, "PORTFOLIO_USAGE_ID_INVALID"),
    companyId: id(input.companyId, "PORTFOLIO_USAGE_COMPANY_ID_INVALID"),
    agentId: id(input.agentId, "PORTFOLIO_USAGE_AGENT_ID_INVALID"),
    humanId: id(input.humanId, "PORTFOLIO_USAGE_HUMAN_ID_INVALID"),
    departmentId: id(input.departmentId, "PORTFOLIO_USAGE_DEPARTMENT_ID_INVALID"),
    providerReference: id(
      input.providerReference,
      "PORTFOLIO_USAGE_PROVIDER_REFERENCE_INVALID",
    ),
    inputUnits: count(input.inputUnits, "PORTFOLIO_USAGE_UNITS_INVALID"),
    outputUnits: count(input.outputUnits, "PORTFOLIO_USAGE_UNITS_INVALID"),
    costCents: count(input.costCents, "PORTFOLIO_USAGE_COST_INVALID"),
    source: {
      connectorId: id(input.source.connectorId, "PORTFOLIO_USAGE_CONNECTOR_ID_INVALID"),
      externalId,
      evidenceReference: id(
        input.source.evidenceReference,
        "PORTFOLIO_USAGE_EVIDENCE_REFERENCE_INVALID",
      ),
    },
    occurredAt,
    recordedAt,
    provenance: provenance(input.provenance),
  };
}

