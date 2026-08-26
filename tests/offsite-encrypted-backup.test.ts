import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { EncryptedBackupManifest } from "../scripts/postgres-encrypted-backup.ts";
import {
  publishEncryptedBackup,
  loadS3BackupConfiguration,
  type BackupObjectStore,
  type BackupObjectWrite,
} from "../scripts/offsite-encrypted-backup.ts";

async function backupFixture() {
  const directory = await mkdtemp(join(tmpdir(), "company-os-offsite-backup-"));
  const ciphertext = Buffer.from("fixture encrypted bytes, never plaintext database data");
  const ciphertextPath = join(directory, "company-os-20260826T010203000Z-a1b2c3d4.dump.enc");
  const manifestPath = `${ciphertextPath}.json`;
  const manifest: EncryptedBackupManifest = {
    schemaVersion: 1,
    algorithm: "aes-256-gcm",
    iv: Buffer.alloc(12, 1).toString("base64"),
    authenticationTag: Buffer.alloc(16, 2).toString("base64"),
    ciphertextDigest: `sha256:${createHash("sha256").update(ciphertext).digest("hex")}`,
    ciphertextBytes: ciphertext.length,
    createdAt: "2026-08-26T01:02:03.000Z",
  };
  await writeFile(ciphertextPath, ciphertext, { mode: 0o600 });
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
  return { ciphertext, ciphertextPath, manifest, manifestPath };
}

class MemoryObjectStore implements BackupObjectStore {
  readonly writes: (Omit<BackupObjectWrite, "bodyPath"> & { readonly body: Buffer })[] = [];

  async put({ bodyPath, ...input }: BackupObjectWrite): Promise<void> {
    this.writes.push({ ...input, body: await readFile(bodyPath) });
  }

  async head(input: { readonly bucket: string; readonly key: string }) {
    const stored = this.writes.find((candidate) => candidate.bucket === input.bucket && candidate.key === input.key);
    if (!stored) throw new Error("OBJECT_NOT_FOUND");
    return { bytes: stored.body.length, metadata: stored.metadata };
  }
}

test("off-site publication verifies ciphertext and publishes its completion manifest last", async () => {
  const fixture = await backupFixture();
  const store = new MemoryObjectStore();

  const result = await publishEncryptedBackup({
    ciphertextPath: fixture.ciphertextPath,
    manifestPath: fixture.manifestPath,
    destination: { bucket: "company-os-staging-backup", prefix: "backups" },
    store,
  });

  assert.deepEqual(store.writes.map(({ key }) => key), [
    "backups/2026/08/26/company-os-20260826T010203000Z-a1b2c3d4.dump.enc",
    "backups/2026/08/26/company-os-20260826T010203000Z-a1b2c3d4.dump.enc.json",
  ]);
  assert.deepEqual(store.writes[0]?.body, fixture.ciphertext);
  assert.deepEqual(JSON.parse((store.writes[1]?.body ?? Buffer.alloc(0)).toString("utf8")), fixture.manifest);
  assert.deepEqual(store.writes[0]?.metadata, {
    "company-os-artifact": "encrypted-postgres-backup",
    "company-os-sha256": fixture.manifest.ciphertextDigest.slice("sha256:".length),
  });
  assert.equal(result.status, "PASS");
  assert.equal(result.ciphertextDigest, fixture.manifest.ciphertextDigest);
  assert.equal(result.ciphertextKey, store.writes[0]?.key);
  assert.equal(result.manifestKey, store.writes[1]?.key);
  assert.doesNotMatch(JSON.stringify(result), /fixture encrypted bytes/i);
});

test("off-site publication rejects tampering before writing either object", async () => {
  const fixture = await backupFixture();
  await writeFile(fixture.ciphertextPath, Buffer.from("tampered"), { mode: 0o600 });
  const store = new MemoryObjectStore();

  await assert.rejects(() => publishEncryptedBackup({
    ciphertextPath: fixture.ciphertextPath,
    manifestPath: fixture.manifestPath,
    destination: { bucket: "company-os-staging-backup", prefix: "backups" },
    store,
  }), /OFFSITE_BACKUP_SOURCE_INVALID/);
  assert.equal(store.writes.length, 0);
  assert.notEqual(await readFile(fixture.ciphertextPath, "utf8"), fixture.ciphertext.toString("utf8"));
});

test("off-site publication fails when remote verification does not match", async () => {
  const fixture = await backupFixture();
  const store = new MemoryObjectStore();
  store.head = async () => ({ bytes: 1, metadata: {} });

  await assert.rejects(() => publishEncryptedBackup({
    ciphertextPath: fixture.ciphertextPath,
    manifestPath: fixture.manifestPath,
    destination: { bucket: "company-os-staging-backup", prefix: "backups" },
    store,
  }), /OFFSITE_BACKUP_REMOTE_VERIFICATION_FAILED/);
  assert.equal(store.writes.length, 1, "completion manifest must not be published after failed ciphertext verification");
});

test("S3-compatible backup configuration reads credentials only from private files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-offsite-credentials-"));
  const accessKeyIdFile = join(directory, "access-key-id");
  const secretAccessKeyFile = join(directory, "secret-access-key");
  await writeFile(accessKeyIdFile, "FIXTUREACCESSKEY1234\n", { mode: 0o600 });
  await writeFile(secretAccessKeyFile, "fixture-secret-access-key-not-real\n", { mode: 0o600 });

  const configuration = await loadS3BackupConfiguration({
    COMPANY_OS_BACKUP_S3_ENDPOINT: "https://object-storage.example.test",
    COMPANY_OS_BACKUP_S3_REGION: "us-east-1",
    COMPANY_OS_BACKUP_S3_BUCKET: "company-os-staging-backup",
    COMPANY_OS_BACKUP_S3_PREFIX: "backups",
    COMPANY_OS_BACKUP_S3_ACCESS_KEY_ID_FILE: accessKeyIdFile,
    COMPANY_OS_BACKUP_S3_SECRET_ACCESS_KEY_FILE: secretAccessKeyFile,
  });

  assert.equal(configuration.endpoint, "https://object-storage.example.test");
  assert.equal(configuration.destination.bucket, "company-os-staging-backup");
  assert.equal(configuration.credentials.accessKeyId, "FIXTUREACCESSKEY1234");
  assert.equal(configuration.credentials.secretAccessKey, "fixture-secret-access-key-not-real");
  assert.doesNotMatch(JSON.stringify(configuration.destination), /FIXTUREACCESS|fixture-secret/);

  await chmod(secretAccessKeyFile, 0o644);
  await assert.rejects(() => loadS3BackupConfiguration({
    COMPANY_OS_BACKUP_S3_ENDPOINT: "https://object-storage.example.test",
    COMPANY_OS_BACKUP_S3_REGION: "us-east-1",
    COMPANY_OS_BACKUP_S3_BUCKET: "company-os-staging-backup",
    COMPANY_OS_BACKUP_S3_ACCESS_KEY_ID_FILE: accessKeyIdFile,
    COMPANY_OS_BACKUP_S3_SECRET_ACCESS_KEY_FILE: secretAccessKeyFile,
  }), /OFFSITE_BACKUP_CREDENTIAL_FILE_UNSAFE/);
});

test("S3-compatible backup configuration is either absent or complete and HTTPS", async () => {
  assert.equal(await loadS3BackupConfiguration({}), undefined);
  await assert.rejects(() => loadS3BackupConfiguration({
    COMPANY_OS_BACKUP_S3_ENDPOINT: "http://object-storage.example.test",
  }), /OFFSITE_BACKUP_CONFIGURATION_INVALID/);
  await assert.rejects(() => loadS3BackupConfiguration({
    COMPANY_OS_BACKUP_S3_ENDPOINT: "https://user:secret@object-storage.example.test",
  }), /OFFSITE_BACKUP_CONFIGURATION_INVALID/);
});
