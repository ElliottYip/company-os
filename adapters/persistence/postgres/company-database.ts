import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as authSchema from "./auth-schema.ts";
import * as accessSchema from "./company-access-schema.ts";

const schema = { ...authSchema, ...accessSchema };

export function createCompanyDatabase(connectionString: string) {
  const normalized = connectionString.trim();
  if (!normalized) throw new Error("DATABASE_URL_REQUIRED");
  const url = new URL(normalized);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL_INVALID");
  }
  const sql = postgres(normalized, {
    max: 10,
    connect_timeout: 10,
    idle_timeout: 30,
    onnotice: () => {},
  });
  return {
    db: drizzle(sql, { schema }),
    async ping() {
      await sql`select 1 as healthy`;
    },
    async checkSchema() {
      await sql`select 1 from company_os_auth_session limit 0`;
      await sql`select 1 from company_os_company limit 0`;
      await sql`select 1 from company_os_domain_event limit 0`;
      await sql`select 1 from company_os_connector_outbox limit 0`;
    },
    async migrate() {
      await sql`select pg_advisory_lock(hashtext('company-os-schema-migrations'))`;
      try {
        await migrate(drizzle(sql, { schema }), {
          migrationsFolder: new URL("./migrations", import.meta.url).pathname,
        });
      } finally {
        await sql`select pg_advisory_unlock(hashtext('company-os-schema-migrations'))`;
      }
    },
    async close() { await sql.end(); },
  };
}
