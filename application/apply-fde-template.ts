import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";
import { validateFdeTemplate, type FdeTemplate } from "../core/fde-template.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { FdeTemplateTrustPort } from "../ports/fde-template-trust-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

export interface FdeConfigurationRevisions {
  readonly organization: number;
  readonly responsibility: number;
  readonly connectors: number;
  readonly governance: number;
}

export interface FdeApplicationPlan {
  readonly templateId: string;
  readonly templateVersion: string;
  readonly companyId: Identifier;
  readonly targetDigest: string;
  readonly previousRevisions: FdeConfigurationRevisions;
  readonly mutations: Readonly<Record<keyof FdeConfigurationRevisions, 1>>;
  readonly rollbackSupported: true;
}

const REASON_CODE = /^[A-Z][A-Z0-9_]{2,63}$/;

export class ApplyFdeTemplate {
  readonly #identity: IdentityPort;
  readonly #trust: FdeTemplateTrustPort;
  readonly #events: EventDataStorePort;
  readonly #now: () => string;
  readonly #nextId: () => Identifier;

  constructor(dependencies: {
    readonly identity: IdentityPort;
    readonly trust: FdeTemplateTrustPort;
    readonly events: EventDataStorePort;
    readonly now: () => string;
    readonly nextId: () => Identifier;
  }) {
    this.#identity = dependencies.identity;
    this.#trust = dependencies.trust;
    this.#events = dependencies.events;
    this.#now = dependencies.now;
    this.#nextId = dependencies.nextId;
  }

  async dryRun(
    input: FdeTemplate,
    previousRevisions: FdeConfigurationRevisions,
  ): Promise<FdeApplicationPlan> {
    const template = validateFdeTemplate(input);
    await this.#verifyTrust(template);
    return {
      templateId: template.id,
      templateVersion: template.version,
      companyId: template.organization.company.id,
      targetDigest: template.contentDigest,
      previousRevisions: structuredClone(previousRevisions),
      mutations: { organization: 1, responsibility: 1, connectors: 1, governance: 1 },
      rollbackSupported: true,
    };
  }

  async apply(
    input: FdeTemplate,
    options: {
      readonly expectedEventSequence: number;
      readonly previousRevisions: FdeConfigurationRevisions;
    },
  ): Promise<{ readonly applicationId: Identifier; readonly plan: FdeApplicationPlan }> {
    const template = validateFdeTemplate(input);
    const plan = await this.dryRun(template, options.previousRevisions);
    const identity = await this.#formalIdentity(plan.companyId);
    const receipt = await this.#identity.authorize({
      companyId: plan.companyId,
      action: "fde-template:apply",
      resourceId: template.id,
      reason: `Apply FDE template ${template.id}@${template.version}`,
    });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    const applicationId = this.#nextId();
    await this.#events.append({
      id: this.#nextId(),
      companyId: plan.companyId,
      type: "fde.template-applied",
      occurredAt: this.#now(),
      actorId: identity.actorId,
      payload: { applicationId, plan, template, authorizationReceiptId: receipt.id },
      provenance: "PRODUCTION",
    }, options.expectedEventSequence);
    return { applicationId, plan };
  }

  async rollback(
    companyId: Identifier,
    applicationId: Identifier,
    expectedEventSequence: number,
    reasonCode: string,
  ): Promise<void> {
    if (!REASON_CODE.test(reasonCode)) throw new Error("FDE_ROLLBACK_REASON_INVALID");
    const identity = await this.#formalIdentity(companyId);
    const events = await this.#events.read(companyId);
    const applied = events.find(({ type, payload }) =>
      type === "fde.template-applied" &&
      (payload as { applicationId?: Identifier }).applicationId === applicationId
    );
    if (!applied) throw new Error("FDE_APPLICATION_NOT_FOUND");
    if (events.some(({ type, payload }) =>
      type === "fde.template-rolled-back" &&
      (payload as { applicationId?: Identifier }).applicationId === applicationId
    )) throw new Error("FDE_APPLICATION_ALREADY_ROLLED_BACK");
    const receipt = await this.#identity.authorize({
      companyId,
      action: "fde-template:rollback",
      resourceId: applicationId,
      reason: reasonCode,
    });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    const event: CompanyDomainEvent = {
      id: this.#nextId(), companyId, type: "fde.template-rolled-back", occurredAt: this.#now(),
      actorId: identity.actorId,
      payload: { applicationId, applyEventId: applied.id, reasonCode, authorizationReceiptId: receipt.id },
      provenance: "PRODUCTION",
    };
    await this.#events.append(event, expectedEventSequence);
  }

  async #verifyTrust(template: FdeTemplate): Promise<void> {
    const decision = await this.#trust.verify(template);
    if (!decision.trusted) throw new Error(`FDE_TEMPLATE_UNTRUSTED:${decision.code}`);
    if (decision.verifiedDigest !== template.contentDigest ||
        decision.publisherId !== template.trust.publisherId) {
      throw new Error("FDE_TEMPLATE_TRUST_MISMATCH");
    }
  }

  async #formalIdentity(companyId: Identifier) {
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== companyId) throw new Error("TENANT_MISMATCH");
    return identity;
  }
}
