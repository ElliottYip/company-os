import { and, eq } from "drizzle-orm";
import type { VerifiedHumanDirectoryPort } from "../../../ports/verified-human-directory-port.ts";
import type { createCompanyDatabase } from "./company-database.ts";
import { authUsers } from "./auth-schema.ts";

type CompanyDatabase = ReturnType<typeof createCompanyDatabase>["db"];

export class PostgresVerifiedHumanDirectory implements VerifiedHumanDirectoryPort {
  readonly #database: CompanyDatabase;

  constructor(database: CompanyDatabase) {
    this.#database = database;
  }

  async findVerifiedHumanIdByEmail(email: string): Promise<string | null> {
    const row = await this.#database.select({ id: authUsers.id }).from(authUsers).where(and(
      eq(authUsers.email, email),
      eq(authUsers.emailVerified, true),
    )).then((rows) => rows[0] ?? null);
    return row?.id ?? null;
  }
}
