import postgres from "postgres";
import { postgresCommandCoordinates } from "./postgres-restore-drill.ts";
import { readSecretFileEnvironment } from "../adapters/config/secret-file-environment.ts";

const ROLE = /^[a-z][a-z0-9_]{0,62}$/;

export function runtimeDatabaseRoleName(value: string): string {
  const normalized = value.trim();
  if (!ROLE.test(normalized) || normalized === "postgres") throw new Error("RUNTIME_DATABASE_ROLE_INVALID");
  return normalized;
}

export function assertDistinctDatabasePrincipals(adminUrl: string, runtimeRole: string): void {
  const admin = postgresCommandCoordinates(adminUrl);
  if (admin.user === runtimeDatabaseRoleName(runtimeRole)) throw new Error("DATABASE_PRINCIPALS_MUST_DIFFER");
}

function requiredPassword(value: string): string {
  if (!/^[A-Za-z0-9_-]{24,512}$/.test(value)) {
    throw new Error("RUNTIME_DATABASE_PASSWORD_INVALID");
  }
  return value;
}

function identifier(value: string): string {
  if (!value || value.includes("\0")) throw new Error("DATABASE_IDENTIFIER_INVALID");
  return `"${value.replaceAll('"', '""')}"`;
}

export async function provisionPostgresRuntimeRole(input: {
  readonly adminUrl: string;
  readonly runtimeRole: string;
  readonly runtimePassword: string;
}): Promise<{ readonly schemaVersion: 1; readonly status: "PASS"; readonly runtimeRole: string }> {
  const runtimeRole = runtimeDatabaseRoleName(input.runtimeRole);
  const runtimePassword = requiredPassword(input.runtimePassword);
  assertDistinctDatabasePrincipals(input.adminUrl, runtimeRole);
  const admin = postgresCommandCoordinates(input.adminUrl);
  const sql = postgres(input.adminUrl, { max: 1, connect_timeout: 10 });
  let stage = "ROLE_LOOKUP";
  try {
    const [existing] = await sql<{ exists: boolean }[]>`
      select exists(select 1 from pg_roles where rolname = ${runtimeRole}) as exists
    `;
    stage = "ROLE_STATEMENT";
    const roleStatement = `${existing?.exists ? "alter" : "create"} role ${identifier(runtimeRole)} ` +
      `with login password '${runtimePassword}' nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls`;
    stage = "ROLE_APPLY";
    await sql.unsafe(roleStatement);

    stage = "GRANT_STATEMENTS";
    const database = identifier(admin.database);
    const runtime = identifier(runtimeRole);
    const migration = identifier(admin.user);
    const statements = [
      `revoke all privileges on database ${database} from ${runtime}`,
      `grant connect on database ${database} to ${runtime}`,
      `revoke all privileges on schema public from ${runtime}`,
      `grant usage on schema public to ${runtime}`,
      `revoke all privileges on all tables in schema public from ${runtime}`,
      `grant select, insert, update, delete on all tables in schema public to ${runtime}`,
      `revoke all privileges on all sequences in schema public from ${runtime}`,
      `grant usage, select, update on all sequences in schema public to ${runtime}`,
      `alter default privileges for role ${migration} in schema public ` +
        `grant select, insert, update, delete on tables to ${runtime}`,
      `alter default privileges for role ${migration} in schema public ` +
        `grant usage, select, update on sequences to ${runtime}`,
      `alter role ${runtime} set search_path = public`,
      `revoke temporary on database ${database} from public`,
    ];
    stage = "GRANT_APPLY";
    await sql.begin(async (transaction) => {
      await transaction.unsafe(`revoke create on schema public from public`);
      for (const statement of statements) await transaction.unsafe(statement);
    });
    return { schemaVersion: 1, status: "PASS", runtimeRole };
  } catch (error) {
    if (error instanceof Error && /^[A-Z][A-Z0-9_]{2,95}$/.test(error.message)) throw error;
    throw new Error(`RUNTIME_DATABASE_ROLE_PROVISIONING_FAILED_${stage}`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const adminUrl = await readSecretFileEnvironment("COMPANY_OS_MIGRATION_DATABASE_URL");
  const runtimeRole = process.env.COMPANY_OS_RUNTIME_DATABASE_USER;
  const runtimePassword = await readSecretFileEnvironment("COMPANY_OS_RUNTIME_DATABASE_PASSWORD");
  if (!adminUrl || !runtimeRole || !runtimePassword) throw new Error("RUNTIME_DATABASE_ROLE_CONFIGURATION_REQUIRED");
  process.stdout.write(`${JSON.stringify(await provisionPostgresRuntimeRole({
    adminUrl, runtimeRole, runtimePassword,
  }))}\n`);
}
