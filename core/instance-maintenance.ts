import type { Identifier } from "./control-plane.ts";

export type InstanceMaintenanceMode = "OPEN" | "DISPATCH_FROZEN";

export interface InstanceMaintenanceState {
  readonly schemaVersion: 1;
  readonly mode: InstanceMaintenanceMode;
  readonly revision: number;
  readonly operationId: Identifier | null;
  readonly authorizationReference: string | null;
  readonly changedBy: Identifier | null;
  readonly changedAt: string | null;
}

export interface InstanceMaintenanceChange {
  readonly mode: InstanceMaintenanceMode;
  readonly operationId: Identifier;
  readonly authorizationReference: string;
  readonly changedBy: Identifier;
  readonly changedAt: string;
}

const PORTABLE_ID = /^[a-z0-9][a-z0-9-]{2,95}$/;
const AUTHORIZATION_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,255}$/;

export function openInstanceMaintenanceState(): InstanceMaintenanceState {
  return { schemaVersion: 1, mode: "OPEN", revision: 0, operationId: null,
    authorizationReference: null, changedBy: null, changedAt: null };
}

export function changeInstanceMaintenance(
  current: InstanceMaintenanceState,
  input: InstanceMaintenanceChange,
): InstanceMaintenanceState {
  if (current.schemaVersion !== 1 || !Number.isSafeInteger(current.revision) || current.revision < 0 ||
      !["OPEN", "DISPATCH_FROZEN"].includes(current.mode)) throw new Error("INSTANCE_MAINTENANCE_STATE_INVALID");
  if (!["OPEN", "DISPATCH_FROZEN"].includes(input.mode)) throw new Error("INSTANCE_MAINTENANCE_MODE_INVALID");
  if (!PORTABLE_ID.test(input.operationId) || !PORTABLE_ID.test(input.changedBy)) {
    throw new Error("INSTANCE_MAINTENANCE_ID_INVALID");
  }
  if (!AUTHORIZATION_REFERENCE.test(input.authorizationReference)) {
    throw new Error("INSTANCE_MAINTENANCE_AUTHORIZATION_INVALID");
  }
  if (!Number.isFinite(Date.parse(input.changedAt))) throw new Error("INSTANCE_MAINTENANCE_TIME_INVALID");
  if (current.mode === input.mode) throw new Error("INSTANCE_MAINTENANCE_MODE_UNCHANGED");
  return { schemaVersion: 1, mode: input.mode, revision: current.revision + 1,
    operationId: input.operationId, authorizationReference: input.authorizationReference,
    changedBy: input.changedBy, changedAt: input.changedAt };
}
