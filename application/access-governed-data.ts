import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";
import { evaluateDataAccess, type DataPolicyDecision, type GovernedDataAccessRequest } from "../core/data-governance.ts";
import type { WorkItem } from "../core/work.ts";
import type { DataAccessResult, DataConnectorPort } from "../ports/data-connector-port.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { GovernanceCatalogPort } from "../ports/governance-catalog-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

const IDENTIFIER = /^[a-z0-9][a-z0-9-]{0,63}$/;
const POLICY_CODE = /^[A-Z][A-Z0-9_]{2,95}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

export interface GovernedDataAccessOutcome {
  readonly requestId: Identifier;
  readonly contractId: Identifier;
  readonly decision: DataPolicyDecision;
  readonly result: DataAccessResult | null;
  readonly recordedAt: string;
}

function recordedOutcome(event: CompanyDomainEvent, requestId: Identifier): GovernedDataAccessOutcome | null {
  if (event.type !== "data-access.result-recorded") return null;
  const value = (event.payload as { readonly outcome?: GovernedDataAccessOutcome }).outcome;
  return value?.requestId === requestId ? structuredClone(value) : null;
}

/** Authorizes one data-plane operation and emits only references, policy codes, and digests. */
export class AccessGovernedData {
  readonly #identity: IdentityPort;
  readonly #governance: GovernanceCatalogPort;
  readonly #events: EventDataStorePort;
  readonly #connectors: readonly DataConnectorPort[];
  readonly #now: () => string;
  readonly #nextId: () => Identifier;

  constructor(dependencies: {
    readonly identity: IdentityPort;
    readonly governance: GovernanceCatalogPort;
    readonly events: EventDataStorePort;
    readonly connectors: readonly DataConnectorPort[];
    readonly now: () => string;
    readonly nextId: () => Identifier;
  }) {
    this.#identity = dependencies.identity;
    this.#governance = dependencies.governance;
    this.#events = dependencies.events;
    this.#connectors = dependencies.connectors;
    this.#now = dependencies.now;
    this.#nextId = dependencies.nextId;
  }

  async execute(input: {
    readonly requestId: Identifier;
    readonly contractId: Identifier;
    readonly request: GovernedDataAccessRequest;
  }): Promise<GovernedDataAccessOutcome> {
    if (!IDENTIFIER.test(input.requestId) || !IDENTIFIER.test(input.contractId)) {
      throw new Error("DATA_ACCESS_COMMAND_INVALID");
    }
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== input.request.companyId) throw new Error("TENANT_MISMATCH");
    const events = await this.#events.read(input.request.companyId);
    const prior = events.map((event) => recordedOutcome(event, input.requestId)).find(Boolean);
    if (prior) return prior;

    const work = events.flatMap(({ type, payload }) => type === "work.dispatched"
      ? [(payload as { readonly work?: WorkItem }).work].filter((value): value is WorkItem => Boolean(value))
      : []).find(({ id }) => id === input.request.workId);
    if (!work || work.companyId !== input.request.companyId) throw new Error("WORK_NOT_FOUND");
    if (work.agentId !== input.request.agentId) throw new Error("DATA_ACCESS_AGENT_WORK_MISMATCH");

    const receipt = await this.#identity.authorize({
      companyId: input.request.companyId,
      action: `data:${input.request.operation.toLocaleLowerCase()}`,
      resourceId: input.request.workId,
      reason: `Evaluate governed data access ${input.contractId}`,
    });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    const catalog = await this.#governance.load(input.request.companyId);
    const contract = catalog.dataAuthorizationContracts.find(({ id }) => id === input.contractId);
    const decision: DataPolicyDecision = contract
      ? evaluateDataAccess(contract, input.request)
      : { type: "DENIED", policyCode: "CONTRACT_NOT_FOUND" };

    let result: DataAccessResult | null = null;
    if (decision.type === "GRANTED") {
      const matches: { readonly port: DataConnectorPort; readonly healthy: boolean }[] = [];
      for (const port of this.#connectors) {
        const capabilities = await port.capabilities();
        if (capabilities.dataSourceIds.includes(input.request.dataSourceId) &&
            capabilities.supportedOperations.includes(input.request.operation)) {
          matches.push({ port, healthy: await port.health() === "HEALTHY" });
        }
      }
      if (matches.length !== 1) throw new Error(matches.length ? "DATA_CONNECTOR_AMBIGUOUS" : "DATA_CONNECTOR_NOT_FOUND");
      if (!matches[0]?.healthy) throw new Error("DATA_CONNECTOR_UNAVAILABLE");
      result = await matches[0].port.access({
        ...structuredClone(input.request), requestId: input.requestId,
        authorizationContractId: input.contractId, authorizationReceiptId: receipt.id,
      });
      if (result.type === "GRANTED") {
        if (!IDENTIFIER.test(result.dataReference) || !IDENTIFIER.test(result.evidenceReference) ||
            !DIGEST.test(result.contentDigest) ||
            (input.request.operation === "EXPORT" && result.contentDigest !== input.request.contentDigest)) {
          throw new Error("DATA_CONNECTOR_RESULT_INVALID");
        }
      } else if (!POLICY_CODE.test(result.policyCode)) {
        throw new Error("DATA_CONNECTOR_RESULT_INVALID");
      }
    }

    const outcome: GovernedDataAccessOutcome = {
      requestId: input.requestId, contractId: input.contractId,
      decision, result: result ? structuredClone(result) : null, recordedAt: this.#now(),
    };
    await this.#events.append({
      id: this.#nextId(), companyId: input.request.companyId, type: "data-access.result-recorded",
      occurredAt: outcome.recordedAt, actorId: identity.actorId, correlationId: input.request.workId,
      payload: { outcome: structuredClone(outcome) }, provenance: "PRODUCTION",
    }, events.length);
    return structuredClone(outcome);
  }
}
