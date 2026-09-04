import { createDecipheriv, createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { spawn } from "node:child_process";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import postgres from "postgres";
import { readSecretFileEnvironment } from "../adapters/config/secret-file-environment.ts";
import { createCompanyDatabase } from "../adapters/persistence/postgres/company-database.ts";
import {
  backupEncryptionKey,
  backupManifestAuthenticatedData,
  parseEncryptedBackupManifest,
  type EncryptedBackupManifest,
} from "./postgres-encrypted-backup.ts";
import { postgresCommandCoordinates } from "./postgres-restore-drill.ts";

export function assertEncryptedRestoreTarget(targetUrl: string, backupPath: string): void {
  const target = postgresCommandCoordinates(targetUrl);
  if (!/(?:restore|drill|test)/i.test(target.database)) throw new Error("ENCRYPTED_RESTORE_TARGET_NAME_REQUIRED");
  if (!isAbsolute(backupPath) || !backupPath.endsWith(".dump.enc")) {
    throw new Error("ENCRYPTED_RESTORE_BACKUP_PATH_INVALID");
  }
}

export function encryptedRestoreSchemaValidation(
  value: string | undefined,
): "CURRENT" | "CONNECTIVITY_ONLY" {
  const normalized = value?.trim() || "CURRENT";
  if (normalized !== "CURRENT" && normalized !== "CONNECTIVITY_ONLY") {
    throw new Error("ENCRYPTED_RESTORE_SCHEMA_VALIDATION_INVALID");
  }
  return normalized;
}

function decipher(manifest: EncryptedBackupManifest, key: Buffer) {
  const value = createDecipheriv("aes-256-gcm", key, Buffer.from(manifest.iv, "base64"));
  value.setAAD(backupManifestAuthenticatedData(manifest));
  value.setAuthTag(Buffer.from(manifest.authenticationTag, "base64"));
  return value;
}

async function authenticateBackup(path: string, manifest: EncryptedBackupManifest, key: Buffer): Promise<void> {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    hash.update(buffer);
  }
  if (bytes !== manifest.ciphertextBytes || `sha256:${hash.digest("hex")}` !== manifest.ciphertextDigest) {
    throw new Error("BACKUP_CIPHERTEXT_INVALID");
  }
  try {
    await pipeline(createReadStream(path), decipher(manifest, key), new Writable({ write(_chunk, _encoding, done) { done(); } }));
  } catch {
    throw new Error("BACKUP_CIPHERTEXT_INVALID");
  }
}

async function assertEmptyTarget(targetUrl: string): Promise<void> {
  const sql = postgres(targetUrl, { max: 1, connect_timeout: 10 });
  try {
    const rows = await sql<{ count: string }[]>`
      select count(*)::text as count from information_schema.tables
      where table_schema not in ('pg_catalog', 'information_schema')
    `;
    if (Number(rows[0]?.count ?? 0) !== 0) throw new Error("ENCRYPTED_RESTORE_TARGET_NOT_EMPTY");
  } finally {
    await sql.end();
  }
}

export async function runEncryptedPostgresRestoreDrill(input: {
  readonly targetUrl: string;
  readonly backupPath: string;
  readonly encryptionKey: Buffer;
  readonly schemaValidation?: "CURRENT" | "CONNECTIVITY_ONLY";
}): Promise<{ readonly schemaVersion: 1; readonly status: "PASS"; readonly ciphertextDigest: string }> {
  assertEncryptedRestoreTarget(input.targetUrl, input.backupPath);
  if (input.encryptionKey.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY_INVALID");
  if (input.schemaValidation !== undefined &&
      input.schemaValidation !== "CURRENT" && input.schemaValidation !== "CONNECTIVITY_ONLY") {
    throw new Error("ENCRYPTED_RESTORE_SCHEMA_VALIDATION_INVALID");
  }
  const manifest = parseEncryptedBackupManifest(await readFile(`${input.backupPath}.json`, "utf8"));
  const details = await stat(input.backupPath);
  if (!details.isFile() || details.size !== manifest.ciphertextBytes) throw new Error("BACKUP_CIPHERTEXT_INVALID");
  await authenticateBackup(input.backupPath, manifest, input.encryptionKey);
  await assertEmptyTarget(input.targetUrl);

  const target = postgresCommandCoordinates(input.targetUrl);
  const child = spawn("pg_restore", ["--exit-on-error", "--no-owner", "--no-privileges",
    "--host", target.host, "--port", target.port, "--username", target.user,
    "--dbname", target.database], {
    stdio: ["pipe", "ignore", "ignore"],
    env: { ...process.env, PGPASSWORD: target.password,
      ...(target.sslMode ? { PGSSLMODE: target.sslMode } : {}) },
  });
  const childExit = new Promise<void>((resolve, reject) => {
    child.once("error", () => reject(new Error("PG_RESTORE_START_FAILED")));
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("PG_RESTORE_FAILED")));
  });
  try {
    await Promise.all([
      pipeline(createReadStream(input.backupPath), decipher(manifest, input.encryptionKey), child.stdin),
      childExit,
    ]);
  } catch (error) {
    child.kill("SIGTERM");
    throw error;
  }
  const restored = createCompanyDatabase(input.targetUrl);
  try {
    await restored.ping();
    if ((input.schemaValidation ?? "CURRENT") === "CURRENT") await restored.checkSchema();
  } finally { await restored.close(); }
  return { schemaVersion: 1, status: "PASS", ciphertextDigest: manifest.ciphertextDigest };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const targetUrl = await readSecretFileEnvironment("COMPANY_OS_RESTORE_DATABASE_URL");
  const backupPath = process.env.COMPANY_OS_ENCRYPTED_BACKUP_PATH;
  const encryptionKey = await readSecretFileEnvironment("COMPANY_OS_BACKUP_ENCRYPTION_KEY");
  if (!targetUrl || !backupPath || !encryptionKey) {
    throw new Error("ENCRYPTED_RESTORE_CONFIGURATION_REQUIRED");
  }
  const result = await runEncryptedPostgresRestoreDrill({
    targetUrl,
    backupPath,
    encryptionKey: backupEncryptionKey(encryptionKey),
    schemaValidation: encryptedRestoreSchemaValidation(
      process.env.COMPANY_OS_RESTORE_SCHEMA_VALIDATION,
    ),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
