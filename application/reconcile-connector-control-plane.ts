import type { ConnectorDeliveryOutcome } from "./deliver-connector-commands.ts";

/**
 * Runs one durable Connector recovery cycle.
 *
 * Commands already committed to the outbox are delivered before observations
 * are collected. This prevents a transient observation failure after a
 * process restart from blocking an already-authorized PAUSE, RESUME, or CANCEL.
 */
export class ReconcileConnectorControlPlane {
  readonly #dependencies: {
    readonly recoverExpired: () => Promise<void>;
    readonly deliver: () => Promise<readonly ConnectorDeliveryOutcome[]>;
    readonly collectObservations: () => Promise<void>;
    readonly revokeSecretLeases?: () => Promise<void>;
  };

  constructor(dependencies: {
    readonly recoverExpired: () => Promise<void>;
    readonly deliver: () => Promise<readonly ConnectorDeliveryOutcome[]>;
    readonly collectObservations: () => Promise<void>;
    readonly revokeSecretLeases?: () => Promise<void>;
  }) {
    this.#dependencies = dependencies;
  }

  async execute(): Promise<readonly ConnectorDeliveryOutcome[]> {
    await this.#dependencies.recoverExpired();
    const pending = await this.#dependencies.deliver();
    await this.#dependencies.collectObservations();
    const observed = await this.#dependencies.deliver();
    const deliveries = [...pending, ...observed];
    if (deliveries.length) await this.#dependencies.collectObservations();
    await this.#dependencies.revokeSecretLeases?.();
    return deliveries;
  }
}
