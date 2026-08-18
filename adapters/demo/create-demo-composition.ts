import { CompanyOperations } from "../../application/company-operations.ts";
import { DeterministicDemoRuntime } from "../../application/deterministic-demo-runtime.ts";
import type { CompanyDomainEvent, Identifier } from "../../core/control-plane.ts";
import type { ApprovalDecision, ApprovalRequest } from "../../ports/approval-publication-port.ts";
import type { EvidenceRecord, ResponsibilityProjection } from "../../ports/audit-evidence-port.ts";
import type { AppendResult, EventReadOptions } from "../../ports/event-data-store-port.ts";
import { DEMO_COMPANY } from "./demo-company.ts";

class DemoEventStore {
  readonly #events: CompanyDomainEvent[] = [];

  async append(event: CompanyDomainEvent, expectedSequence = this.#events.length): Promise<AppendResult> {
    if (expectedSequence !== this.#events.length) throw new Error("EVENT_SEQUENCE_CONFLICT");
    this.#events.push(event);
    return { sequence: this.#events.length, storedAt: event.occurredAt };
  }

  async read(companyId: Identifier, options: EventReadOptions = {}): Promise<readonly CompanyDomainEvent[]> {
    return this.#events.filter((event, index) =>
      event.companyId === companyId &&
      (options.afterSequence === undefined || index + 1 > options.afterSequence) &&
      (options.types === undefined || options.types.includes(event.type))
    );
  }

  async resetFixture(companyId: Identifier): Promise<void> {
    if (this.#events.some((event) =>
      event.companyId === companyId && event.provenance !== "DEMO_FIXTURE"
    )) {
      throw new Error("FORMAL_EVENT_CANNOT_BE_RESET");
    }
    this.#events.splice(0, this.#events.length, ...this.#events.filter(({ companyId: value }) => value !== companyId));
  }
}

class DemoApprovalStore {
  readonly requests: ApprovalRequest[] = [];
  readonly decisions = new Map<Identifier, ApprovalDecision>();

  async publishRequest(input: ApprovalRequest): Promise<void> {
    if (this.requests.some(({ id }) => id === input.id)) throw new Error("APPROVAL_ALREADY_EXISTS");
    this.requests.push(input);
  }

  async pending(companyId: Identifier): Promise<readonly ApprovalRequest[]> {
    return this.requests.filter(({ companyId: value }) => value === companyId);
  }

  async publishDecision(decision: ApprovalDecision): Promise<void> {
    if (this.decisions.has(decision.requestId)) throw new Error("APPROVAL_ALREADY_DECIDED");
    this.decisions.set(decision.requestId, decision);
  }

  async decision(requestId: Identifier): Promise<ApprovalDecision | null> {
    return this.decisions.get(requestId) ?? null;
  }
}

class DemoAuditEvidenceStore {
  readonly evidence: EvidenceRecord[] = [];

  async recordEvidence(record: EvidenceRecord): Promise<void> {
    this.evidence.push(record);
  }

  async projectResponsibility(workId: Identifier): Promise<ResponsibilityProjection> {
    return {
      workId,
      goalInitiatorId: "demo-boss",
      accountableHumanId: "demo-boss",
      executingAgentId: "demo-researcher",
      permissionReferences: ["permission-read-demo", "permission-publish-demo"],
      dataAuthorizationReferences: ["data-contract-demo-market"],
      approvalReferences: ["demo-approval-001"],
      evidenceReferences: this.evidence.map(({ id }) => id),
      resultReference: this.evidence.some(({ kind }) => kind === "RESULT")
        ? "demo-result-001"
        : null,
    };
  }
}

export function createDemoComposition() {
  let sequence = 0;
  const timestamps = [
    "2026-08-18T08:00:00.000Z",
    "2026-08-18T08:00:20.000Z",
    "2026-08-18T08:00:40.000Z",
    "2026-08-18T08:01:00.000Z",
    "2026-08-18T08:01:20.000Z",
    "2026-08-18T08:01:40.000Z",
    "2026-08-18T08:02:00.000Z",
  ] as const;
  const eventStore = new DemoEventStore();
  const approval = new DemoApprovalStore();
  const auditEvidence = new DemoAuditEvidenceStore();
  const organization = {
    async getOrganization(companyId: Identifier) {
      return companyId === DEMO_COMPANY.company.id ? DEMO_COMPANY : null;
    },
    async listPrincipals() {
      return [{ id: "demo-boss", kind: "HUMAN" as const, displayName: "林澄" }];
    },
  };
  const sources = {
    nextId() {
      sequence += 1;
      return `demo-event-${String(sequence).padStart(3, "0")}`;
    },
    now() {
      return timestamps[Math.min(sequence, timestamps.length - 1)]!;
    },
    reset() {
      sequence = 0;
    },
  };
  const operations = new CompanyOperations({
    mode: "DEMO_FIXTURE",
    companyId: DEMO_COMPANY.company.id,
    actorId: "demo-boss",
    eventStore,
    approval,
    auditEvidence,
    organization,
    sources,
  });
  return {
    runtime: new DeterministicDemoRuntime(operations),
    operations,
    ports: { approval, auditEvidence, eventStore, organization },
  };
}

