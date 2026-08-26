import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { spawn } from "node:child_process";
import postgres from "postgres";
import { createCompanyDatabase } from "../adapters/persistence/postgres/company-database.ts";

export interface PostgresCommandCoordinates {
  readonly host: string;
  readonly port: string;
  readonly database: string;
  readonly user: string;
  readonly password: string;
  readonly sslMode: string | undefined;
}

export function postgresCommandCoordinates(value: string): PostgresCommandCoordinates {
  const url = new URL(value);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new Error("DATABASE_URL_INVALID");
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const user = decodeURIComponent(url.username);
  if (!url.hostname || !database || database.includes("/") || !user) throw new Error("DATABASE_URL_INVALID");
  return { host: url.hostname, port: url.port || "5432", database, user,
    password: decodeURIComponent(url.password), sslMode: url.searchParams.get("sslmode") ?? undefined };
}

export function assertRestoreDrillBoundary(source: PostgresCommandCoordinates,
  target: PostgresCommandCoordinates, backupPath: string): void {
  if (source.host === target.host && source.port === target.port && source.database === target.database) {
    throw new Error("RESTORE_DRILL_SOURCE_TARGET_MUST_DIFFER");
  }
  if (!/(?:restore|drill|test)/i.test(target.database)) throw new Error("RESTORE_DRILL_TARGET_NAME_REQUIRED");
  if (!isAbsolute(backupPath) || !backupPath.endsWith(".dump")) throw new Error("RESTORE_DRILL_BACKUP_PATH_INVALID");
}

async function runPostgresTool(executable: "pg_dump" | "pg_restore", args: readonly string[],
  coordinates: PostgresCommandCoordinates): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [...args], { stdio: ["ignore", "ignore", "ignore"], env: {
      ...process.env, PGPASSWORD: coordinates.password,
      ...(coordinates.sslMode ? { PGSSLMODE: coordinates.sslMode } : {}),
    } });
    child.once("error", () => reject(new Error(`${executable.toUpperCase()}_START_FAILED`)));
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${executable.toUpperCase()}_FAILED`)));
  });
}

export async function runPostgresRestoreDrill(input: {
  readonly sourceUrl: string; readonly targetUrl: string; readonly backupPath: string;
}): Promise<{ readonly schemaVersion: 1; readonly status: "PASS"; readonly backupDigest: string }> {
  const source = postgresCommandCoordinates(input.sourceUrl);
  const target = postgresCommandCoordinates(input.targetUrl);
  assertRestoreDrillBoundary(source, target, input.backupPath);
  await access(input.backupPath).then(
    () => { throw new Error("RESTORE_DRILL_BACKUP_ALREADY_EXISTS"); },
    (error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; },
  );
  const targetSql = postgres(input.targetUrl, { max: 1, connect_timeout: 10 });
  try {
    const rows = await targetSql<{ count: string }[]>`
      select count(*)::text as count from information_schema.tables
      where table_schema not in ('pg_catalog', 'information_schema')
    `;
    if (Number(rows[0]?.count ?? 0) !== 0) throw new Error("RESTORE_DRILL_TARGET_NOT_EMPTY");
  } finally {
    await targetSql.end();
  }
  await runPostgresTool("pg_dump", ["--format=custom", "--no-owner", "--no-privileges",
    "--file", input.backupPath, "--host", source.host, "--port", source.port,
    "--username", source.user, source.database], source);
  await runPostgresTool("pg_restore", ["--exit-on-error", "--no-owner", "--no-privileges",
    "--host", target.host, "--port", target.port, "--username", target.user,
    "--dbname", target.database, input.backupPath], target);
  const restored = createCompanyDatabase(input.targetUrl);
  try { await restored.ping(); await restored.checkSchema(); } finally { await restored.close(); }
  const backupDigest = `sha256:${createHash("sha256").update(await readFile(input.backupPath)).digest("hex")}`;
  return { schemaVersion: 1, status: "PASS", backupDigest };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const sourceUrl = process.env.COMPANY_OS_SOURCE_DATABASE_URL;
  const targetUrl = process.env.COMPANY_OS_RESTORE_DATABASE_URL;
  const backupPath = process.env.COMPANY_OS_BACKUP_PATH;
  if (!sourceUrl || !targetUrl || !backupPath) throw new Error("RESTORE_DRILL_CONFIGURATION_REQUIRED");
  process.stdout.write(`${JSON.stringify(await runPostgresRestoreDrill({ sourceUrl, targetUrl, backupPath }))}\n`);
}
