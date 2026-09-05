import type { IdentityPort } from "../ports/identity-port.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { Identifier } from "../core/control-plane.ts";
import type { CompanyDomainEvent } from "../core/control-plane.ts";
import type {
  AccessMapEdge,
  AiCase,
  PolicyViolation,
  RiskAlert,
  RuntimeTrace,
} from "../core/operational-risk.ts";

export interface OperationalRiskProjection {
  readonly schemaVersion: 1;
  readonly companyId: Identifier;
  readonly traces: readonly RuntimeTrace[];
  readonly accessEdges: readonly AccessMapEdge[];
  readonly violations: readonly PolicyViolation[];
  readonly alerts: readonly RiskAlert[];
  readonly cases: readonly AiCase[];
  readonly generatedAt: string;
}

function assertTenant(records: readonly { readonly companyId: Identifier }[], companyId: Identifier): void {
  if (records.some((record) => record.companyId !== companyId)) throw new Error("OPERATIONAL_RISK_PROJECTION_CORRUPT");
}

export function projectOperationalRiskEvents(events: readonly CompanyDomainEvent[], companyId: Identifier,
  generatedAt: string): OperationalRiskProjection {
  const traces = new Map<Identifier, RuntimeTrace>();
  const edges = new Map<Identifier, AccessMapEdge>();
  const violations = new Map<Identifier, PolicyViolation>();
  const alerts = new Map<Identifier, RiskAlert>();
  const cases = new Map<Identifier, AiCase>();
  for (const event of events) {
    if (event.type === "operational-risk.assessed") {
      const payload = event.payload as { trace?: RuntimeTrace; accessEdges?: AccessMapEdge[];
        violations?: PolicyViolation[]; alerts?: RiskAlert[]; cases?: AiCase[] };
      if (!payload.trace || !Array.isArray(payload.accessEdges) || !Array.isArray(payload.violations) ||
          !Array.isArray(payload.alerts) || !Array.isArray(payload.cases)) {
        throw new Error("OPERATIONAL_RISK_PROJECTION_CORRUPT");
      }
      assertTenant([payload.trace, ...payload.accessEdges, ...payload.violations, ...payload.alerts, ...payload.cases], companyId);
      traces.set(payload.trace.id, structuredClone(payload.trace));
      payload.accessEdges.forEach((record) => edges.set(record.id, structuredClone(record)));
      payload.violations.forEach((record) => violations.set(record.id, structuredClone(record)));
      payload.alerts.forEach((record) => alerts.set(record.id, structuredClone(record)));
      payload.cases.forEach((record) => cases.set(record.id, structuredClone(record)));
    } else if (event.type === "risk-containment.delivered") {
      const caseId = (event.payload as { caseId?: Identifier }).caseId;
      const record = caseId ? cases.get(caseId) : null;
      if (!record) throw new Error("OPERATIONAL_RISK_PROJECTION_CORRUPT");
      cases.set(record.id, { ...record, status: record.status === "OPEN" ? "CONTAINED" : record.status,
        containment: "PAUSE_SUCCEEDED", revision: record.revision + 1, updatedAt: event.occurredAt });
      for (const alertId of record.alertIds) {
        const alert = alerts.get(alertId);
        if (alert) alerts.set(alertId, { ...alert, status: "CONTAINED", containment: "PAUSE_SUCCEEDED" });
      }
    } else if (event.type === "risk-recovery.delivered") {
      const caseId = (event.payload as { caseId?: Identifier }).caseId;
      const record = caseId ? cases.get(caseId) : null;
      if (!record || record.status !== "RECOVERY_REQUESTED") throw new Error("OPERATIONAL_RISK_PROJECTION_CORRUPT");
      cases.set(record.id, { ...record, status: "RECOVERED", revision: record.revision + 1,
        updatedAt: event.occurredAt });
      for (const alertId of record.alertIds) {
        const alert = alerts.get(alertId);
        if (alert) alerts.set(alertId, { ...alert, status: "RESOLVED", resolvedAt: event.occurredAt });
      }
    } else if (event.type === "ai-case.revised") {
      const record = (event.payload as { case?: AiCase }).case;
      if (!record || record.companyId !== companyId) throw new Error("OPERATIONAL_RISK_PROJECTION_CORRUPT");
      cases.set(record.id, structuredClone(record));
    } else if (event.type === "risk-alert.revised") {
      const record = (event.payload as { alert?: RiskAlert }).alert;
      if (!record || record.companyId !== companyId) throw new Error("OPERATIONAL_RISK_PROJECTION_CORRUPT");
      alerts.set(record.id, structuredClone(record));
    }
  }
  return { schemaVersion: 1, companyId, traces: [...traces.values()], accessEdges: [...edges.values()],
    violations: [...violations.values()], alerts: [...alerts.values()], cases: [...cases.values()], generatedAt };
}

/** Replays the complete risk chain without exposing raw runtime payloads. */
export class GetOperationalRiskProjection {
  readonly #identity: IdentityPort;
  readonly #events: EventDataStorePort;

  constructor(dependencies: { readonly identity: IdentityPort; readonly events: EventDataStorePort }) {
    this.#identity = dependencies.identity;
    this.#events = dependencies.events;
  }

  async execute(companyId: Identifier): Promise<OperationalRiskProjection> {
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== companyId) throw new Error("TENANT_MISMATCH");
    const receipt = await this.#identity.authorize({ companyId, action: "operational-risk:read",
      resourceId: companyId, reason: "Read runtime traces, Access Map, alerts, and AI Cases" });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    const events = await this.#events.read(companyId, { types: [
      "operational-risk.assessed", "risk-containment.delivered", "risk-recovery.delivered",
      "ai-case.revised", "risk-alert.revised",
    ] });
    return projectOperationalRiskEvents(events, companyId, receipt.authorizedAt);
  }
}
