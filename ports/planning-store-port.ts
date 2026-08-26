import type { Identifier } from "../core/control-plane.ts";
import type { PlanningCatalog } from "../core/planning.ts";

export interface PlanningStorePort {
  load(companyId: Identifier): Promise<PlanningCatalog>;
  replace(catalog: PlanningCatalog, expectedRevision: number, actorId: Identifier, occurredAt: string): Promise<PlanningCatalog>;
}
