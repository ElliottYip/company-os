import { and, eq, sql } from "drizzle-orm";
import { openInstanceMaintenanceState, type InstanceMaintenanceState } from "../../../core/instance-maintenance.ts";
import type { InstanceMaintenancePort } from "../../../ports/instance-maintenance-port.ts";
import type { createCompanyDatabase } from "./company-database.ts";
import { instanceMaintenance, instanceMaintenanceEvents, instanceUserRoles } from "./company-access-schema.ts";

type CompanyDatabase = ReturnType<typeof createCompanyDatabase>["db"];
const SINGLETON_ID = "instance";

export class PostgresInstanceMaintenanceStore implements InstanceMaintenancePort {
  readonly #database: CompanyDatabase;
  constructor(database: CompanyDatabase) { this.#database = database; }

  async load(): Promise<InstanceMaintenanceState> {
    const row = await this.#database.select().from(instanceMaintenance)
      .where(eq(instanceMaintenance.id, SINGLETON_ID)).then((rows) => rows[0] ?? null);
    return row ? state(row) : openInstanceMaintenanceState();
  }

  async replace(input: Parameters<InstanceMaintenancePort["replace"]>[0]): Promise<InstanceMaintenanceState> {
    return this.#database.transaction(async (transaction) => {
      await transaction.execute(sql`lock table ${instanceMaintenance} in share row exclusive mode`);
      const current = await transaction.select().from(instanceMaintenance)
        .where(eq(instanceMaintenance.id, SINGLETON_ID)).then((rows) => rows[0] ?? null);
      const revision = current?.revision ?? 0;
      if (revision !== input.expectedRevision || input.state.revision !== revision + 1 ||
          input.state.operationId === null || input.state.authorizationReference === null ||
          input.state.changedBy === null || input.state.changedAt === null) {
        throw new Error("INSTANCE_MAINTENANCE_REVISION_CONFLICT");
      }
      const admin = await transaction.select({ id: instanceUserRoles.id }).from(instanceUserRoles)
        .where(and(eq(instanceUserRoles.userId, input.state.changedBy),
          eq(instanceUserRoles.role, "instance_admin"))).then((rows) => rows[0] ?? null);
      if (!admin) throw new Error("INSTANCE_ADMIN_REQUIRED");
      const values = { id: SINGLETON_ID, mode: input.state.mode, revision: input.state.revision,
        operationId: input.state.operationId, authorizationReference: input.state.authorizationReference,
        changedByUserId: input.state.changedBy, changedAt: input.state.changedAt };
      if (current) await transaction.update(instanceMaintenance).set(values)
        .where(eq(instanceMaintenance.id, SINGLETON_ID));
      else await transaction.insert(instanceMaintenance).values(values);
      await transaction.insert(instanceMaintenanceEvents).values({ id: input.eventId,
        revision: values.revision, mode: values.mode, operationId: values.operationId,
        authorizationReference: values.authorizationReference,
        changedByUserId: values.changedByUserId, changedAt: values.changedAt });
      return structuredClone(input.state);
    });
  }
}

function state(row: typeof instanceMaintenance.$inferSelect): InstanceMaintenanceState {
  if (!["OPEN", "DISPATCH_FROZEN"].includes(row.mode) || !Number.isSafeInteger(row.revision) || row.revision < 1) {
    throw new Error("INSTANCE_MAINTENANCE_STATE_INVALID");
  }
  return { schemaVersion: 1, mode: row.mode as InstanceMaintenanceState["mode"],
    revision: row.revision, operationId: row.operationId,
    authorizationReference: row.authorizationReference, changedBy: row.changedByUserId,
    changedAt: row.changedAt };
}
