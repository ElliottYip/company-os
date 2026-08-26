import type { Identifier } from "../core/control-plane.ts";
import type { EvidenceRecord } from "../ports/audit-evidence-port.ts";
import type { ApprovalDecision, ApprovalRequest } from "../ports/approval-publication-port.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface AccountabilityEvidenceProjection extends EvidenceRecord {
  readonly attemptId: Identifier | null;
  readonly source: "AUDIT_STORE" | "CONNECTOR";
}

export interface AccountabilityLedgerProjection {
  readonly schemaVersion: 1;
  readonly companyId: Identifier;
  readonly approvals: readonly {
    readonly request: ApprovalRequest;
    readonly decision: ApprovalDecision | null;
    readonly status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  }[];
  readonly evidence: readonly AccountabilityEvidenceProjection[];
  readonly generatedAt: string;
}

export class GetAccountabilityLedger {
  readonly #identity: IdentityPort;
  readonly #events: EventDataStorePort;
  readonly #now: () => string;

  constructor(dependencies: { readonly identity: IdentityPort; readonly events: EventDataStorePort; readonly now: () => string }) {
    this.#identity = dependencies.identity;
    this.#events = dependencies.events;
    this.#now = dependencies.now;
  }

  async execute(companyId: Identifier): Promise<AccountabilityLedgerProjection> {
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== companyId) throw new Error("TENANT_MISMATCH");
    const receipt = await this.#identity.authorize({ companyId, action: "accountability:read",
      resourceId: companyId, reason: "Read approval and evidence accountability ledger" });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    const events = await this.#events.read(companyId);
    return projectAccountabilityLedger(events, companyId, receipt.authorizedAt, this.#now());
  }
}

export function projectAccountabilityLedger(
  events: readonly import("../core/control-plane.ts").CompanyDomainEvent[],
  companyId: Identifier,
  generatedAt: string,
  currentTime: string,
): AccountabilityLedgerProjection {
    if (!Number.isFinite(Date.parse(generatedAt)) || !Number.isFinite(Date.parse(currentTime))) {
      throw new Error("ACCOUNTABILITY_LEDGER_CORRUPT");
    }
    const decisions = new Map<Identifier, ApprovalDecision>();
    for (const event of events) {
      if (event.type !== "approval.publication.decided") continue;
      const decision = (event.payload as { decision?: ApprovalDecision }).decision;
      if (decision) {
        validateDecision(decision);
        decisions.set(decision.requestId, structuredClone(decision));
      }
    }
    const now = Date.parse(currentTime);
    const approvals = events.flatMap((event) => {
      if (event.type !== "approval.publication.requested") return [];
      const request = (event.payload as { request?: ApprovalRequest }).request;
      validateRequest(request, companyId);
      const decision = decisions.get(request.id) ?? null;
      const status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" =
        decision?.decision ?? (Date.parse(request.expiresAt) <= now ? "EXPIRED" : "PENDING");
      return [{ request: structuredClone(request), decision,
        status }];
    });
    const workByAttempt = new Map<Identifier, Identifier>();
    for (const event of events) {
      if (event.type !== "work-attempt.recorded") continue;
      const attempt = (event.payload as { attempt?: { id?: Identifier; workId?: Identifier } }).attempt;
      if (attempt?.id && attempt.workId) workByAttempt.set(attempt.id, attempt.workId);
    }
    const evidence = new Map<Identifier, AccountabilityEvidenceProjection>();
    for (const event of events) {
      if (event.type === "evidence.persisted") {
        const record = (event.payload as { record?: EvidenceRecord }).record;
        validateEvidence(record, companyId);
        evidence.set(record.id, { ...structuredClone(record), attemptId: null, source: "AUDIT_STORE" });
        continue;
      }
      if (event.type !== "connector.observation.recorded") continue;
      const value = event.payload as { attemptId?: Identifier; observation?: {
        recordedAt?: string; summary?: string; resultReference?: Identifier | null;
        evidenceOutputs?: readonly { evidenceReference?: Identifier; contentDigest?: string }[];
      } };
      if (!value.attemptId || !value.observation) continue;
      const workId = workByAttempt.get(value.attemptId);
      if (!workId) throw new Error("ACCOUNTABILITY_LEDGER_CORRUPT");
      for (const output of value.observation.evidenceOutputs ?? []) {
        if (!output.evidenceReference || !ID.test(output.evidenceReference) || !output.contentDigest ||
            !DIGEST.test(output.contentDigest) || !value.observation.recordedAt ||
            !Number.isFinite(Date.parse(value.observation.recordedAt)) ||
            typeof value.observation.summary !== "string" || value.observation.summary.length > 2_000) {
          throw new Error("ACCOUNTABILITY_LEDGER_CORRUPT");
        }
        evidence.set(output.evidenceReference, {
          id: output.evidenceReference, workId, attemptId: value.attemptId,
          kind: output.evidenceReference === value.observation.resultReference ? "RESULT" : "ARTIFACT",
          summary: String(value.observation.summary ?? ""), contentDigest: output.contentDigest,
          recordedAt: value.observation.recordedAt, provenance: "PRODUCTION", source: "CONNECTOR",
        });
      }
    }
    return { schemaVersion: 1, companyId, approvals, evidence: [...evidence.values()], generatedAt };
}

function validateEvidence(record: EvidenceRecord | undefined, companyId: Identifier): asserts record is EvidenceRecord {
  if (!record || !ID.test(record.id) || !ID.test(record.workId) || !DIGEST.test(record.contentDigest) ||
      !["PLAN", "TOOL_ACTIVITY", "ARTIFACT", "RESULT"].includes(record.kind) ||
      !Number.isFinite(Date.parse(record.recordedAt)) || !["PRODUCTION", "DEMO_FIXTURE"].includes(record.provenance)) {
    throw new Error("ACCOUNTABILITY_LEDGER_CORRUPT");
  }
  if (record.provenance !== "PRODUCTION") throw new Error("ACCOUNTABILITY_LEDGER_FIXTURE_FORBIDDEN");
  void companyId;
}

function validateRequest(request: ApprovalRequest | undefined, companyId: Identifier): asserts request is ApprovalRequest {
  const binding = request?.binding;
  const action = binding?.action;
  if (!request || request.companyId !== companyId || !ID.test(request.id) || request.status !== "AWAITING_APPROVAL" ||
      !Number.isFinite(Date.parse(request.requestedAt)) || !Number.isFinite(Date.parse(request.expiresAt)) ||
      !binding || !action || !ID.test(action.id) || !action.type || !action.description ||
      !DIGEST.test(action.inputDigest) || !["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(action.risk) ||
      !ID.test(binding.workId) || !ID.test(binding.responsibilityContractId) ||
      !ID.test(binding.executingAgentId) || !ID.test(binding.accountableHumanId) ||
      !Array.isArray(binding.evidenceReferences) || binding.evidenceReferences.some((id) => !ID.test(id)) ||
      !(binding.resultReference === null || ID.test(binding.resultReference))) {
    throw new Error("ACCOUNTABILITY_LEDGER_CORRUPT");
  }
}

function validateDecision(decision: ApprovalDecision): void {
  if (!ID.test(decision.requestId) || !ID.test(decision.decidedBy) ||
      !["APPROVED", "REJECTED"].includes(decision.decision) ||
      !Number.isFinite(Date.parse(decision.decidedAt)) ||
      (decision.note !== undefined && (typeof decision.note !== "string" || decision.note.length > 2_000))) {
    throw new Error("ACCOUNTABILITY_LEDGER_CORRUPT");
  }
}
