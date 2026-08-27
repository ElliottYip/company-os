import type { Identifier } from "./control-plane.ts";

export type InstanceMaintenanceMode = "OPEN" | "DISPATCH_FROZEN" | "ACCEPTANCE_ONLY";

export interface InstanceAcceptanceBinding {
  readonly planId: Identifier;
  readonly planDigest: `sha256:${string}`;
  readonly work: readonly {
    readonly companyId: Identifier;
    readonly workId: Identifier;
  }[];
}

export interface InstanceMaintenanceState {
  readonly schemaVersion: 1;
  readonly mode: InstanceMaintenanceMode;
  readonly revision: number;
  readonly operationId: Identifier | null;
  readonly authorizationReference: string | null;
  /** Present only while a narrowly scoped staging acceptance window is active. */
  readonly acceptance?: InstanceAcceptanceBinding | null;
  readonly changedBy: Identifier | null;
  readonly changedAt: string | null;
}

export interface InstanceMaintenanceChange {
  readonly mode: InstanceMaintenanceMode;
  readonly operationId: Identifier;
  readonly authorizationReference: string;
  readonly acceptance?: InstanceAcceptanceBinding;
  readonly changedBy: Identifier;
  readonly changedAt: string;
}

const PORTABLE_ID = /^[a-z0-9][a-z0-9-]{2,95}$/;
const AUTHORIZATION_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,255}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const MODES: readonly InstanceMaintenanceMode[] = ["OPEN", "DISPATCH_FROZEN", "ACCEPTANCE_ONLY"];

export function openInstanceMaintenanceState(): InstanceMaintenanceState {
  return { schemaVersion: 1, mode: "OPEN", revision: 0, operationId: null,
    authorizationReference: null, acceptance: null, changedBy: null, changedAt: null };
}

export function validateInstanceAcceptanceBinding(
  binding: InstanceAcceptanceBinding | undefined,
): InstanceAcceptanceBinding {
  if (!binding || Object.keys(binding).some((key) => !["planId", "planDigest", "work"].includes(key)) ||
      !PORTABLE_ID.test(binding.planId) || !SHA256.test(binding.planDigest) ||
      binding.work.length < 1 || binding.work.length > 32) {
    throw new Error("INSTANCE_ACCEPTANCE_BINDING_INVALID");
  }
  const keys = new Set<string>();
  for (const item of binding.work) {
    if (Object.keys(item).some((key) => !["companyId", "workId"].includes(key)) ||
        !PORTABLE_ID.test(item.companyId) || !PORTABLE_ID.test(item.workId)) {
      throw new Error("INSTANCE_ACCEPTANCE_BINDING_INVALID");
    }
    const key = `${item.companyId}:${item.workId}`;
    if (keys.has(key)) throw new Error("INSTANCE_ACCEPTANCE_BINDING_INVALID");
    keys.add(key);
  }
  return structuredClone(binding);
}

export function changeInstanceMaintenance(
  current: InstanceMaintenanceState,
  input: InstanceMaintenanceChange,
): InstanceMaintenanceState {
  if (current.schemaVersion !== 1 || !Number.isSafeInteger(current.revision) || current.revision < 0 ||
      !MODES.includes(current.mode)) throw new Error("INSTANCE_MAINTENANCE_STATE_INVALID");
  if ((current.mode === "ACCEPTANCE_ONLY" && !current.acceptance) ||
      (current.mode !== "ACCEPTANCE_ONLY" && current.acceptance != null)) {
    throw new Error("INSTANCE_MAINTENANCE_STATE_INVALID");
  }
  if (current.mode === "ACCEPTANCE_ONLY") validateInstanceAcceptanceBinding(current.acceptance ?? undefined);
  if (!MODES.includes(input.mode)) throw new Error("INSTANCE_MAINTENANCE_MODE_INVALID");
  if (!PORTABLE_ID.test(input.operationId) || !PORTABLE_ID.test(input.changedBy)) {
    throw new Error("INSTANCE_MAINTENANCE_ID_INVALID");
  }
  if (!AUTHORIZATION_REFERENCE.test(input.authorizationReference)) {
    throw new Error("INSTANCE_MAINTENANCE_AUTHORIZATION_INVALID");
  }
  if (!Number.isFinite(Date.parse(input.changedAt))) throw new Error("INSTANCE_MAINTENANCE_TIME_INVALID");
  if (current.mode === input.mode) throw new Error("INSTANCE_MAINTENANCE_MODE_UNCHANGED");
  const transition = `${current.mode}->${input.mode}`;
  if (!["OPEN->DISPATCH_FROZEN", "DISPATCH_FROZEN->ACCEPTANCE_ONLY",
    "ACCEPTANCE_ONLY->OPEN", "ACCEPTANCE_ONLY->DISPATCH_FROZEN"].includes(transition)) {
    throw new Error("INSTANCE_MAINTENANCE_TRANSITION_INVALID");
  }
  if (current.operationId !== null && current.operationId !== input.operationId) {
    throw new Error("INSTANCE_MAINTENANCE_OPERATION_MISMATCH");
  }
  if (current.authorizationReference === input.authorizationReference) {
    throw new Error("INSTANCE_MAINTENANCE_AUTHORIZATION_REUSED");
  }
  const acceptance = input.mode === "ACCEPTANCE_ONLY"
    ? validateInstanceAcceptanceBinding(input.acceptance)
    : null;
  if (input.mode !== "ACCEPTANCE_ONLY" && input.acceptance !== undefined) {
    throw new Error("INSTANCE_ACCEPTANCE_BINDING_FORBIDDEN");
  }
  return { schemaVersion: 1, mode: input.mode, revision: current.revision + 1,
    operationId: input.operationId, authorizationReference: input.authorizationReference,
    acceptance, changedBy: input.changedBy, changedAt: input.changedAt };
}
