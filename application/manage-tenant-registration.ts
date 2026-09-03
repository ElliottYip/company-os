import {
  completeTenantRegistration,
  createTenantRegistration,
  verifyTenantRegistrationIdentity,
  type TenantDeploymentMode,
  type TenantRegistrationRecord,
} from "../core/tenant-registration.ts";
import type { TenantRegistrationStorePort } from "../ports/tenant-registration-store-port.ts";

export class ManageTenantRegistration {
  readonly #store: TenantRegistrationStorePort;
  readonly #nextId: () => string;
  readonly #now: () => string;

  constructor(input: {
    readonly store: TenantRegistrationStorePort;
    readonly nextId: () => string;
    readonly now: () => string;
  }) {
    this.#store = input.store;
    this.#nextId = input.nextId;
    this.#now = input.now;
  }

  async begin(input: {
    readonly mode: TenantDeploymentMode;
    readonly slug: string;
    readonly companyName: string;
    readonly requestedBy: string;
    readonly identityBindingId?: string;
  }): Promise<TenantRegistrationRecord> {
    const record = createTenantRegistration({ ...input, id: this.#nextId(), now: this.#now() });
    if (await this.#store.create(record) !== "CREATED") throw new Error("TENANT_SLUG_TAKEN");
    return record;
  }

  async verifyIdentity(input: {
    readonly registrationId: string;
    readonly identityBindingId: string;
    readonly verifiedHumanId: string;
    readonly externalTenantDigest: string;
  }): Promise<TenantRegistrationRecord> {
    const current = await this.#required(input.registrationId);
    const record = verifyTenantRegistrationIdentity(current, { ...input, now: this.#now() });
    return this.#replace(current.revision, record);
  }

  async complete(input: {
    readonly registrationId: string;
    readonly verifiedHumanId: string;
    readonly companyId: string;
  }): Promise<TenantRegistrationRecord> {
    const current = await this.#required(input.registrationId);
    const record = completeTenantRegistration(current, { ...input, now: this.#now() });
    return this.#replace(current.revision, record);
  }

  async #required(id: string): Promise<TenantRegistrationRecord> {
    const record = await this.#store.findById(id);
    if (!record) throw new Error("TENANT_REGISTRATION_NOT_FOUND");
    return record;
  }

  async #replace(expectedRevision: number, record: TenantRegistrationRecord): Promise<TenantRegistrationRecord> {
    if (await this.#store.replace({ expectedRevision, record }) !== "UPDATED") {
      throw new Error("TENANT_REGISTRATION_CONFLICT");
    }
    return record;
  }
}
