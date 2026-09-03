import assert from "node:assert/strict";
import test from "node:test";
import { createTenantSecretEnvelope } from "../adapters/security/tenant-secret-envelope.ts";

const createdAt = "2026-09-03T04:30:00.000Z";

test("tenant App Secret is stored only as tenant- and purpose-bound AES-256-GCM ciphertext", () => {
  const envelope = createTenantSecretEnvelope({
    activeKeyVersion: "key-2026-09",
    keys: new Map([["key-2026-09", Buffer.alloc(32, 1)]]),
    randomBytes: (length) => Buffer.alloc(length, 7),
  });
  const record = envelope.seal({
    id: "tenant-secret-one",
    ownerReference: "identity-binding-one",
    purpose: "IDENTITY_PROVIDER_CLIENT_SECRET",
    plaintext: "feishu-super-secret-value",
    createdAt,
  });

  assert.deepEqual({
    schemaVersion: record.schemaVersion,
    algorithm: record.algorithm,
    keyVersion: record.keyVersion,
    ownerReference: record.ownerReference,
    purpose: record.purpose,
  }, {
    schemaVersion: 1,
    algorithm: "AES-256-GCM",
    keyVersion: "key-2026-09",
    ownerReference: "identity-binding-one",
    purpose: "IDENTITY_PROVIDER_CLIENT_SECRET",
  });
  assert.equal(JSON.stringify(record).includes("feishu-super-secret-value"), false);
  assert.equal(envelope.open(record, {
    ownerReference: "identity-binding-one",
    purpose: "IDENTITY_PROVIDER_CLIENT_SECRET",
  }), "feishu-super-secret-value");
});

test("tenant secret fails closed for a different owner or purpose", () => {
  const envelope = createTenantSecretEnvelope({
    activeKeyVersion: "key-one",
    keys: new Map([["key-one", Buffer.alloc(32, 2)]]),
    randomBytes: (length) => Buffer.alloc(length, 3),
  });
  const record = envelope.seal({
    id: "tenant-secret-one",
    ownerReference: "identity-binding-one",
    purpose: "IDENTITY_PROVIDER_CLIENT_SECRET",
    plaintext: "secret-value",
    createdAt,
  });
  assert.throws(() => envelope.open(record, {
    ownerReference: "identity-binding-two",
    purpose: "IDENTITY_PROVIDER_CLIENT_SECRET",
  }), /TENANT_SECRET_DECRYPTION_FAILED/);
  assert.throws(() => envelope.open(record, {
    ownerReference: "identity-binding-one",
    purpose: "IDENTITY_PROVIDER_REFRESH_SECRET",
  }), /TENANT_SECRET_DECRYPTION_FAILED/);
});

test("tenant secret rejects ciphertext, nonce, tag, and key-version tampering with one generic error", () => {
  const envelope = createTenantSecretEnvelope({
    activeKeyVersion: "key-one",
    keys: new Map([["key-one", Buffer.alloc(32, 4)]]),
    randomBytes: (length) => Buffer.alloc(length, 5),
  });
  const record = envelope.seal({
    id: "tenant-secret-one",
    ownerReference: "identity-binding-one",
    purpose: "IDENTITY_PROVIDER_CLIENT_SECRET",
    plaintext: "secret-value",
    createdAt,
  });
  const context = {
    ownerReference: "identity-binding-one",
    purpose: "IDENTITY_PROVIDER_CLIENT_SECRET" as const,
  };
  for (const tampered of [
    { ...record, ciphertext: `${record.ciphertext.slice(0, -1)}A` },
    { ...record, nonce: `${record.nonce.slice(0, -1)}A` },
    { ...record, authenticationTag: `${record.authenticationTag.slice(0, -1)}A` },
    { ...record, keyVersion: "key-missing" },
  ]) {
    assert.throws(() => envelope.open(tampered, context), /TENANT_SECRET_DECRYPTION_FAILED/);
  }
});

test("key rotation writes with the active version while retaining bounded old-key decryption", () => {
  const oldOnly = createTenantSecretEnvelope({
    activeKeyVersion: "key-old",
    keys: new Map([["key-old", Buffer.alloc(32, 8)]]),
    randomBytes: (length) => Buffer.alloc(length, 6),
  });
  const oldRecord = oldOnly.seal({
    id: "tenant-secret-old",
    ownerReference: "identity-binding-one",
    purpose: "IDENTITY_PROVIDER_CLIENT_SECRET",
    plaintext: "old-secret",
    createdAt,
  });
  const rotating = createTenantSecretEnvelope({
    activeKeyVersion: "key-new",
    keys: new Map([
      ["key-old", Buffer.alloc(32, 8)],
      ["key-new", Buffer.alloc(32, 9)],
    ]),
    randomBytes: (length) => Buffer.alloc(length, 10),
  });
  assert.equal(rotating.open(oldRecord, {
    ownerReference: "identity-binding-one",
    purpose: "IDENTITY_PROVIDER_CLIENT_SECRET",
  }), "old-secret");
  assert.equal(rotating.seal({
    id: "tenant-secret-new",
    ownerReference: "identity-binding-one",
    purpose: "IDENTITY_PROVIDER_CLIENT_SECRET",
    plaintext: "new-secret",
    createdAt,
  }).keyVersion, "key-new");
});

test("invalid key material and oversized plaintext are rejected before encryption", () => {
  assert.throws(() => createTenantSecretEnvelope({
    activeKeyVersion: "key-one",
    keys: new Map([["key-one", Buffer.alloc(31)]]),
  }), /TENANT_SECRET_MASTER_KEY_INVALID/);
  const envelope = createTenantSecretEnvelope({
    activeKeyVersion: "key-one",
    keys: new Map([["key-one", Buffer.alloc(32)]]),
  });
  assert.throws(() => envelope.seal({
    id: "tenant-secret-one",
    ownerReference: "identity-binding-one",
    purpose: "IDENTITY_PROVIDER_CLIENT_SECRET",
    plaintext: "x".repeat(4_097),
    createdAt,
  }), /TENANT_SECRET_PLAINTEXT_INVALID/);
});
