import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

const POSTGRES_IMAGE = "postgres:16.15-bookworm@sha256:bb3e1a57e5407e0a5280b4211980a5e537f4abd234a87014ac979849a78dd825";
const OPS_IMAGE = "company-os-ops:restore-admission";
const suffix = randomBytes(6).toString("hex");
const password = randomBytes(32).toString("base64url");
const marker = "restore-" + suffix;
const network = "company-os-restore-" + suffix;
const sourceContainer = "company-os-source-" + suffix;
const targetContainer = "company-os-target-" + suffix;
const backupVolume = "company-os-backup-" + suffix;
const sourceDatabase = "company_os_source";
const targetDatabase = "company_os_restore_drill";
const databaseUser = "company_os";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    const stdout = [];
    const stderr = [];
    child.stdout?.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", () => reject(new Error("RESTORE_ADMISSION_PROCESS_START_FAILED")));
    child.once("exit", (code) => {
      const result = { code, stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8") };
      if (code === 0 || options.allowFailure) resolve(result);
      else reject(new Error("RESTORE_ADMISSION_COMMAND_FAILED:" + command));
    });
  });
}

async function waitForPostgres(container) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await run("docker", ["exec", container, "pg_isready", "-U", databaseUser], { allowFailure: true });
    if (result.code === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("RESTORE_ADMISSION_POSTGRES_TIMEOUT");
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

try {
  await run("docker", ["build", "--file", "deploy/Dockerfile.ops", "--tag", OPS_IMAGE, "."]);
  await run("docker", ["network", "create", network]);
  await run("docker", ["volume", "create", backupVolume]);
  for (const [name, database] of [[sourceContainer, sourceDatabase], [targetContainer, targetDatabase]]) {
    await run("docker", ["run", "--detach", "--name", name, "--network", network,
      "--env", "POSTGRES_DB=" + database, "--env", "POSTGRES_USER=" + databaseUser,
      "--env", "POSTGRES_PASSWORD=" + password, POSTGRES_IMAGE]);
  }
  await Promise.all([waitForPostgres(sourceContainer), waitForPostgres(targetContainer)]);

  const sourceUrl = "postgres://" + databaseUser + ":" + password + "@" + sourceContainer + ":5432/" + sourceDatabase;
  const targetUrl = "postgres://" + databaseUser + ":" + password + "@" + targetContainer + ":5432/" + targetDatabase;
  await run("docker", ["run", "--rm", "--network", network,
    "--env", "COMPANY_OS_DATABASE_URL=" + sourceUrl, OPS_IMAGE,
    "node", "--experimental-strip-types", "scripts/migrate-postgres.ts"]);

  const seedSql = [
    "INSERT INTO company_os_auth_user (id,name,email,email_verified,created_at,updated_at)",
    "VALUES ('restore-user','Restore admission','restore-" + suffix + "@integration.invalid',true,now(),now());",
    "INSERT INTO company_os_company (id,name,purpose,locale,default_responsible_user_id)",
    "VALUES ('restore-company','Restore admission','Verify disaster recovery','en-US','restore-user');",
    "INSERT INTO company_os_domain_event (id,company_id,sequence,type,occurred_at,actor_id,payload,provenance)",
    "VALUES ('restore-event','restore-company',1,'restore.admission.recorded',now()::text,'restore-user','{\"marker\":\"" +
      marker + "\"}'::jsonb,'PRODUCTION');",
  ].join(" ");
  await run("docker", ["exec", "--env", "PGPASSWORD=" + password, sourceContainer,
    "psql", "--username", databaseUser, "--dbname", sourceDatabase,
    "--set", "ON_ERROR_STOP=1", "--command", seedSql]);

  await run("docker", ["run", "--rm", "--entrypoint", "sh", "--volume", backupVolume + ":/backup",
    POSTGRES_IMAGE, "-c", "chown 1000:1000 /backup"]);
  const drill = await run("docker", ["run", "--rm", "--network", network,
    "--volume", backupVolume + ":/backup",
    "--env", "COMPANY_OS_SOURCE_DATABASE_URL=" + sourceUrl,
    "--env", "COMPANY_OS_RESTORE_DATABASE_URL=" + targetUrl,
    "--env", "COMPANY_OS_BACKUP_PATH=/backup/company-os.dump", OPS_IMAGE]);
  const result = JSON.parse(drill.stdout.trim());
  if (result.status !== "PASS" || !/^sha256:[a-f0-9]{64}$/.test(result.backupDigest)) {
    throw new Error("RESTORE_ADMISSION_RESULT_INVALID");
  }

  const restored = await run("docker", ["exec", "--env", "PGPASSWORD=" + password, targetContainer,
    "psql", "--tuples-only", "--no-align", "--username", databaseUser, "--dbname", targetDatabase,
    "--command", "SELECT payload->>'marker' FROM company_os_domain_event WHERE id='restore-event';"]);
  if (restored.stdout.trim() !== marker) throw new Error("RESTORE_ADMISSION_DATA_MISMATCH");
  process.stdout.write(JSON.stringify({ schemaVersion: 1, status: "PASS", backupDigest: result.backupDigest }) + "\n");
} finally {
  await cleanup();
}
