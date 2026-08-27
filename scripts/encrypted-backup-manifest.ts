const ALGORITHM = "aes-256-gcm" as const;

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
