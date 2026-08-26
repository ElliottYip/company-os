import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const POSTGRES_16_IMAGE = "postgres:16.15-bookworm@sha256:bb3e1a57e5407e0a5280b4211980a5e537f4abd234a87014ac979849a78dd825";
const POSTGRES_17_IMAGE = "postgres:17.11-bookworm@sha256:051f7b7b3abdd564d5d1bd1e8c4b9c1b6e77087d1dd22020ede611c096a272e0";
const suffix = `${process.pid}-${randomBytes(4).toString("hex")}`;
const network = `company-os-pg-major-${suffix}`;
const source = `company-os-pg16-${suffix}`;
const target = `company-os-pg17-${suffix}`;
const databaseUser = "company_os";
const sourceDatabase = "company_os_source";
const targetDatabase = "company_os_target";
const password = randomBytes(32).toString("base64url");
const marker = `major-upgrade-${randomBytes(8).toString("hex")}`;
const temporaryDirectory = await mkdtemp(join(tmpdir(), "company-os-pg-major-"));
let cleaning = false;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    const stdout = []; const stderr = [];
    child.stdout?.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", () => reject(new Error("POSTGRES_MAJOR_ADMISSION_PROCESS_START_FAILED")));
    child.once("exit", (code) => {
      const result = { code, stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8") };
      if (code === 0 || options.allowFailure) resolve(result);
      else reject(new Error(`POSTGRES_MAJOR_ADMISSION_COMMAND_FAILED:${command}`));
    });
  });
}

async function docker(args, options) { return run("docker", args, options); }

async function cleanup() {
  if (cleaning) return;
  cleaning = true;
  await docker(["rm", "--force", source, target], { allowFailure: true });
  await docker(["network", "rm", network], { allowFailure: true });
  await rm(temporaryDirectory, { recursive: true, force: true });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });
}

async function start(name, database, image) {
  await docker(["run", "--detach", "--name", name, "--network", network,
    "--publish", "127.0.0.1::5432", "--env", `POSTGRES_DB=${database}`,
    "--env", `POSTGRES_USER=${databaseUser}`, "--env", `POSTGRES_PASSWORD=${password}`, image]);
}

async function waitForPostgres(name, database) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await docker(["exec", name, "pg_isready", "--username", databaseUser,
      "--dbname", database], { allowFailure: true });
    if (result.code === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("POSTGRES_MAJOR_ADMISSION_NOT_READY");
}

async function hostPort(name) {
  const result = await docker(["port", name, "5432/tcp"]);
  const port = result.stdout.trim().match(/:(\d+)$/)?.[1];
  if (!port) throw new Error("POSTGRES_MAJOR_ADMISSION_PORT_INVALID");
  return port;
}

async function migrate(name, database) {
  const port = await hostPort(name);
  await run(process.execPath, ["--experimental-strip-types", "scripts/migrate-postgres.ts"], {
    cwd: process.cwd(), env: { ...process.env,
      COMPANY_OS_DATABASE_URL: `postgres://${databaseUser}:${password}@127.0.0.1:${port}/${database}` },
  });
}

async function psql(name, database, statement) {
  return docker(["exec", "--env", `PGPASSWORD=${password}`, name, "psql",
    "--username", databaseUser, "--dbname", database, "--set", "ON_ERROR_STOP=1",
    "--tuples-only", "--no-align", "--command", statement]);
}

try {
  await docker(["network", "create", network]);
  await Promise.all([start(source, sourceDatabase, POSTGRES_16_IMAGE),
    start(target, targetDatabase, POSTGRES_17_IMAGE)]);
  await Promise.all([waitForPostgres(source, sourceDatabase), waitForPostgres(target, targetDatabase)]);
  await migrate(source, sourceDatabase);
  const sourceMigrationCount = Number((await psql(source, sourceDatabase,
    "SELECT count(*) FROM drizzle.__drizzle_migrations;")).stdout.trim());
  if (!Number.isSafeInteger(sourceMigrationCount) || sourceMigrationCount < 1) {
    throw new Error("POSTGRES_MAJOR_ADMISSION_SOURCE_MIGRATIONS_INVALID");
  }
  await psql(source, sourceDatabase, [
    "INSERT INTO company_os_auth_user (id,name,email,email_verified,created_at,updated_at)",
    `VALUES ('major-user','Major upgrade','major-${suffix}@integration.invalid',true,now(),now());`,
    "INSERT INTO company_os_company (id,name,purpose,locale,default_responsible_user_id)",
    "VALUES ('major-company','Major upgrade','Prove PostgreSQL major portability','en-US','major-user');",
    "INSERT INTO company_os_domain_event (id,company_id,sequence,type,occurred_at,actor_id,payload,provenance)",
    `VALUES ('major-event','major-company',1,'database.major.source',now()::text,'major-user','{\"marker\":\"${marker}\"}'::jsonb,'PRODUCTION');`,
  ].join(" "));

  await docker(["exec", "--env", `PGPASSWORD=${password}`, target, "pg_dump",
    "--host", source, "--username", databaseUser, "--dbname", sourceDatabase,
    "--format", "custom", "--no-owner", "--no-privileges", "--file", "/tmp/company-os-major.dump"]);
  await docker(["exec", "--env", `PGPASSWORD=${password}`, target, "pg_restore",
    "--username", databaseUser, "--dbname", targetDatabase, "--exit-on-error",
    "--no-owner", "--no-privileges", "/tmp/company-os-major.dump"]);
  await migrate(target, targetDatabase);

  const upgraded = await psql(target, targetDatabase,
    "SELECT current_setting('server_version_num')::int / 10000, (SELECT count(*) FROM drizzle.__drizzle_migrations), payload->>'marker' FROM company_os_domain_event WHERE id='major-event';");
  assert.deepEqual(upgraded.stdout.trim().split("|"), ["17", String(sourceMigrationCount), marker]);
  await psql(target, targetDatabase,
    "INSERT INTO company_os_domain_event (id,company_id,sequence,type,occurred_at,actor_id,payload,provenance) VALUES ('target-only','major-company',2,'database.major.target',now()::text,'major-user','{}'::jsonb,'PRODUCTION');");

  const rollbackSource = await psql(source, sourceDatabase,
    "SELECT current_setting('server_version_num')::int / 10000, payload->>'marker', NOT EXISTS (SELECT 1 FROM company_os_domain_event WHERE id='target-only') FROM company_os_domain_event WHERE id='major-event';");
  assert.deepEqual(rollbackSource.stdout.trim().split("|"), ["16", marker, "t"]);
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, status: "PASS",
    source: "POSTGRESQL_16_15", target: "POSTGRESQL_17_11",
    method: "LOGICAL_DUMP_RESTORE", rollback: "ROLLBACK_SOURCE_PRESERVED",
    migrations: sourceMigrationCount, customerData: "SYNTHETIC_ONLY" })}\n`);
} finally {
  await cleanup();
}
