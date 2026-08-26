import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { link, lstat, mkdir, readFile, rm, stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { parseEncryptedBackupManifest } from "./postgres-encrypted-backup.ts";

const BUCKET = /^(?=.{3,63}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/;
const PREFIX = /^(?:[a-z0-9][a-z0-9._-]*)(?:\/[a-z0-9][a-z0-9._-]*)*$/;
const BACKUP_FILE = /^company-os-[0-9]{8}T[0-9]{9}Z-[a-f0-9]{8}\.dump\.enc$/;
const REGION = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const ACCESS_KEY = /^[A-Za-z0-9]{16,128}$/;
const SECRET_KEY = /^[\x21-\x7e]{16,512}$/;

export interface S3BackupConfiguration {
  readonly endpoint: string;
  readonly region: string;
  readonly destination: { readonly bucket: string; readonly prefix: string };
  readonly credentials: { readonly accessKeyId: string; readonly secretAccessKey: string };
}

export interface BackupObjectWrite {
  readonly bucket: string;
  readonly key: string;
  readonly bodyPath: string;
  readonly bytes: number;
  readonly contentType: "application/octet-stream" | "application/json";
  readonly metadata: Readonly<Record<string, string>>;
}

export interface BackupObjectStore {
  put(input: BackupObjectWrite): Promise<void>;
  head(input: { readonly bucket: string; readonly key: string }): Promise<{
    readonly bytes: number;
    readonly metadata: Readonly<Record<string, string>>;
  }>;
  get(input: { readonly bucket: string; readonly key: string; readonly destinationPath: string }): Promise<void>;
}

async function privateCredential(path: string | undefined, pattern: RegExp): Promise<string> {
  if (!path || !isAbsolute(path)) throw new Error("OFFSITE_BACKUP_CONFIGURATION_INVALID");
  const details = await stat(path).catch(() => undefined);
  if (!details?.isFile() || details.size < 1 || details.size > 4_096 || (details.mode & 0o077) !== 0) {
    throw new Error("OFFSITE_BACKUP_CREDENTIAL_FILE_UNSAFE");
  }
  const value = (await readFile(path, "utf8")).trim();
  if (!pattern.test(value)) throw new Error("OFFSITE_BACKUP_CREDENTIAL_INVALID");
  return value;
}

export async function loadS3BackupConfiguration(environment: NodeJS.ProcessEnv): Promise<S3BackupConfiguration | undefined> {
  const keys = ["COMPANY_OS_BACKUP_S3_ENDPOINT", "COMPANY_OS_BACKUP_S3_REGION",
    "COMPANY_OS_BACKUP_S3_BUCKET", "COMPANY_OS_BACKUP_S3_PREFIX"] as const;
  if (keys.every((key) => !environment[key])) return undefined;
  const endpointSource = environment.COMPANY_OS_BACKUP_S3_ENDPOINT;
  const region = environment.COMPANY_OS_BACKUP_S3_REGION;
  const bucket = environment.COMPANY_OS_BACKUP_S3_BUCKET;
  const prefix = environment.COMPANY_OS_BACKUP_S3_PREFIX || "backups";
  let endpoint: URL;
  try { endpoint = new URL(endpointSource ?? ""); } catch { throw new Error("OFFSITE_BACKUP_CONFIGURATION_INVALID"); }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.pathname !== "/" ||
      endpoint.search || endpoint.hash || !region || !REGION.test(region) || !bucket || !BUCKET.test(bucket) ||
      !PREFIX.test(prefix)) {
    throw new Error("OFFSITE_BACKUP_CONFIGURATION_INVALID");
  }
  const credentials = {
    accessKeyId: await privateCredential(environment.COMPANY_OS_BACKUP_S3_ACCESS_KEY_ID_FILE, ACCESS_KEY),
    secretAccessKey: await privateCredential(environment.COMPANY_OS_BACKUP_S3_SECRET_ACCESS_KEY_FILE, SECRET_KEY),
  };
  return { endpoint: endpoint.origin, region, destination: { bucket, prefix }, credentials };
}

export class S3BackupObjectStore implements BackupObjectStore {
  readonly #client: S3Client;

  constructor(configuration: Pick<S3BackupConfiguration, "endpoint" | "region" | "credentials">) {
    this.#client = new S3Client({
      endpoint: configuration.endpoint,
      region: configuration.region,
      credentials: configuration.credentials,
      forcePathStyle: true,
      maxAttempts: 3,
      requestChecksumCalculation: "WHEN_REQUIRED",
    });
  }

  async put(input: BackupObjectWrite): Promise<void> {
    try {
      await this.#client.send(new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        Body: createReadStream(input.bodyPath),
        ContentLength: input.bytes,
        ContentType: input.contentType,
        Metadata: input.metadata,
        IfNoneMatch: "*",
      }));
    } catch {
      throw new Error("OFFSITE_BACKUP_UPLOAD_FAILED");
    }
  }

  async head(input: { readonly bucket: string; readonly key: string }) {
    try {
      const result = await this.#client.send(new HeadObjectCommand({ Bucket: input.bucket, Key: input.key }));
      if (!Number.isSafeInteger(result.ContentLength) || (result.ContentLength ?? -1) < 0) {
        throw new Error("OFFSITE_BACKUP_REMOTE_VERIFICATION_FAILED");
      }
      return { bytes: result.ContentLength as number, metadata: result.Metadata ?? {} };
    } catch (error) {
      if (error instanceof Error && error.message === "OFFSITE_BACKUP_REMOTE_VERIFICATION_FAILED") throw error;
      throw new Error("OFFSITE_BACKUP_REMOTE_VERIFICATION_FAILED");
    }
  }

  async get(input: { readonly bucket: string; readonly key: string; readonly destinationPath: string }): Promise<void> {
    try {
      const result = await this.#client.send(new GetObjectCommand({ Bucket: input.bucket, Key: input.key }));
      if (!result.Body) throw new Error("OFFSITE_BACKUP_DOWNLOAD_FAILED");
      await pipeline(result.Body as NodeJS.ReadableStream,
        createWriteStream(input.destinationPath, { flags: "wx", mode: 0o600 }));
    } catch {
      await rm(input.destinationPath, { force: true });
      throw new Error("OFFSITE_BACKUP_DOWNLOAD_FAILED");
    }
  }

  destroy(): void { this.#client.destroy(); }
}

async function digestFile(path: string): Promise<{ readonly bytes: number; readonly hex: string }> {
  const details = await stat(path);
  if (!details.isFile() || details.size < 1) throw new Error("OFFSITE_BACKUP_SOURCE_INVALID");
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    const body = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    hash.update(body);
    bytes += body.length;
  }
  return { bytes, hex: hash.digest("hex") };
}

function exactMetadata(actual: Readonly<Record<string, string>>, expected: Readonly<Record<string, string>>): boolean {
  return Object.entries(expected).every(([key, value]) => actual[key] === value);
}

async function verifiedPut(store: BackupObjectStore, input: BackupObjectWrite): Promise<void> {
  await store.put(input);
  const remote = await store.head({ bucket: input.bucket, key: input.key });
  if (remote.bytes !== input.bytes || !exactMetadata(remote.metadata, input.metadata)) {
    throw new Error("OFFSITE_BACKUP_REMOTE_VERIFICATION_FAILED");
  }
}

export async function publishEncryptedBackup(input: {
  readonly ciphertextPath: string;
  readonly manifestPath: string;
  readonly destination: { readonly bucket: string; readonly prefix: string };
  readonly store: BackupObjectStore;
}): Promise<{
  readonly schemaVersion: 1;
  readonly status: "PASS";
  readonly ciphertextDigest: `sha256:${string}`;
  readonly ciphertextKey: string;
  readonly manifestKey: string;
}> {
  const { bucket, prefix } = input.destination;
  const filename = basename(input.ciphertextPath);
  if (!BUCKET.test(bucket) || !PREFIX.test(prefix) || !BACKUP_FILE.test(filename) ||
      input.manifestPath !== `${input.ciphertextPath}.json`) {
    throw new Error("OFFSITE_BACKUP_CONFIGURATION_INVALID");
  }

  const manifestDetails = await stat(input.manifestPath);
  if (!manifestDetails.isFile() || manifestDetails.size < 1 || manifestDetails.size > 16_384) {
    throw new Error("OFFSITE_BACKUP_SOURCE_INVALID");
  }
  const manifest = parseEncryptedBackupManifest(await readFile(input.manifestPath, "utf8"));
  const ciphertext = await digestFile(input.ciphertextPath);
  const digestHex = manifest.ciphertextDigest.slice("sha256:".length);
  if (ciphertext.bytes !== manifest.ciphertextBytes || ciphertext.hex !== digestHex) {
    throw new Error("OFFSITE_BACKUP_SOURCE_INVALID");
  }

  const date = new Date(manifest.createdAt);
  const datePrefix = `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}`;
  const ciphertextKey = `${prefix}/${datePrefix}/${filename}`;
  const manifestKey = `${ciphertextKey}.json`;
  const ciphertextMetadata = {
    "company-os-artifact": "encrypted-postgres-backup",
    "company-os-sha256": digestHex,
  } as const;
  const manifestMetadata = {
    "company-os-artifact": "encrypted-postgres-backup-manifest",
    "company-os-ciphertext-sha256": digestHex,
  } as const;

  await verifiedPut(input.store, {
    bucket,
    key: ciphertextKey,
    bodyPath: input.ciphertextPath,
    bytes: ciphertext.bytes,
    contentType: "application/octet-stream",
    metadata: ciphertextMetadata,
  });
  await verifiedPut(input.store, {
    bucket,
    key: manifestKey,
    bodyPath: input.manifestPath,
    bytes: manifestDetails.size,
    contentType: "application/json",
    metadata: manifestMetadata,
  });

  return {
    schemaVersion: 1,
    status: "PASS",
    ciphertextDigest: manifest.ciphertextDigest,
    ciphertextKey,
    manifestKey,
  };
}

export async function retrieveEncryptedBackup(input: {
  readonly manifestKey: string;
  readonly destinationDirectory: string;
  readonly destination: { readonly bucket: string; readonly prefix: string };
  readonly store: BackupObjectStore;
}): Promise<{
  readonly schemaVersion: 1;
  readonly status: "PASS";
  readonly ciphertextDigest: `sha256:${string}`;
  readonly ciphertextPath: string;
  readonly manifestPath: string;
}> {
  const { bucket, prefix } = input.destination;
  const relative = input.manifestKey.startsWith(`${prefix}/`) ? input.manifestKey.slice(prefix.length + 1) : "";
  const parts = relative.split("/");
  const manifestFilename = parts[3] ?? "";
  const filename = manifestFilename.endsWith(".json") ? manifestFilename.slice(0, -5) : "";
  if (!BUCKET.test(bucket) || !PREFIX.test(prefix) || !isAbsolute(input.destinationDirectory) || parts.length !== 4 ||
      !/^\d{4}$/.test(parts[0] ?? "") || !/^(?:0[1-9]|1[0-2])$/.test(parts[1] ?? "") ||
      !/^(?:0[1-9]|[12]\d|3[01])$/.test(parts[2] ?? "") || !BACKUP_FILE.test(filename)) {
    throw new Error("OFFSITE_BACKUP_CONFIGURATION_INVALID");
  }
  await mkdir(input.destinationDirectory, { recursive: true, mode: 0o700 });
  const directory = await lstat(input.destinationDirectory);
  if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o027) !== 0) {
    throw new Error("OFFSITE_BACKUP_DESTINATION_UNSAFE");
  }

  const nonce = randomBytes(6).toString("hex");
  const ciphertextPath = `${input.destinationDirectory}/${filename}`;
  const manifestPath = `${ciphertextPath}.json`;
  const ciphertextPartial = `${input.destinationDirectory}/.${filename}.${nonce}.partial`;
  const manifestPartial = `${ciphertextPartial}.json`;
  const ciphertextKey = input.manifestKey.slice(0, -5);
  try {
    const manifestHead = await input.store.head({ bucket, key: input.manifestKey });
    if (manifestHead.bytes < 1 || manifestHead.bytes > 16_384 ||
        manifestHead.metadata["company-os-artifact"] !== "encrypted-postgres-backup-manifest") {
      throw new Error("OFFSITE_BACKUP_REMOTE_OBJECT_INVALID");
    }
    await input.store.get({ bucket, key: input.manifestKey, destinationPath: manifestPartial });
    const manifestFile = await stat(manifestPartial);
    if (!manifestFile.isFile() || manifestFile.size !== manifestHead.bytes) {
      throw new Error("OFFSITE_BACKUP_REMOTE_OBJECT_INVALID");
    }
    const manifest = parseEncryptedBackupManifest(await readFile(manifestPartial, "utf8"));
    const digestHex = manifest.ciphertextDigest.slice("sha256:".length);
    if (manifestHead.metadata["company-os-ciphertext-sha256"] !== digestHex) {
      throw new Error("OFFSITE_BACKUP_REMOTE_OBJECT_INVALID");
    }

    const ciphertextHead = await input.store.head({ bucket, key: ciphertextKey });
    if (ciphertextHead.bytes !== manifest.ciphertextBytes ||
        ciphertextHead.metadata["company-os-artifact"] !== "encrypted-postgres-backup" ||
        ciphertextHead.metadata["company-os-sha256"] !== digestHex) {
      throw new Error("OFFSITE_BACKUP_REMOTE_OBJECT_INVALID");
    }
    await input.store.get({ bucket, key: ciphertextKey, destinationPath: ciphertextPartial });
    const ciphertext = await digestFile(ciphertextPartial);
    if (ciphertext.bytes !== manifest.ciphertextBytes || ciphertext.hex !== digestHex) {
      throw new Error("OFFSITE_BACKUP_REMOTE_OBJECT_INVALID");
    }

    await link(ciphertextPartial, ciphertextPath);
    try { await link(manifestPartial, manifestPath); } catch (error) {
      await rm(ciphertextPath, { force: true });
      throw error;
    }
    return { schemaVersion: 1, status: "PASS", ciphertextDigest: manifest.ciphertextDigest,
      ciphertextPath, manifestPath };
  } catch (error) {
    if (error instanceof Error && ["OFFSITE_BACKUP_CONFIGURATION_INVALID", "OFFSITE_BACKUP_DESTINATION_UNSAFE"]
      .includes(error.message)) throw error;
    throw new Error("OFFSITE_BACKUP_REMOTE_OBJECT_INVALID");
  } finally {
    await Promise.all([rm(ciphertextPartial, { force: true }), rm(manifestPartial, { force: true })]);
  }
}
