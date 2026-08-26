import { randomBytes } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const POSTGRES_IMAGE = "postgres:16.15-bookworm@sha256:bb3e1a57e5407e0a5280b4211980a5e537f4abd234a87014ac979849a78dd825";
const API_IMAGE = "company-os-api:upgrade-admission";
const suffix = randomBytes(6).toString("hex");
const password = randomBytes(32).toString("base64url");
const network = `company-os-upgrade-${suffix}`;
const container = `company-os-upgrade-postgres-${suffix}`;
const sourceDatabase = "company_os_upgrade_source";
const rollbackDatabase = "company_os_upgrade_rollback";
const databaseUser = "company_os";
const marker = `upgrade-${suffix}`;
const temporaryDirectory = await mkdtemp(join(tmpdir(), "company-os-upgrade-"));
const baselineMigrations = join(temporaryDirectory, "migrations");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    const stdout = [];
    const stderr = [];
    child.stdout?.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", () => reject(new Error("UPGRADE_ADMISSION_PROCESS_START_FAILED")));
    child.once("exit", (code) => {
      const result = { code, stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8") };
      if (code === 0 || options.allowFailure) resolve(result);
      else reject(new Error(`UPGRADE_ADMISSION_COMMAND_FAILED:${command}`));
    });
  });
}

async function waitForPostgres() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await run("docker", ["exec", container, "pg_isready", "--username", databaseUser,
      "--dbname", sourceDatabase], { allowFailure: true });
    if (result.code === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("UPGRADE_ADMISSION_POSTGRES_TIMEOUT");
}

async function psql(database, statement, options = {}) {
  return run("docker", ["exec", "--env", `PGPASSWORD=${password}`, container,
    "psql", "--username", databaseUser, "--dbname", database,
    "--set", "ON_ERROR_STOP=1", "--tuples-only", "--no-align", "--command", statement], options);
}

async function prepareBaselineMigrations() {
  const source = new URL("../adapters/persistence/postgres/migrations/", import.meta.url);
  await cp(source, baselineMigrations, { recursive: true });
  await rm(join(baselineMigrations, "0005_durable_control_plane.sql"));
  await rm(join(baselineMigrations, "0006_instance_maintenance.sql"));
  const journalPath = join(baselineMigrations, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  journal.entries = journal.entries.filter(({ tag }) =>
    !["0005_durable_control_plane", "0006_instance_maintenance"].includes(tag));
  await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
}

let cleaning = false;
async function cleanup() {
  if (cleaning) return;
  cleaning = true;
  await run("docker", ["rm", "--force", container], { allowFailure: true });
  await run("docker", ["network", "rm", network], { allowFailure: true });
  await run("docker", ["image", "rm", "--force", API_IMAGE], { allowFailure: true });
  await rm(temporaryDirectory, { recursive: true, force: true });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });
}

try {
  await prepareBaselineMigrations();
  await run("docker", ["network", "create", network]);
  await run("docker", ["run", "--detach", "--name", container, "--network", network,
    "--publish", "127.0.0.1::5432", "--env", `POSTGRES_DB=${sourceDatabase}`,
    "--env", `POSTGRES_USER=${databaseUser}`, "--env", `POSTGRES_PASSWORD=${password}`,
    POSTGRES_IMAGE]);
  await waitForPostgres();
  const portResult = await run("docker", ["port", container, "5432/tcp"]);
  const hostPort = portResult.stdout.trim().match(/:(\d+)$/)?.[1];
  if (!hostPort) throw new Error("UPGRADE_ADMISSION_DATABASE_PORT_INVALID");
  const hostUrl = `postgres://${databaseUser}:${password}@127.0.0.1:${hostPort}/${sourceDatabase}`;
  const baselineSql = postgres(hostUrl, { max: 1, connect_timeout: 10 });
  try {
    await migrate(drizzle(baselineSql), { migrationsFolder: baselineMigrations });
  } finally {
    await baselineSql.end();
  }

  const seed = [
    "INSERT INTO company_os_auth_user (id,name,email,email_verified,created_at,updated_at)",
    `VALUES ('upgrade-user','Upgrade admission','upgrade-${suffix}@integration.invalid',true,now(),now());`,
    "INSERT INTO company_os_company (id,name,purpose,locale,default_responsible_user_id)",
    "VALUES ('upgrade-company','Upgrade admission','Verify safe upgrade','en-US','upgrade-user');",
    "INSERT INTO company_os_domain_event (id,company_id,sequence,type,occurred_at,actor_id,payload,provenance)",
    `VALUES ('upgrade-event','upgrade-company',1,'upgrade.baseline.recorded',now()::text,'upgrade-user','{"marker":"${marker}"}'::jsonb,'PRODUCTION');`,
  ].join(" ");
  await psql(sourceDatabase, seed);
  await run("docker", ["exec", "--env", `PGPASSWORD=${password}`, container,
    "pg_dump", "--format=custom", "--no-owner", "--no-privileges",
    "--file", "/tmp/company-os-pre-upgrade.dump", "--username", databaseUser, sourceDatabase]);

  await run("docker", ["build", "--file", "deploy/Dockerfile.api", "--tag", API_IMAGE, "."]);
  const containerUrl = `postgres://${databaseUser}:${password}@${container}:5432/${sourceDatabase}`;
  await run("docker", ["run", "--rm", "--network", network,
    "--env", `COMPANY_OS_DATABASE_URL=${containerUrl}`, API_IMAGE,
    "node", "--experimental-strip-types", "scripts/migrate-postgres.ts"]);

  const upgraded = await psql(sourceDatabase,
    "SELECT (SELECT count(*) FROM drizzle.__drizzle_migrations), to_regclass('public.company_os_connector_outbox'), to_regclass('public.company_os_instance_maintenance'), payload->>'marker' FROM company_os_domain_event WHERE id='upgrade-event';");
  const upgradedFields = upgraded.stdout.trim().split("|");
  if (upgradedFields[0] !== "6" || upgradedFields[1] !== "company_os_connector_outbox" ||
      upgradedFields[2] !== "company_os_instance_maintenance" ||
      upgradedFields[3] !== marker) throw new Error("UPGRADE_ADMISSION_CURRENT_SCHEMA_MISMATCH");

  const legacyProbe = await psql(sourceDatabase, [
    "INSERT INTO company_os_domain_event (id,company_id,sequence,type,occurred_at,actor_id,payload,provenance)",
    "VALUES ('legacy-probe','upgrade-company',2,'upgrade.legacy.probe',now()::text,'upgrade-user','{}'::jsonb,'PRODUCTION');",
    "SELECT name FROM company_os_company WHERE id='upgrade-company';",
  ].join(" "));
  if (!legacyProbe.stdout.includes("Upgrade admission")) {
    throw new Error("UPGRADE_ADMISSION_LEGACY_PROBE_FAILED");
  }

  await run("docker", ["exec", "--env", `PGPASSWORD=${password}`, container,
    "createdb", "--username", databaseUser, rollbackDatabase]);
  await run("docker", ["exec", "--env", `PGPASSWORD=${password}`, container,
    "pg_restore", "--exit-on-error", "--no-owner", "--no-privileges",
    "--username", databaseUser, "--dbname", rollbackDatabase, "/tmp/company-os-pre-upgrade.dump"]);
  const rollback = await psql(rollbackDatabase,
    "SELECT (SELECT count(*) FROM drizzle.__drizzle_migrations), to_regclass('public.company_os_connector_outbox') IS NULL, payload->>'marker' FROM company_os_domain_event WHERE id='upgrade-event';");
  const rollbackFields = rollback.stdout.trim().split("|");
  if (rollbackFields[0] !== "4" || rollbackFields[1] !== "t" || rollbackFields[2] !== marker) {
    throw new Error("UPGRADE_ADMISSION_ROLLBACK_DATA_MISMATCH");
  }

  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, status: "PASS",
    fromMigration: "0004_human_invites", toMigration: "0006_instance_maintenance",
    rollback: "PARALLEL_RESTORE_VERIFIED" })}\n`);
} finally {
  await cleanup();
}
