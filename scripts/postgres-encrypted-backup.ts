import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { setTimeout as delay } from "node:timers/promises";
import { postgresCommandCoordinates } from "./postgres-restore-drill.ts";

const ALGORITHM = "aes-256-gcm" as const;
const DEFAULT_INTERVAL_SECONDS = 86_400;
const MINIMUM_INTERVAL_SECONDS = 3_600;
const MAXIMUM_INTERVAL_SECONDS = 31 * 86_400;

export interface EncryptedBackupManifest {
  readonly schemaVersion: 1;
  readonly algorithm: typeof ALGORITHM;
  readonly iv: string;
  readonly authenticationTag: string;
  readonly ciphertextDigest: `sha256:${string}`;
  readonly ciphertextBytes: number;
  readonly createdAt: string;
}

const MANIFEST_KEYS = new Set([
  "schemaVersion", "algorithm", "iv", "authenticationTag", "ciphertextDigest",
  "ciphertextBytes", "createdAt",
]);
const SHA256 = /^sha256:[a-f0-9]{64}$/;

function exactBase64(value: unknown, bytes: number): value is string {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return false;
  }
  const decoded = Buffer.from(value, "base64");
  return decoded.length === bytes && decoded.toString("base64") === value;
}

export function backupManifestAuthenticatedData(manifest: Pick<EncryptedBackupManifest,
  "schemaVersion" | "algorithm" | "iv" | "createdAt">): Buffer {
  return Buffer.from(JSON.stringify([
    manifest.schemaVersion, manifest.algorithm, manifest.iv, manifest.createdAt,
  ]), "utf8");
}

export function parseEncryptedBackupManifest(source: string): EncryptedBackupManifest {
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new Error("BACKUP_MANIFEST_INVALID"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("BACKUP_MANIFEST_INVALID");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !MANIFEST_KEYS.has(key)) ||
      Object.keys(record).length !== MANIFEST_KEYS.size ||
      record.schemaVersion !== 1 || record.algorithm !== ALGORITHM ||
      !exactBase64(record.iv, 12) || !exactBase64(record.authenticationTag, 16) ||
      typeof record.ciphertextDigest !== "string" || !SHA256.test(record.ciphertextDigest) ||
      !Number.isSafeInteger(record.ciphertextBytes) || (record.ciphertextBytes as number) < 1 ||
      typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt))) {
    throw new Error("BACKUP_MANIFEST_INVALID");
  }
  return record as unknown as EncryptedBackupManifest;
}

export function backupEncryptionKey(value: string | undefined): Buffer {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error("BACKUP_ENCRYPTION_KEY_INVALID");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) throw new Error("BACKUP_ENCRYPTION_KEY_INVALID");
  return key;
}

export function scheduledBackupIntervalMs(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_INTERVAL_SECONDS * 1_000;
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds) || seconds < MINIMUM_INTERVAL_SECONDS || seconds > MAXIMUM_INTERVAL_SECONDS) {
    throw new Error("BACKUP_INTERVAL_INVALID");
  }
  return seconds * 1_000;
}

/** Pure admission helper; production uses the same algorithm in streaming form. */
export function encryptedBackupEnvelope(plaintext: Buffer, key: Buffer, iv = randomBytes(12)) {
  if (key.length !== 32 || iv.length !== 12) throw new Error("BACKUP_ENCRYPTION_INPUT_INVALID");
  const createdAt = "1970-01-01T00:00:00.000Z";
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(backupManifestAuthenticatedData({ schemaVersion: 1, algorithm: ALGORITHM,
    iv: iv.toString("base64"), createdAt }));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const manifest: EncryptedBackupManifest = {
    schemaVersion: 1,
    algorithm: ALGORITHM,
    iv: iv.toString("base64"),
    authenticationTag: cipher.getAuthTag().toString("base64"),
    ciphertextDigest: `sha256:${createHash("sha256").update(ciphertext).digest("hex")}`,
    ciphertextBytes: ciphertext.length,
    createdAt,
  };
  return { algorithm: ALGORITHM, ciphertext, manifest };
}

export function decryptBackupEnvelope(ciphertext: Buffer, manifest: EncryptedBackupManifest, key: Buffer): Buffer {
  const digest = `sha256:${createHash("sha256").update(ciphertext).digest("hex")}`;
  if (key.length !== 32 || ciphertext.length !== manifest.ciphertextBytes || digest !== manifest.ciphertextDigest) {
    throw new Error("BACKUP_CIPHERTEXT_INVALID");
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(manifest.iv, "base64"));
    decipher.setAAD(backupManifestAuthenticatedData(manifest));
    decipher.setAuthTag(Buffer.from(manifest.authenticationTag, "base64"));
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error("BACKUP_CIPHERTEXT_INVALID");
  }
}

async function sha256File(path: string): Promise<{ digest: `sha256:${string}`; bytes: number }> {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    hash.update(buffer);
  }
  return { digest: `sha256:${hash.digest("hex")}`, bytes };
}

export async function createEncryptedPostgresBackup(input: {
  readonly databaseUrl: string;
  readonly outputDirectory: string;
  readonly encryptionKey: Buffer;
  readonly now?: () => Date;
}): Promise<{ readonly schemaVersion: 1; readonly status: "PASS"; readonly ciphertextDigest: string }> {
  if (!isAbsolute(input.outputDirectory)) throw new Error("BACKUP_DIRECTORY_INVALID");
  if (input.encryptionKey.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY_INVALID");
  const coordinates = postgresCommandCoordinates(input.databaseUrl);
  const createdAt = (input.now ?? (() => new Date()))();
  if (!Number.isFinite(createdAt.getTime())) throw new Error("BACKUP_TIME_INVALID");
  await mkdir(input.outputDirectory, { recursive: true, mode: 0o700 });
  const timestamp = createdAt.toISOString().replace(/[-:.]/g, "");
  const nonce = randomBytes(4).toString("hex");
  const stem = `company-os-${timestamp}-${nonce}`;
  const ciphertextPath = join(input.outputDirectory, `${stem}.dump.enc`);
  const partialPath = join(input.outputDirectory, `.${stem}.partial`);
  const manifestPath = `${ciphertextPath}.json`;
  const manifestPartialPath = `${partialPath}.json`;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, input.encryptionKey, iv);
  cipher.setAAD(backupManifestAuthenticatedData({ schemaVersion: 1, algorithm: ALGORITHM,
    iv: iv.toString("base64"), createdAt: createdAt.toISOString() }));
  const child = spawn("pg_dump", ["--format=custom", "--no-owner", "--no-privileges",
    "--host", coordinates.host, "--port", coordinates.port, "--username", coordinates.user,
    coordinates.database], {
    stdio: ["ignore", "pipe", "ignore"],
    env: { ...process.env, PGPASSWORD: coordinates.password,
      ...(coordinates.sslMode ? { PGSSLMODE: coordinates.sslMode } : {}) },
  });
  const childExit = new Promise<void>((resolve, reject) => {
    child.once("error", () => reject(new Error("PG_DUMP_START_FAILED")));
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("PG_DUMP_FAILED")));
  });
  try {
    await Promise.all([
      pipeline(child.stdout, cipher, createWriteStream(partialPath, { flags: "wx", mode: 0o600 })),
      childExit,
    ]);
    const encrypted = await sha256File(partialPath);
    const manifest: EncryptedBackupManifest = {
      schemaVersion: 1,
      algorithm: ALGORITHM,
      iv: iv.toString("base64"),
      authenticationTag: cipher.getAuthTag().toString("base64"),
      ciphertextDigest: encrypted.digest,
      ciphertextBytes: encrypted.bytes,
      createdAt: createdAt.toISOString(),
    };
    await writeFile(manifestPartialPath, `${JSON.stringify(manifest)}\n`, { flag: "wx", mode: 0o600 });
    await rename(partialPath, ciphertextPath);
    await rename(manifestPartialPath, manifestPath);
    return { schemaVersion: 1, status: "PASS", ciphertextDigest: encrypted.digest };
  } catch (error) {
    child.kill("SIGTERM");
    await Promise.all([rm(partialPath, { force: true }), rm(manifestPartialPath, { force: true })]);
    throw error;
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.COMPANY_OS_DATABASE_URL;
  const outputDirectory = process.env.COMPANY_OS_BACKUP_DIRECTORY;
  if (!databaseUrl || !outputDirectory) throw new Error("BACKUP_CONFIGURATION_REQUIRED");
  const encryptionKey = backupEncryptionKey(process.env.COMPANY_OS_BACKUP_ENCRYPTION_KEY);
  const intervalMs = scheduledBackupIntervalMs(process.env.COMPANY_OS_BACKUP_INTERVAL_SECONDS);
  let stopping = false;
  const shutdown = new AbortController();
  process.once("SIGINT", () => { stopping = true; shutdown.abort(); });
  process.once("SIGTERM", () => { stopping = true; shutdown.abort(); });
  do {
    try {
      const result = await createEncryptedPostgresBackup({ databaseUrl, outputDirectory, encryptionKey });
      process.stdout.write(`${JSON.stringify({ event: "company_os.encrypted_backup_completed", ...result })}\n`);
    } catch {
      process.stderr.write(`${JSON.stringify({ event: "company_os.encrypted_backup_failed", code: "ENCRYPTED_BACKUP_FAILED" })}\n`);
      if (process.env.COMPANY_OS_BACKUP_RUN_MODE === "once") process.exitCode = 1;
    }
    if (process.env.COMPANY_OS_BACKUP_RUN_MODE === "once" || stopping) break;
    try {
      await delay(intervalMs, undefined, { signal: shutdown.signal });
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "AbortError") throw error;
    }
  } while (!stopping);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) await main();
