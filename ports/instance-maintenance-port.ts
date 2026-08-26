import type { Identifier } from "../core/control-plane.ts";
import type { InstanceMaintenanceState } from "../core/instance-maintenance.ts";

export interface InstanceMaintenancePort {
  load(): Promise<InstanceMaintenanceState>;
  replace(input: {
    readonly expectedRevision: number;
    readonly state: InstanceMaintenanceState;
    readonly eventId: Identifier;
  }): Promise<InstanceMaintenanceState>;
}
