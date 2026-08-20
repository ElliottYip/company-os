import { validateFdeTemplate, type FdeTemplate } from "../../core/fde-template.ts";
import type { Identifier } from "../../core/control-plane.ts";
import type {
  CompanyConfigurationProjection,
  CompanyConfigurationProjectionPort,
} from "../../ports/company-configuration-projection-port.ts";
import type { EventDataStorePort } from "../../ports/event-data-store-port.ts";

interface AppliedPayload {
  readonly applicationId: Identifier;
  readonly template: FdeTemplate;
  readonly plan: {
    readonly templateId: string;
    readonly templateVersion: string;
    readonly companyId: Identifier;
    readonly previousRevisions: CompanyConfigurationProjection["revisions"];
  };
}

function project(payload: AppliedPayload): CompanyConfigurationProjection {
  const template = validateFdeTemplate(payload.template);
  if (payload.plan.companyId !== template.organization.company.id ||
      payload.plan.templateId !== template.id || payload.plan.templateVersion !== template.version) {
    throw new Error("FDE_CONFIGURATION_PROJECTION_CORRUPT");
  }
  const revisions = {
    organization: payload.plan.previousRevisions.organization + 1,
    responsibility: payload.plan.previousRevisions.responsibility + 1,
    connectors: payload.plan.previousRevisions.connectors + 1,
    governance: payload.plan.previousRevisions.governance + 1,
  };
  return {
    applicationId: payload.applicationId,
    templateId: template.id,
    templateVersion: template.version,
    organization: structuredClone(template.organization),
    responsibility: { revision: revisions.responsibility, contracts: structuredClone(template.responsibilityContracts) },
    connectors: { revision: revisions.connectors, connectors: structuredClone(template.connectors) },
    governance: { revision: revisions.governance, ...structuredClone(template.governance) },
    revisions,
  };
}

/** Rebuilds all four Company OS configuration catalogs from the append-only FDE ledger. */
export class EventBackedCompanyConfigurationProjection implements CompanyConfigurationProjectionPort {
  readonly #events: EventDataStorePort;

  constructor(events: EventDataStorePort) {
    this.#events = events;
  }

  async load(companyId: Identifier): Promise<CompanyConfigurationProjection | null> {
    const events = await this.#events.read(companyId, {
      types: ["fde.template-applied", "fde.template-rolled-back"],
    });
    const applied: { readonly id: Identifier; readonly payload: AppliedPayload }[] = [];
    const rolledBack = new Set<Identifier>();
    for (const event of events) {
      if (event.type === "fde.template-rolled-back") {
        const applicationId = (event.payload as { readonly applicationId?: unknown }).applicationId;
        if (typeof applicationId !== "string") throw new Error("FDE_CONFIGURATION_PROJECTION_CORRUPT");
        rolledBack.add(applicationId);
        continue;
      }
      const payload = event.payload as Partial<AppliedPayload>;
      if (typeof payload.applicationId !== "string" || !payload.template || !payload.plan) {
        throw new Error("FDE_CONFIGURATION_PROJECTION_CORRUPT");
      }
      applied.push({ id: event.id, payload: payload as AppliedPayload });
    }
    const active = applied.filter(({ payload }) => !rolledBack.has(payload.applicationId)).at(-1);
    return active ? project(active.payload) : null;
  }
}
