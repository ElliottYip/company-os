import { OWNER_DEFAULT_PERMISSION_KEYS } from "../core/company-access.ts";
import type { Identifier } from "../core/control-plane.ts";
import type {
  CompanyRestoreInspectionRecord,
  CompanyRestoreStorePort,
  RestoredOwnedCompanyRecord,
} from "../ports/company-restore-store-port.ts";
import type { AuthenticatedHumanActor } from "./company-bootstrap.ts";

const PORTABLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAXIMUM_BACKUP_BYTES = 8 * 1_024 * 1_024;

export class RestoreCompanyFromBackup {
  readonly #store: CompanyRestoreStorePort;
  readonly #nextId: () => Identifier;

  constructor(dependencies: { readonly store: CompanyRestoreStorePort; readonly nextId: () => Identifier }) {
    this.#store = dependencies.store;
    this.#nextId = dependencies.nextId;
  }

  inspect(actor: AuthenticatedHumanActor, source: string): Promise<CompanyRestoreInspectionRecord> {
    this.#validate(actor, source);
    return this.#store.inspectOwnedCompanyRestore({ source, actorUserId: actor.userId });
  }

  execute(actor: AuthenticatedHumanActor, source: string): Promise<RestoredOwnedCompanyRecord> {
    this.#validate(actor, source);
    const nextId = (code: string) => {
      const value = this.#nextId();
      if (!PORTABLE_ID.test(value)) throw new Error(code);
      return value;
    };
    return this.#store.restoreOwnedCompany({
      source,
      actorUserId: actor.userId,
      membershipId: nextId("MEMBERSHIP_ID_INVALID"),
      permissionGrants: OWNER_DEFAULT_PERMISSION_KEYS.map((permissionKey) => ({
        id: nextId("PERMISSION_GRANT_ID_INVALID"), permissionKey,
      })),
    });
  }

  #validate(actor: AuthenticatedHumanActor, source: string): void {
    if (!PORTABLE_ID.test(actor.userId)) throw new Error("AUTHENTICATED_USER_ID_INVALID");
    if (!source || Buffer.byteLength(source, "utf8") > MAXIMUM_BACKUP_BYTES) {
      throw new Error("DURABLE_BACKUP_INVALID");
    }
  }
}
