import type { Identifier } from "../core/control-plane.ts";
import type { ConnectorRegistration } from "../core/connector.ts";

export interface ConnectorCatalogSnapshot {
  readonly revision: number;
  readonly connectors: readonly ConnectorRegistration[];
}

export interface ReplaceConnectorCatalogCommand {
  readonly companyId: Identifier;
  readonly actorId: Identifier;
  readonly expectedRevision: number;
  readonly recordedAt: string;
  readonly connectors: readonly ConnectorRegistration[];
}

export interface ConnectorCatalogPort {
  load(companyId: Identifier): Promise<ConnectorCatalogSnapshot>;
  replace(command: ReplaceConnectorCatalogCommand): Promise<ConnectorCatalogSnapshot>;
}
