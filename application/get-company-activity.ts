import type { CompanyDomainEvent, Identifier, WorkObservation } from "../core/control-plane.ts";
import type { WorkItem } from "../core/work.ts";
import type { WorkAttempt } from "../core/work-attempt.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

export interface CompanyActivityItem {
  readonly sequence: number;
  readonly id: Identifier;
  readonly type: string;
  readonly occurredAt: string;
  readonly actorId: Identifier;
  readonly summary: string;
  readonly correlationId: Identifier | null;
}

export interface CompanyActivityPage {
  readonly schemaVersion: 1;
  readonly items: readonly CompanyActivityItem[];
  readonly nextSequence: number | null;
}

function stableSummary(event: CompanyDomainEvent): string {
  if (event.type === "work.dispatched") {
    const work = (event.payload as { readonly work?: WorkItem }).work;
    if (work?.title) return work.title;
  }
  if (event.type === "work-attempt.recorded") {
    const attempt = (event.payload as { readonly attempt?: WorkAttempt }).attempt;
    if (attempt) return `Attempt ${attempt.attemptNumber}: ${attempt.status}`;
  }
  if (event.type === "connector.observation.recorded") {
    const observation = (event.payload as { readonly observation?: WorkObservation }).observation;
    if (observation?.summary) return observation.summary;
  }
  if (event.type === "approval.decided") {
    const decision = (event.payload as { readonly decision?: unknown }).decision;
    if (decision === "APPROVED" || decision === "REJECTED") {
      return `Approval ${decision.toLocaleLowerCase()}`;
    }
  }
  return event.type.split(/[.-]/g).filter(Boolean).join(" ");
}

/** Company-wide, tenant-authorized activity projection that never returns raw event payloads. */
export class GetCompanyActivity {
  readonly #identity: IdentityPort;
  readonly #events: EventDataStorePort;

  constructor(dependencies: { readonly identity: IdentityPort; readonly events: EventDataStorePort }) {
    this.#identity = dependencies.identity;
    this.#events = dependencies.events;
  }

  async execute(input: {
    readonly companyId: Identifier;
    readonly afterSequence: number;
    readonly limit: number;
  }): Promise<CompanyActivityPage> {
    if (!Number.isSafeInteger(input.afterSequence) || input.afterSequence < 0 ||
        !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) {
      throw new Error("COMPANY_ACTIVITY_PAGE_INVALID");
    }
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== input.companyId) throw new Error("TENANT_MISMATCH");
    const receipt = await this.#identity.authorize({
      companyId: input.companyId,
      action: "activity:read",
      resourceId: input.companyId,
      reason: "Read the sanitized company activity projection",
    });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");

    const events = await this.#events.read(input.companyId, { afterSequence: input.afterSequence });
    const selected = events.slice(0, input.limit);
    const items = selected.map((event, index): CompanyActivityItem => ({
      sequence: input.afterSequence + index + 1,
      id: event.id,
      type: event.type,
      occurredAt: event.occurredAt,
      actorId: event.actorId,
      summary: stableSummary(event),
      correlationId: event.correlationId ?? null,
    }));
    return {
      schemaVersion: 1,
      items,
      nextSequence: events.length > selected.length ? items.at(-1)?.sequence ?? null : null,
    };
  }
}
