import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

const POSTGRES_IMAGE = "postgres:16.15-bookworm@sha256:bb3e1a57e5407e0a5280b4211980a5e537f4abd234a87014ac979849a78dd825";
const OPS_IMAGE = "company-os-ops:encrypted-backup-admission";
const suffix = randomBytes(6).toString("hex");
const password = randomBytes(32).toString("base64url");
const encryptionKey = randomBytes(32).toString("base64");
const marker = "encrypted-restore-" + suffix;
const network = "company-os-encrypted-backup-" + suffix;
const sourceContainer = "company-os-encrypted-source-" + suffix;
const targetContainer = "company-os-encrypted-target-" + suffix;
const backupVolume = "company-os-encrypted-backup-" + suffix;
const sourceDatabase = "company_os_source";
const targetDatabase = "company_os_encrypted_restore_drill";
const databaseUser = "company_os";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    const stdout = [];
    const stderr = [];
    child.stdout?.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", () => reject(new Error("ENCRYPTED_BACKUP_ADMISSION_PROCESS_START_FAILED")));
    child.once("exit", (code) => {
      const result = { code, stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8") };
      if (code === 0 || options.allowFailure) resolve(result);
      else reject(new Error("ENCRYPTED_BACKUP_ADMISSION_COMMAND_FAILED:" + command));
    });
  });
}

async function waitForPostgres(container) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await run("docker", ["exec", container, "pg_isready", "-U", databaseUser], { allowFailure: true });
    if (result.code === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("ENCRYPTED_BACKUP_ADMISSION_POSTGRES_TIMEOUT");
}

let cleaning = false;
async function cleanup() {
  if (cleaning) return;
  cleaning = true;
  await run("docker", ["rm", "--force", sourceContainer, targetContainer], { allowFailure: true });
  await run("docker", ["volume", "rm", "--force", backupVolume], { allowFailure: true });
  await run("docker", ["network", "rm", network], { allowFailure: true });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });
}

let currentStage = "BUILD_OPERATIONS_IMAGE";
try {
  await run("docker", ["build", "--file", "deploy/Dockerfile.ops", "--tag", OPS_IMAGE, "."]);
  currentStage = "CREATE_DISPOSABLE_RESOURCES";
  await run("docker", ["network", "create", network]);
  await run("docker", ["volume", "create", backupVolume]);
  currentStage = "START_DISPOSABLE_DATABASES";
  for (const [name, database] of [[sourceContainer, sourceDatabase], [targetContainer, targetDatabase]]) {
    await run("docker", ["run", "--detach", "--name", name, "--network", network,
      "--env", "POSTGRES_DB=" + database, "--env", "POSTGRES_USER=" + databaseUser,
      "--env", "POSTGRES_PASSWORD=" + password, POSTGRES_IMAGE]);
  }
  currentStage = "WAIT_FOR_DISPOSABLE_DATABASES";
  await Promise.all([waitForPostgres(sourceContainer), waitForPostgres(targetContainer)]);

  const sourceUrl = "postgres://" + databaseUser + ":" + password + "@" + sourceContainer + ":5432/" + sourceDatabase;
  const targetUrl = "postgres://" + databaseUser + ":" + password + "@" + targetContainer + ":5432/" + targetDatabase;
  currentStage = "MIGRATE_SOURCE_DATABASE";
  await run("docker", ["run", "--rm", "--network", network,
    "--env", "COMPANY_OS_DATABASE_URL=" + sourceUrl, OPS_IMAGE,
    "node", "--experimental-strip-types", "scripts/migrate-postgres.ts"]);

  const seedSql = [
    "INSERT INTO company_os_auth_user (id,name,email,email_verified,created_at,updated_at)",
    "VALUES ('encrypted-user','Encrypted backup admission','encrypted-" + suffix + "@integration.invalid',true,now(),now());",
    "INSERT INTO company_os_company (id,name,purpose,locale,default_responsible_user_id)",
    "VALUES ('encrypted-company','Encrypted backup admission','Verify authenticated disaster recovery','en-US','encrypted-user');",
    "INSERT INTO company_os_domain_event (id,company_id,sequence,type,occurred_at,actor_id,payload,provenance)",
    "VALUES ('encrypted-event','encrypted-company',1,'encrypted-backup.admission.recorded',now()::text,'encrypted-user','{\"marker\":\"" +
      marker + "\"}'::jsonb,'PRODUCTION');",
  ].join(" ");
  currentStage = "SEED_SOURCE_DATABASE";
  await run("docker", ["exec", "--env", "PGPASSWORD=" + password, sourceContainer,
    "psql", "--username", databaseUser, "--dbname", sourceDatabase,
    "--set", "ON_ERROR_STOP=1", "--command", seedSql]);

  currentStage = "PREPARE_BACKUP_VOLUME";
  await run("docker", ["run", "--rm", "--entrypoint", "sh", "--volume", backupVolume + ":/backup",
    POSTGRES_IMAGE, "-c", "chown 1000:1000 /backup"]);
  currentStage = "CREATE_ENCRYPTED_BACKUP";
  const backupRun = await run("docker", ["run", "--rm", "--network", network,
    "--volume", backupVolume + ":/backup",
    "--env", "COMPANY_OS_DATABASE_URL=" + sourceUrl,
    "--env", "COMPANY_OS_BACKUP_DIRECTORY=/backup",
    "--env", "COMPANY_OS_BACKUP_ENCRYPTION_KEY=" + encryptionKey,
    "--env", "COMPANY_OS_BACKUP_RUN_MODE=once", OPS_IMAGE,
    "node", "--experimental-strip-types", "scripts/postgres-encrypted-backup.ts"]);
  const backupResult = JSON.parse(backupRun.stdout.trim());
  if (backupResult.status !== "PASS" || !/^sha256:[a-f0-9]{64}$/.test(backupResult.ciphertextDigest)) {
    throw new Error("ENCRYPTED_BACKUP_ADMISSION_RESULT_INVALID");
  }

  currentStage = "VALIDATE_ENCRYPTED_ARTIFACTS";
  const listing = await run("docker", ["run", "--rm", "--volume", backupVolume + ":/backup",
    POSTGRES_IMAGE, "ls", "-1", "/backup"]);
  const entries = listing.stdout.trim().split("\n").filter(Boolean).sort();
  const encryptedName = entries.find((entry) => entry.endsWith(".dump.enc"));
  if (!encryptedName || entries.length !== 2 || !entries.includes(encryptedName + ".json") ||
      entries.some((entry) => entry.endsWith(".dump") || entry.endsWith(".partial"))) {
    throw new Error("ENCRYPTED_BACKUP_ADMISSION_ARTIFACTS_INVALID");
  }

  currentStage = "RESTORE_ENCRYPTED_BACKUP";
  const restoreRun = await run("docker", ["run", "--rm", "--network", network,
    "--volume", backupVolume + ":/backup:ro",
    "--env", "COMPANY_OS_RESTORE_DATABASE_URL=" + targetUrl,
    "--env", "COMPANY_OS_ENCRYPTED_BACKUP_PATH=/backup/" + encryptedName,
    "--env", "COMPANY_OS_BACKUP_ENCRYPTION_KEY=" + encryptionKey, OPS_IMAGE,
    "node", "--experimental-strip-types", "scripts/postgres-encrypted-restore-drill.ts"]);
  const restoreResult = JSON.parse(restoreRun.stdout.trim());
  if (restoreResult.status !== "PASS" || restoreResult.ciphertextDigest !== backupResult.ciphertextDigest) {
    throw new Error("ENCRYPTED_RESTORE_ADMISSION_RESULT_INVALID");
  }

  currentStage = "VERIFY_RESTORED_DATA";
  const restored = await run("docker", ["exec", "--env", "PGPASSWORD=" + password, targetContainer,
    "psql", "--tuples-only", "--no-align", "--username", databaseUser, "--dbname", targetDatabase,
    "--command", "SELECT payload->>'marker' FROM company_os_domain_event WHERE id='encrypted-event';"]);
  if (restored.stdout.trim() !== marker) throw new Error("ENCRYPTED_RESTORE_ADMISSION_DATA_MISMATCH");
  process.stdout.write(JSON.stringify({ schemaVersion: 1, status: "PASS",
    ciphertextDigest: backupResult.ciphertextDigest, plaintextArtifacts: 0 }) + "\n");
} catch (error) {
  throw new Error(`ENCRYPTED_BACKUP_ADMISSION_FAILED:${currentStage}`, { cause: error });
} finally {
  await cleanup();
}
