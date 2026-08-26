import {
  loadS3BackupConfiguration,
  retrieveEncryptedBackup,
  S3BackupObjectStore,
} from "./offsite-encrypted-backup.ts";

async function main(): Promise<void> {
  const manifestKey = process.env.COMPANY_OS_OFFSITE_BACKUP_MANIFEST_KEY;
  const destinationDirectory = process.env.COMPANY_OS_OFFSITE_RESTORE_DIRECTORY;
  const configuration = await loadS3BackupConfiguration(process.env);
  if (!configuration || !manifestKey || !destinationDirectory) {
    throw new Error("OFFSITE_BACKUP_RETRIEVAL_CONFIGURATION_REQUIRED");
  }
  const store = new S3BackupObjectStore(configuration);
  try {
    const result = await retrieveEncryptedBackup({
      manifestKey,
      destinationDirectory,
      destination: configuration.destination,
      store,
    });
    process.stdout.write(`${JSON.stringify({
      schemaVersion: result.schemaVersion,
      status: result.status,
      ciphertextDigest: result.ciphertextDigest,
      ciphertextPath: result.ciphertextPath,
      manifestPath: result.manifestPath,
    })}\n`);
  } finally {
    store.destroy();
  }
}

try { await main(); } catch {
  process.stderr.write(`${JSON.stringify({
    schemaVersion: 1,
    status: "FAIL",
    code: "OFFSITE_BACKUP_RETRIEVAL_FAILED",
  })}\n`);
  process.exitCode = 1;
}
