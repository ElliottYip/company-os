import { and, eq } from "drizzle-orm";
import type { createCompanyDatabase } from "./company-database.ts";
import { authUsers } from "./auth-schema.ts";
import { identityBindings } from "./tenant-registration-schema.ts";
import { tenantAssertedEmailHmac } from "../../security/tenant-identity-email-hmac.ts";

type CompanyDatabase = ReturnType<typeof createCompanyDatabase>["db"];

export class PostgresTenantInviteIdentity {
  readonly #database: CompanyDatabase;
  readonly #key: Buffer;

  constructor(database: CompanyDatabase, key: Buffer) {
    if (key.length !== 32) throw new Error("TENANT_EMAIL_HMAC_CONTEXT_INVALID");
    this.#database = database;
    this.#key = Buffer.from(key);
  }

  async expectedEmailHmac(companyId: string, email: string): Promise<string | null> {
    const rows = await this.#database.select({ tenantDigest: identityBindings.externalTenantDigest })
      .from(identityBindings).where(and(
        eq(identityBindings.companyId, companyId),
        eq(identityBindings.status, "active"),
      )).limit(2);
    if (rows.length === 0) return null;
    if (rows.length !== 1) throw new Error("TENANT_IDENTITY_BINDING_AMBIGUOUS");
    return tenantAssertedEmailHmac({ key: this.#key, tenantDigest: rows[0]!.tenantDigest, email });
  }

  async assertedEmailHmac(userId: string): Promise<string | null> {
    const rows = await this.#database.select({ value: authUsers.assertedEmailHmac })
      .from(authUsers).where(eq(authUsers.id, userId)).limit(2);
    if (rows.length !== 1) throw new Error("FORMAL_IDENTITY_REQUIRED");
    return rows[0]!.value;
  }
}
