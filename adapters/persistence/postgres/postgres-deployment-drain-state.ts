import { asc, count, eq, inArray, max } from "drizzle-orm";
import type { CompanyDomainEvent } from "../../../core/control-plane.ts";
import type {
  DeploymentDrainCompanySource,
  DeploymentDrainStatePort,
} from "../../../ports/deployment-drain-state-port.ts";
import type { createCompanyDatabase } from "./company-database.ts";
import { companies, connectorOutbox, domainEvents } from "./company-access-schema.ts";

type CompanyDatabase = ReturnType<typeof createCompanyDatabase>["db"];

const DRAIN_EVENT_TYPES = [
  "work-attempt.recorded",
  "approval.publication.requested",
  "approval.publication.decided",
  "secret.lease-issued",
  "secret.lease-revoked",
] as const;

/** Captures only the durable metadata required by the deployment drain policy. */
export class PostgresDeploymentDrainState implements DeploymentDrainStatePort {
  readonly #database: CompanyDatabase;

  constructor(database: CompanyDatabase) { this.#database = database; }

  async capture(): Promise<readonly DeploymentDrainCompanySource[]> {
    const [companyRows, tailRows, eventRows, pendingRows] = await Promise.all([
      this.#database.select({ companyId: companies.id }).from(companies).orderBy(asc(companies.id)),
      this.#database.select({ companyId: domainEvents.companyId, eventSequence: max(domainEvents.sequence) })
        .from(domainEvents).groupBy(domainEvents.companyId),
      this.#database.select().from(domainEvents)
        .where(inArray(domainEvents.type, [...DRAIN_EVENT_TYPES]))
        .orderBy(asc(domainEvents.companyId), asc(domainEvents.sequence)),
      this.#database.select({ companyId: connectorOutbox.companyId, total: count() })
        .from(connectorOutbox).where(eq(connectorOutbox.status, "PENDING"))
        .groupBy(connectorOutbox.companyId),
    ]);
    const tails = new Map(tailRows.map(({ companyId, eventSequence }) =>
      [companyId, eventSequence ?? 0]));
    const pending = new Map(pendingRows.map(({ companyId, total }) => [companyId, total]));
    const events = new Map<string, CompanyDomainEvent[]>();
    for (const row of eventRows) {
      const companyEvents = events.get(row.companyId) ?? [];
      companyEvents.push({
        id: row.id, companyId: row.companyId, type: row.type, occurredAt: row.occurredAt,
        actorId: row.actorId, payload: structuredClone(row.payload),
        ...(row.correlationId ? { correlationId: row.correlationId } : {}),
        ...(row.causationId ? { causationId: row.causationId } : {}),
        provenance: row.provenance as CompanyDomainEvent["provenance"],
      });
      events.set(row.companyId, companyEvents);
    }
    return companyRows.map(({ companyId }) => ({
      companyId,
      eventSequence: tails.get(companyId) ?? 0,
      pendingPublicationCount: pending.get(companyId) ?? 0,
      events: events.get(companyId) ?? [],
    }));
  }
}
