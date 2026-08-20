import {
  evaluateDataAccess,
  type DataPolicyDecision,
  type GovernedDataAccessRequest,
} from "../core/data-governance.ts";
import type { Identifier } from "../core/control-plane.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { GovernanceCatalogPort } from "../ports/governance-catalog-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

export interface DataEgressDecisionRecord {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly contractId: Identifier;
  readonly request: GovernedDataAccessRequest;
  readonly decision: DataPolicyDecision;
  readonly authorizationReceiptId: Identifier;
  readonly recordedAt: string;
}

export class EvaluateDataEgress {
  readonly #identity: IdentityPort;
  readonly #governance: GovernanceCatalogPort;
  readonly #events: EventDataStorePort;
  readonly #now: () => string;
  readonly #nextId: () => Identifier;

  constructor(dependencies: {
    readonly identity: IdentityPort;
    readonly governance: GovernanceCatalogPort;
    readonly events: EventDataStorePort;
    readonly now: () => string;
    readonly nextId: () => Identifier;
  }) {
    this.#identity = dependencies.identity;
    this.#governance = dependencies.governance;
    this.#events = dependencies.events;
    this.#now = dependencies.now;
    this.#nextId = dependencies.nextId;
  }

  async execute(input: {
    readonly contractId: Identifier;
    readonly request: GovernedDataAccessRequest;
  }): Promise<DataEgressDecisionRecord> {
    if (input.request.operation !== "EXPORT") throw new Error("DATA_EGRESS_OPERATION_REQUIRED");
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== input.request.companyId) throw new Error("TENANT_MISMATCH");
    const receipt = await this.#identity.authorize({
      companyId: input.request.companyId,
      action: "data-egress:evaluate",
      resourceId: input.request.workId,
      reason: `Evaluate governed export ${input.contractId}`,
    });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    const catalog = await this.#governance.load(input.request.companyId);
    const contract = catalog.dataAuthorizationContracts.find(({ id }) => id === input.contractId);
    const decision: DataPolicyDecision = contract
      ? evaluateDataAccess(contract, input.request)
      : { type: "DENIED", policyCode: "CONTRACT_NOT_FOUND" };
    const record: DataEgressDecisionRecord = {
      id: this.#nextId(),
      companyId: input.request.companyId,
      contractId: input.contractId,
      request: structuredClone(input.request),
      decision,
      authorizationReceiptId: receipt.id,
      recordedAt: this.#now(),
    };
    const events = await this.#events.read(record.companyId);
    await this.#events.append({
      id: this.#nextId(),
      companyId: record.companyId,
      type: "data-egress.decision-recorded",
      occurredAt: record.recordedAt,
      actorId: identity.actorId,
      correlationId: record.request.workId,
      payload: structuredClone(record),
      provenance: "PRODUCTION",
    }, events.length);
    return structuredClone(record);
  }
}
