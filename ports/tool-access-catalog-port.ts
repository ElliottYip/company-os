import type { Identifier } from "../core/control-plane.ts";
import type { ToolAccessCatalog } from "../core/tool-access.ts";

export interface ToolAccessCatalogPort {
  load(companyId: Identifier): Promise<ToolAccessCatalog>;
  replace(catalog: ToolAccessCatalog, expectedRevision: number, actorId: Identifier, occurredAt: string): Promise<ToolAccessCatalog>;
}
