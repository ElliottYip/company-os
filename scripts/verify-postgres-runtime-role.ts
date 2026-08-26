import postgres from "postgres";

async function mustBeDenied(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42501") return;
    throw new Error("RUNTIME_DATABASE_UNEXPECTED_DENIAL");
  }
  throw new Error("RUNTIME_DATABASE_PRIVILEGE_ESCALATION");
}

export async function verifyPostgresRuntimeRole(input: {
  readonly runtimeUrl: string;
  readonly fixtureSuffix: string;
}): Promise<{ readonly schemaVersion: 1; readonly status: "PASS"; readonly deniedCapabilities: number }> {
  if (!/^[a-f0-9]{8,32}$/.test(input.fixtureSuffix)) throw new Error("RUNTIME_DATABASE_FIXTURE_INVALID");
  const sql = postgres(input.runtimeUrl, { max: 1, connect_timeout: 10 });
  const userId = `runtime-user-${input.fixtureSuffix}`;
  const companyId = `runtime-company-${input.fixtureSuffix}`;
  const eventId = `runtime-event-${input.fixtureSuffix}`;
  try {
    const [role] = await sql<{
      superuser: boolean; createDatabase: boolean; createRole: boolean; replication: boolean; bypassRls: boolean;
      schemaCreate: boolean; databaseTemporary: boolean;
    }[]>`
      select r.rolsuper as superuser, r.rolcreatedb as "createDatabase", r.rolcreaterole as "createRole",
        r.rolreplication as replication, r.rolbypassrls as "bypassRls",
        has_schema_privilege(current_user, 'public', 'CREATE') as "schemaCreate",
        has_database_privilege(current_user, current_database(), 'TEMP') as "databaseTemporary"
      from pg_roles r where r.rolname = current_user
    `;
    if (!role || Object.values(role).some(Boolean)) throw new Error("RUNTIME_DATABASE_ROLE_NOT_LEAST_PRIVILEGED");

    await sql.begin(async (transaction) => {
      await transaction`
        insert into company_os_auth_user (id, name, email, email_verified, created_at, updated_at)
        values (${userId}, 'Runtime role fixture', ${`${input.fixtureSuffix}@integration.invalid`}, true, now(), now())
      `;
      await transaction`
        insert into company_os_company (id, name, purpose, locale, default_responsible_user_id)
        values (${companyId}, 'Runtime role fixture', 'Prove least privilege', 'en-US', ${userId})
      `;
      await transaction`
        insert into company_os_domain_event
          (id, company_id, sequence, type, occurred_at, actor_id, payload, provenance)
        values (${eventId}, ${companyId}, 1, 'runtime-role.admission.recorded', now()::text,
          ${userId}, ${sql.json({ marker: input.fixtureSuffix })}, 'PRODUCTION')
      `;
      const [event] = await transaction<{ marker: string }[]>`
        select payload->>'marker' as marker from company_os_domain_event where id = ${eventId}
      `;
      if (event?.marker !== input.fixtureSuffix) throw new Error("RUNTIME_DATABASE_DML_VERIFICATION_FAILED");
      await transaction`update company_os_company set purpose = 'Runtime DML verified' where id = ${companyId}`;
      await transaction`delete from company_os_domain_event where id = ${eventId}`;
      await transaction`delete from company_os_company where id = ${companyId}`;
      await transaction`delete from company_os_auth_user where id = ${userId}`;
    });

    await mustBeDenied(() => sql.unsafe("create table company_os_runtime_forbidden (id text)"));
    await mustBeDenied(() => sql.unsafe("alter table company_os_company add column runtime_forbidden text"));
    await mustBeDenied(() => sql.unsafe("create role company_os_runtime_forbidden"));
    await mustBeDenied(() => sql.unsafe("truncate table company_os_domain_event"));
    await mustBeDenied(() => sql.unsafe("create temporary table company_os_runtime_forbidden_temp (id text)"));
    return { schemaVersion: 1, status: "PASS", deniedCapabilities: 5 };
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const runtimeUrl = process.env.COMPANY_OS_DATABASE_URL;
  const fixtureSuffix = process.env.COMPANY_OS_RUNTIME_ROLE_FIXTURE_SUFFIX;
  if (!runtimeUrl || !fixtureSuffix) throw new Error("RUNTIME_DATABASE_VERIFICATION_CONFIGURATION_REQUIRED");
  process.stdout.write(`${JSON.stringify(await verifyPostgresRuntimeRole({ runtimeUrl, fixtureSuffix }))}\n`);
}
