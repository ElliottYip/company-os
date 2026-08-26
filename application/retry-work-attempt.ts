import { evaluateCompanyAgentEligibility } from "../core/agent-lifecycle.ts";
import type { Identifier } from "../core/control-plane.ts";
import type { WorkItem } from "../core/work.ts";
import type { ModelExecutionAuthority, ModelRoutingIntent } from "../core/model-governance.ts";
import type { AgentLifecyclePort } from "../ports/agent-lifecycle-port.ts";
import type { AgentExecutionPort } from "../ports/agent-execution-port.ts";
import type { CompanyStructurePort } from "../ports/company-structure-port.ts";
import type { ConnectorRuntimeSecurityPort } from "../ports/connector-runtime-security-port.ts";
import type { DurableControlPlaneStorePort } from "../ports/durable-control-plane-store-port.ts";
import type { GovernanceCatalogPort } from "../ports/governance-catalog-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { ResponsibilityContractPort } from "../ports/responsibility-contract-port.ts";
import { WorkAttemptService } from "./work-attempt-service.ts";
import type { PreparedWorkExecution, WorkExecutionPreparationPlan } from "./prepare-work-execution.ts";

interface Dependencies {
  identity: IdentityPort; store: DurableControlPlaneStorePort; structure: CompanyStructurePort;
  lifecycle: AgentLifecyclePort; responsibilities: ResponsibilityContractPort;
  governance: GovernanceCatalogPort; executionPorts: readonly AgentExecutionPort[];
  runtimeSecurity: ConnectorRuntimeSecurityPort;
  modelResolver?: { execute(intent: ModelRoutingIntent): Promise<ModelExecutionAuthority> };
  preparation?: { execute(input: { readonly work: WorkItem; readonly attempt: import("../core/work-attempt.ts").WorkAttempt;
    readonly plan: WorkExecutionPreparationPlan }): Promise<PreparedWorkExecution> };
  deliver: { execute(companyId: Identifier): Promise<readonly unknown[]> };
  now: () => string; nextId: () => Identifier;
}

/** Creates a new Attempt only after revalidating every mutable execution boundary. */
export class RetryWorkAttempt {
  readonly #attempts: WorkAttemptService;
  readonly #dependencies: Dependencies;
  constructor(dependencies: Dependencies) { this.#dependencies = dependencies; this.#attempts = new WorkAttemptService(dependencies.store); }

  async execute(input: { companyId: Identifier; workId: Identifier; attemptId: Identifier }) {
    const identity = await this.#dependencies.identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== input.companyId) throw new Error("TENANT_MISMATCH");
    const previous = await this.#attempts.load(input.companyId, input.attemptId);
    if (!previous || previous.workId !== input.workId) throw new Error("WORK_ATTEMPT_NOT_FOUND");
    const retryNumber = previous.attemptNumber + 1;
    const idempotencyKey = `${input.companyId}:${input.workId}:attempt:${retryNumber}`;
    const latest = await this.#attempts.latestForWork(input.companyId, input.workId);
    if (latest?.id !== previous.id) {
      if (latest?.attemptNumber === retryNumber && latest.idempotencyKey === idempotencyKey) return latest;
      throw new Error("WORK_RETRY_ALREADY_SUPERSEDED");
    }
    if (previous.status !== "FAILED" || previous.reconciliation?.resolution !== "SAFE_TO_RETRY") {
      throw new Error("WORK_RETRY_NOT_ADMITTED");
    }
    const [structure, lifecycle, responsibilities, governance, events] = await Promise.all([
      this.#dependencies.structure.load(input.companyId), this.#dependencies.lifecycle.load(input.companyId),
      this.#dependencies.responsibilities.load(input.companyId), this.#dependencies.governance.load(input.companyId),
      this.#dependencies.store.read(input.companyId),
    ]);
    if (!structure) throw new Error("ORGANIZATION_NOT_FOUND");
    const work = events.flatMap(({ type, payload }) => type === "work.dispatched"
      ? [(payload as { work?: WorkItem }).work].filter((value): value is WorkItem => value?.id === input.workId)
      : []).at(-1);
    if (!work) throw new Error("WORK_NOT_FOUND");
    const preparationPlan = events.flatMap(({ type, payload, provenance }) => {
      if (type !== "work-execution.preparation-requested" || provenance !== "PRODUCTION") return [];
      const candidate = payload as { readonly workId?: Identifier; readonly plan?: WorkExecutionPreparationPlan };
      return candidate.workId === input.workId && candidate.plan ? [candidate.plan] : [];
    }).at(-1) ?? null;
    const eligibility = evaluateCompanyAgentEligibility(structure, lifecycle).find(({ id }) => id === work.agentId)?.eligibility;
    if (!eligibility?.invokable) throw new Error(`AGENT_NOT_INVOKABLE:${eligibility?.invokabilityReason ?? "unknown_status"}`);
    const contract = responsibilities.contracts.find(({ id }) => id === work.responsibilityContractId);
    if (!contract || contract.status !== "ACTIVE" || contract.accountableHumanId !== work.accountableHumanId ||
        contract.agentId !== work.agentId || work.actionIds.some((action) => !contract.allowedActions.includes(action))) {
      throw new Error("WORK_RETRY_RESPONSIBILITY_CHANGED");
    }
    const now = this.#dependencies.now();
    for (const contractId of previous.authority.dataAuthorizationIds) {
      const data = governance.dataAuthorizationContracts.find(({ id }) => id === contractId);
      if (!data || data.status !== "ACTIVE" || !data.authorizedAgentIds.includes(work.agentId) ||
          Date.parse(now) < Date.parse(data.validFrom) || Date.parse(now) >= Date.parse(data.validUntil)) {
        throw new Error("WORK_RETRY_DATA_AUTHORIZATION_INVALID");
      }
    }
    const previousModel = previous.authority.model ?? null;
    let modelAuthority: ModelExecutionAuthority | null = null;
    if (previousModel) {
      if (!this.#dependencies.modelResolver) throw new Error("MODEL_ROUTING_UNAVAILABLE");
      modelAuthority = await this.#dependencies.modelResolver.execute({
        companyId: input.companyId,
        policyId: previousModel.policyId,
        classification: previousModel.classification,
        requiredResidency: previousModel.residency,
      });
    }
    const receipt = await this.#dependencies.identity.authorize({ companyId: input.companyId,
      action: "work:retry", resourceId: input.workId,
      reason: "Retry one reconciled Work with fresh execution authority" });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    const contexts = await Promise.all(this.#dependencies.executionPorts.map(async (port) => ({ port,
      capabilities: await port.capabilities(), health: await port.health() })));
    const context = contexts.find(({ capabilities }) => capabilities.connectorId === work.runtimeConnectorId);
    if (!context) throw new Error("AGENT_EXECUTION_PORT_NOT_REGISTERED");
    if (context.health === "UNAVAILABLE") throw new Error("AGENT_EXECUTION_PORT_UNAVAILABLE");
    const timeoutAt = new Date(Date.parse(now) + context.capabilities.maximumTimeoutSeconds * 1_000).toISOString();
    const attempt = await this.#attempts.create({ draft: { id: this.#dependencies.nextId(), companyId: input.companyId,
      workId: input.workId, agentId: work.agentId, attemptNumber: retryNumber, idempotencyKey, createdAt: now, timeoutAt,
      authority: { responsibilityContractId: contract.id, responsibilityContractRevision: responsibilities.revision,
        accountableHumanId: contract.accountableHumanId, actionIds: work.actionIds, permissionIds: [receipt.id],
        dataAuthorizationIds: previous.authority.dataAuthorizationIds, connectorId: work.runtimeConnectorId,
        connectorCapabilityDigest: await this.#dependencies.runtimeSecurity.digestCapabilities(context.capabilities),
        model: modelAuthority } },
      eventId: this.#dependencies.nextId(), publicationId: this.#dependencies.nextId(), actorId: identity.actorId,
      expectedEventSequence: (await this.#dependencies.store.read(input.companyId)).length });
    if (preparationPlan) {
      if (!this.#dependencies.preparation) throw new Error("WORK_EXECUTION_PREPARATION_UNAVAILABLE");
      await this.#dependencies.preparation.execute({ work, attempt, plan: preparationPlan });
    }
    await this.#dependencies.deliver.execute(input.companyId);
    return attempt;
  }
}
