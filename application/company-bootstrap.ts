import type { Identifier } from "../core/control-plane.ts";
import { OWNER_DEFAULT_PERMISSION_KEYS } from "../core/company-access.ts";
import type {
  CompanyAccessStorePort,
  CreateOwnedCompanyRecord,
  FirstInstanceAdminClaim,
} from "../ports/company-access-store-port.ts";

const PORTABLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface AuthenticatedHumanActor {
  readonly userId: Identifier;
  readonly sessionId: Identifier;
}

export interface CompanyBootstrapInput {
  readonly name: string;
  readonly purpose: string;
  readonly locale: string;
}

function actorId(value: string, code: string): Identifier {
  if (!PORTABLE_ID.test(value)) throw new Error(code);
  return value;
}

function text(value: string, code: string, max: number): string {
  const normalized = value.trim();
  if (!normalized || [...normalized].length > max) throw new Error(code);
  return normalized;
}

export class CompanyBootstrapService {
  readonly #store: CompanyAccessStorePort;
  readonly #nextId: () => Identifier;

  constructor(dependencies: { readonly store: CompanyAccessStorePort; readonly nextId: () => Identifier }) {
    this.#store = dependencies.store;
    this.#nextId = dependencies.nextId;
  }

  async claimFirstInstanceAdmin(actor: AuthenticatedHumanActor): Promise<FirstInstanceAdminClaim> {
    return await this.#store.claimFirstInstanceAdmin({
      roleId: actorId(this.#nextId(), "INSTANCE_ROLE_ID_INVALID"),
      userId: actorId(actor.userId, "AUTHENTICATED_USER_ID_INVALID"),
    });
  }

  async createOwnedCompany(
    actor: AuthenticatedHumanActor,
    input: CompanyBootstrapInput,
  ): Promise<CreateOwnedCompanyRecord> {
    const userId = actorId(actor.userId, "AUTHENTICATED_USER_ID_INVALID");
    const locale = text(input.locale, "COMPANY_LOCALE_INVALID", 35);
    if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(locale)) throw new Error("COMPANY_LOCALE_INVALID");
    return await this.#store.createOwnedCompany({
      companyId: actorId(this.#nextId(), "COMPANY_ID_INVALID"),
      membershipId: actorId(this.#nextId(), "MEMBERSHIP_ID_INVALID"),
      permissionGrants: OWNER_DEFAULT_PERMISSION_KEYS.map((permissionKey) => ({
        id: actorId(this.#nextId(), "PERMISSION_GRANT_ID_INVALID"),
        permissionKey,
      })),
      ownerUserId: userId,
      name: text(input.name, "COMPANY_NAME_INVALID", 120),
      purpose: text(input.purpose, "COMPANY_PURPOSE_INVALID", 2_000),
      locale,
    });
  }
}
