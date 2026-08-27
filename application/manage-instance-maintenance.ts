import { changeInstanceMaintenance, type InstanceAcceptanceBinding,
  type InstanceMaintenanceMode } from "../core/instance-maintenance.ts";
import type { CompanyAccessStorePort } from "../ports/company-access-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { InstanceMaintenancePort } from "../ports/instance-maintenance-port.ts";
import type { Identifier } from "../core/control-plane.ts";

interface ManageInstanceMaintenanceDependencies {
    readonly identity: IdentityPort;
    readonly access: Pick<CompanyAccessStorePort, "isInstanceAdmin">;
    readonly maintenance: InstanceMaintenancePort;
    readonly now: () => string;
    readonly nextId: () => Identifier;
}

export class ManageInstanceMaintenance {
  readonly #dependencies: ManageInstanceMaintenanceDependencies;

  constructor(dependencies: ManageInstanceMaintenanceDependencies) {
    this.#dependencies = dependencies;
  }

  async load() {
    await this.#administrator();
    return this.#dependencies.maintenance.load();
  }

  async execute(input: {
    readonly mode: InstanceMaintenanceMode;
    readonly expectedRevision: number;
    readonly operationId: Identifier;
    readonly authorizationReference: string;
    readonly acceptance?: InstanceAcceptanceBinding;
  }) {
    const identity = await this.#administrator();
    const current = await this.#dependencies.maintenance.load();
    if (current.revision !== input.expectedRevision) throw new Error("INSTANCE_MAINTENANCE_REVISION_CONFLICT");
    const next = changeInstanceMaintenance(current, { mode: input.mode,
      operationId: input.operationId, authorizationReference: input.authorizationReference,
      ...(input.acceptance ? { acceptance: input.acceptance } : {}),
      changedBy: identity.actorId, changedAt: this.#dependencies.now() });
    return this.#dependencies.maintenance.replace({ expectedRevision: current.revision,
      state: next, eventId: this.#dependencies.nextId() });
  }

  async #administrator() {
    const identity = await this.#dependencies.identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (!await this.#dependencies.access.isInstanceAdmin(identity.actorId)) throw new Error("INSTANCE_ADMIN_REQUIRED");
    return identity;
  }
}
