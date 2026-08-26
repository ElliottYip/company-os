import type { CompanyAccessStorePort } from "../ports/company-access-store-port.ts";
import type { VerifiedHumanDirectoryPort } from "../ports/verified-human-directory-port.ts";

const PORTABLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ManagedInstanceAdminProvisioningService {
  readonly #humans: VerifiedHumanDirectoryPort;
  readonly #access: CompanyAccessStorePort;
  readonly #nextId: () => string;

  constructor(input: {
    readonly humans: VerifiedHumanDirectoryPort;
    readonly access: CompanyAccessStorePort;
    readonly nextId: () => string;
  }) {
    this.#humans = input.humans;
    this.#access = input.access;
    this.#nextId = input.nextId;
  }

  async provision(rawEmail: string): Promise<{ readonly schemaVersion: 1; readonly status: "PROVISIONED" }> {
    const email = rawEmail.trim().toLocaleLowerCase("en-US");
    if (email.length > 320 || !EMAIL.test(email)) throw new Error("PROVISIONING_EMAIL_INVALID");
    const userId = await this.#humans.findVerifiedHumanIdByEmail(email);
    if (!userId) throw new Error("VERIFIED_HUMAN_NOT_FOUND");
    const roleId = this.#nextId();
    if (!PORTABLE_ID.test(roleId)) throw new Error("INSTANCE_ROLE_ID_INVALID");
    const result = await this.#access.claimFirstInstanceAdmin({ roleId, userId });
    if (result.status === "ALREADY_CLAIMED" && result.existingUserId !== userId) {
      throw new Error("INSTANCE_ADMIN_ALREADY_PROVISIONED");
    }
    return { schemaVersion: 1, status: "PROVISIONED" };
  }
}
