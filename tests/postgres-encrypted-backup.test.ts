import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  backupEncryptionKey,
  decryptBackupEnvelope,
  encryptedBackupEnvelope,
  parseEncryptedBackupManifest,
  scheduledBackupIntervalMs,
} from "../scripts/postgres-encrypted-backup.ts";

test("backup encryption requires one deployment-injected 256-bit key", () => {
  const key = randomBytes(32);
  assert.deepEqual(backupEncryptionKey(key.toString("base64")), key);
  assert.throws(() => backupEncryptionKey("not-a-secret-key"), /BACKUP_ENCRYPTION_KEY_INVALID/);
  assert.throws(() => backupEncryptionKey(randomBytes(31).toString("base64")), /BACKUP_ENCRYPTION_KEY_INVALID/);
});

test("encrypted backup envelope is authenticated and contains no plaintext or key", () => {
  const key = Buffer.alloc(32, 7);
  const plaintext = Buffer.from("fixture database row: accountable-human-one");
  const iv = Buffer.alloc(12, 9);
  const envelope = encryptedBackupEnvelope(plaintext, key, iv);
  assert.equal(envelope.algorithm, "aes-256-gcm");
  assert.notEqual(envelope.ciphertext.toString("utf8"), plaintext.toString("utf8"));
  assert.doesNotMatch(JSON.stringify(envelope.manifest), /accountable-human-one|BwcHBwcH/);
  assert.deepEqual(decryptBackupEnvelope(envelope.ciphertext, envelope.manifest, key), plaintext);
});

test("scheduled backup interval is bounded away from accidental tight loops", () => {
  assert.equal(scheduledBackupIntervalMs(undefined), 86_400_000);
  assert.equal(scheduledBackupIntervalMs("3600"), 3_600_000);
  assert.throws(() => scheduledBackupIntervalMs("3599"), /BACKUP_INTERVAL_INVALID/);
  assert.throws(() => scheduledBackupIntervalMs("not-a-number"), /BACKUP_INTERVAL_INVALID/);
});

test("encrypted backup restore rejects ciphertext and manifest tampering", () => {
  const key = Buffer.alloc(32, 3);
  const plaintext = Buffer.from("fixture-only backup payload");
  const envelope = encryptedBackupEnvelope(plaintext, key, Buffer.alloc(12, 5));
  const parsed = parseEncryptedBackupManifest(JSON.stringify(envelope.manifest));
  assert.deepEqual(decryptBackupEnvelope(envelope.ciphertext, parsed, key), plaintext);

  const tamperedCiphertext = Buffer.from(envelope.ciphertext);
  tamperedCiphertext[0] = (tamperedCiphertext[0] ?? 0) ^ 1;
  assert.throws(() => decryptBackupEnvelope(tamperedCiphertext, parsed, key),
    /BACKUP_CIPHERTEXT_INVALID/);
  assert.throws(() => parseEncryptedBackupManifest(JSON.stringify({ ...envelope.manifest,
    algorithm: "aes-256-cbc" })), /BACKUP_MANIFEST_INVALID/);
  assert.throws(() => parseEncryptedBackupManifest(JSON.stringify({ ...envelope.manifest,
    unknown: "smuggled" })), /BACKUP_MANIFEST_INVALID/);
  assert.throws(() => decryptBackupEnvelope(envelope.ciphertext, {
    ...parsed, createdAt: "2026-08-25T23:59:59.000Z",
  }, key), /BACKUP_CIPHERTEXT_INVALID/);
});
