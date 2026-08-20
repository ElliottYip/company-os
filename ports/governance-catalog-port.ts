import type { Identifier } from "../core/control-plane.ts";
import type { GovernanceCatalog } from "../core/governance-catalog.ts";

export interface GovernanceCatalogSnapshot extends GovernanceCatalog {
  readonly revision: number;
}

export interface ReplaceGovernanceCatalogCommand extends GovernanceCatalog {
  readonly actorId: Identifier;
  readonly expectedRevision: number;
  readonly recordedAt: string;
}

export interface GovernanceCatalogPort {
  load(companyId: Identifier): Promise<GovernanceCatalogSnapshot>;
  replace(command: ReplaceGovernanceCatalogCommand): Promise<GovernanceCatalogSnapshot>;
}
