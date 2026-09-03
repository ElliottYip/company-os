import { createCipheriv, createDecipheriv, randomBytes as secureRandomBytes } from "node:crypto";
import type { EncryptedTenantSecret, TenantSecretPurpose } from "../../ports/tenant-secret-store-port.ts";

const PORTABLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MAXIMUM_PLAINTEXT_BYTES = 4_096;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

function portableId(value: string, code: string): string {
  const normalized = value.trim();
  if (!PORTABLE_ID.test(normalized)) throw new Error(code);
  return normalized;
}
function purpose(value: TenantSecretPurpose): TenantSecretPurpose {
  if (value !== "IDENTITY_PROVIDER_CLIENT_SECRET" && value !== "IDENTITY_PROVIDER_REFRESH_SECRET") {
    throw new Error("TENANT_SECRET_PURPOSE_INVALID");
  }
  return value;
}

function exactIsoInstant(value: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new Error("TENANT_SECRET_CREATED_AT_INVALID");
  }
  return value;
}

function decode(value: string, expectedBytes?: number): Buffer {
  if (!BASE64URL.test(value)) throw new Error("INVALID_ENVELOPE");
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value || (expectedBytes !== undefined && decoded.length !== expectedBytes)) {
    throw new Error("INVALID_ENVELOPE");
  }
  return decoded;
}

function authenticatedData(input: {
  readonly id: string;
  readonly ownerReference: string;
  readonly purpose: TenantSecretPurpose;
  readonly keyVersion: string;
}): Buffer {
  return Buffer.from([
    "company-os-tenant-secret-v1",
    input.id,
    input.ownerReference,
    input.purpose,
    input.keyVersion,
  ].join("\0"), "utf8");
}

export function createTenantSecretEnvelope(input: {
  readonly activeKeyVersion: string;
  readonly keys: ReadonlyMap<string, Buffer>;
  readonly randomBytes?: (length: number) => Buffer;
}) {
  const activeKeyVersion = portableId(input.activeKeyVersion, "TENANT_SECRET_KEY_VERSION_INVALID");
  if (input.keys.size < 1 || input.keys.size > 8) throw new Error("TENANT_SECRET_MASTER_KEY_INVALID");
  const keys = new Map<string, Buffer>();
  for (const [rawVersion, rawKey] of input.keys) {
    const version = portableId(rawVersion, "TENANT_SECRET_KEY_VERSION_INVALID");
    if (!Buffer.isBuffer(rawKey) || rawKey.length !== 32) throw new Error("TENANT_SECRET_MASTER_KEY_INVALID");
    keys.set(version, Buffer.from(rawKey));
  }
  if (!keys.has(activeKeyVersion)) throw new Error("TENANT_SECRET_ACTIVE_KEY_MISSING");
  const randomBytes = input.randomBytes ?? secureRandomBytes;

  return {
    seal(raw: {
      readonly id: string;
      readonly ownerReference: string;
      readonly purpose: TenantSecretPurpose;
      readonly plaintext: string;
      readonly createdAt: string;
    }): EncryptedTenantSecret {
      const id = portableId(raw.id, "TENANT_SECRET_ID_INVALID");
      const ownerReference = portableId(raw.ownerReference, "TENANT_SECRET_OWNER_INVALID");
      const secretPurpose = purpose(raw.purpose);
      const createdAt = exactIsoInstant(raw.createdAt);
      const plaintext = Buffer.from(raw.plaintext, "utf8");
      if (plaintext.length < 1 || plaintext.length > MAXIMUM_PLAINTEXT_BYTES) {
        throw new Error("TENANT_SECRET_PLAINTEXT_INVALID");
      }
      const nonce = randomBytes(NONCE_BYTES);
      if (!Buffer.isBuffer(nonce) || nonce.length !== NONCE_BYTES) throw new Error("TENANT_SECRET_NONCE_INVALID");
      const key = keys.get(activeKeyVersion);
      if (!key) throw new Error("TENANT_SECRET_ACTIVE_KEY_MISSING");
      const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: TAG_BYTES });
      cipher.setAAD(authenticatedData({ id, ownerReference, purpose: secretPurpose, keyVersion: activeKeyVersion }));
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const authenticationTag = cipher.getAuthTag();
      plaintext.fill(0);
      return {
        schemaVersion: 1,
        id,
        ownerReference,
        purpose: secretPurpose,
        algorithm: "AES-256-GCM",
        keyVersion: activeKeyVersion,
        nonce: nonce.toString("base64url"),
        ciphertext: ciphertext.toString("base64url"),
        authenticationTag: authenticationTag.toString("base64url"),
        createdAt,
      };
    },

    open(record: EncryptedTenantSecret, expected: {
      readonly ownerReference: string;
      readonly purpose: TenantSecretPurpose;
    }): string {
      try {
        if (record.schemaVersion !== 1 || record.algorithm !== "AES-256-GCM") throw new Error("INVALID_ENVELOPE");
        const id = portableId(record.id, "INVALID_ENVELOPE");
        const ownerReference = portableId(record.ownerReference, "INVALID_ENVELOPE");
        const secretPurpose = purpose(record.purpose);
        const keyVersion = portableId(record.keyVersion, "INVALID_ENVELOPE");
        exactIsoInstant(record.createdAt);
        if (ownerReference !== portableId(expected.ownerReference, "INVALID_ENVELOPE") ||
            secretPurpose !== purpose(expected.purpose)) throw new Error("INVALID_ENVELOPE");
        const key = keys.get(keyVersion);
        if (!key) throw new Error("INVALID_ENVELOPE");
        const nonce = decode(record.nonce, NONCE_BYTES);
        const ciphertext = decode(record.ciphertext);
        const authenticationTag = decode(record.authenticationTag, TAG_BYTES);
        if (ciphertext.length < 1 || ciphertext.length > MAXIMUM_PLAINTEXT_BYTES) throw new Error("INVALID_ENVELOPE");
        const decipher = createDecipheriv("aes-256-gcm", key, nonce, { authTagLength: TAG_BYTES });
        decipher.setAAD(authenticatedData({ id, ownerReference, purpose: secretPurpose, keyVersion }));
        decipher.setAuthTag(authenticationTag);
        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        const value = plaintext.toString("utf8");
        if (Buffer.byteLength(value, "utf8") !== plaintext.length) throw new Error("INVALID_ENVELOPE");
        plaintext.fill(0);
        return value;
      } catch {
        throw new Error("TENANT_SECRET_DECRYPTION_FAILED");
      }
    },
  };
}
