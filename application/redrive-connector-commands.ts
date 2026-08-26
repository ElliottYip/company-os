import type { Identifier } from "../core/control-plane.ts";
import type { ConnectorDeliveryOutcome } from "./deliver-connector-commands.ts";

export interface ConnectorRedriveResult {
  readonly companyId: Identifier;
  readonly status: "SCANNED" | "FAILED";
  readonly deliveries: readonly ConnectorDeliveryOutcome[];
  readonly code: string;
}

const STABLE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/;

function stableCode(error: unknown): string {
  return error instanceof Error && STABLE_CODE.test(error.message)
    ? error.message
    : "CONNECTOR_REDRIVE_FAILED";
}

/**
 * Enumerates durable company scopes and redrives pending execution work
 * independently so one tenant cannot stop another.
 */
export class RedriveConnectorCommands {
  readonly #listCompanyIds: () => Promise<readonly Identifier[]>;
  readonly #deliver: (companyId: Identifier) => Promise<readonly ConnectorDeliveryOutcome[]>;
  #running = false;

  constructor(dependencies: {
    readonly listCompanyIds: () => Promise<readonly Identifier[]>;
    readonly deliver: (companyId: Identifier) => Promise<readonly ConnectorDeliveryOutcome[]>;
  }) {
    this.#listCompanyIds = dependencies.listCompanyIds;
    this.#deliver = dependencies.deliver;
  }

  async tick(): Promise<readonly ConnectorRedriveResult[]> {
    if (this.#running) return [];
    this.#running = true;
    try {
      const companyIds = [...new Set(await this.#listCompanyIds())].sort();
      const results: ConnectorRedriveResult[] = [];
      for (const companyId of companyIds) {
        try {
          results.push({
            companyId,
            status: "SCANNED",
            deliveries: await this.#deliver(companyId),
            code: "CONNECTOR_REDRIVE_SCANNED",
          });
        } catch (error) {
          results.push({
            companyId,
            status: "FAILED",
            deliveries: [],
            code: stableCode(error),
          });
        }
      }
      return results;
    } finally {
      this.#running = false;
    }
  }
}
