import type { Identifier, WorkObservation } from "../core/control-plane.ts";
import type { UnknownOutcomeResolution } from "../core/work-attempt.ts";
import type { EvidenceRecord } from "../ports/audit-evidence-port.ts";
import type { DurableControlPlaneStorePort } from "../ports/durable-control-plane-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import { WorkAttemptService } from "./work-attempt-service.ts";

interface Dependencies {
  identity: IdentityPort;
  store: DurableControlPlaneStorePort;
  now: () => string;
  nextId: () => Identifier;
}

export class ReconcileWorkAttempt {
  readonly #attempts: WorkAttemptService;
  readonly #dependencies: Dependencies;
  constructor(dependencies: Dependencies) { this.#dependencies = dependencies; this.#attempts = new WorkAttemptService(dependencies.store); }

  async execute(input: { companyId: Identifier; workId: Identifier; attemptId: Identifier;
    resolution: UnknownOutcomeResolution; evidenceId: Identifier }) {
    const identity = await this.#dependencies.identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== input.companyId) throw new Error("TENANT_MISMATCH");
    const attempt = await this.#attempts.load(input.companyId, input.attemptId);
    if (!attempt || attempt.workId !== input.workId) throw new Error("WORK_ATTEMPT_NOT_FOUND");
    if (attempt.reconciliation) {
      if (attempt.reconciliation.resolution === input.resolution && attempt.reconciliation.evidenceId === input.evidenceId) return attempt;
      throw new Error("WORK_ATTEMPT_RECONCILIATION_CONFLICT");
    }
    if (attempt.status !== "OUTCOME_UNKNOWN") throw new Error("WORK_ATTEMPT_NOT_OUTCOME_UNKNOWN");
    const receipt = await this.#dependencies.identity.authorize({ companyId: input.companyId,
      action: "work:reconcile", resourceId: input.workId,
      reason: "Resolve an unknown external outcome using admitted evidence" });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    const evidence = this.#admittedEvidence(await this.#dependencies.store.read(input.companyId), input);
    if (!evidence.found) throw new Error("WORK_ATTEMPT_RECONCILIATION_EVIDENCE_NOT_FOUND");
    if (input.resolution === "CONFIRMED_SUCCEEDED" && !evidence.provesResult) {
      throw new Error("WORK_ATTEMPT_RECONCILIATION_RESULT_EVIDENCE_REQUIRED");
    }
    const resolvedAt = this.#dependencies.now();
    return this.#attempts.transition({ companyId: input.companyId, attemptId: input.attemptId,
      operation: "RECONCILE", eventId: this.#dependencies.nextId(), actorId: identity.actorId,
      occurredAt: resolvedAt, expectedEventSequence: (await this.#dependencies.store.read(input.companyId)).length,
      reconciliation: { resolution: input.resolution, evidenceId: input.evidenceId,
        resolvedBy: identity.actorId, resolvedAt } });
  }

  #admittedEvidence(events: Awaited<ReturnType<DurableControlPlaneStorePort["read"]>>, input: {
    workId: Identifier; attemptId: Identifier; evidenceId: Identifier;
  }): { found: boolean; provesResult: boolean } {
    let found = false; let provesResult = false;
    for (const event of events) {
      if (event.type === "connector.observation.recorded") {
        const payload = event.payload as { attemptId?: Identifier; observation?: WorkObservation };
        if (payload.attemptId !== input.attemptId || payload.observation?.workId !== input.workId) continue;
        if (payload.observation.evidenceRefs.includes(input.evidenceId)) found = true;
        if (payload.observation.resultReference === input.evidenceId) { found = true; provesResult = true; }
      }
      if (event.type === "evidence.persisted") {
        const record = (event.payload as { record?: EvidenceRecord }).record;
        if (record?.workId === input.workId && record.id === input.evidenceId && record.provenance === "PRODUCTION") {
          found = true; provesResult ||= record.kind === "RESULT";
        }
      }
    }
    return { found, provesResult };
  }
}
