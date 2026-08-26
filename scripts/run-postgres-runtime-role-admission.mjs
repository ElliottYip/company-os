import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

const POSTGRES_IMAGE = "postgres:16.15-bookworm@sha256:bb3e1a57e5407e0a5280b4211980a5e537f4abd234a87014ac979849a78dd825";
const OPS_IMAGE = "company-os-ops:runtime-role-admission";
const suffix = randomBytes(6).toString("hex");
const ownerPassword = randomBytes(32).toString("base64url");
const runtimePassword = randomBytes(32).toString("base64url");
const network = "company-os-runtime-role-" + suffix;
const container = "company-os-runtime-role-" + suffix;
const database = "company_os";
const owner = "company_os_owner";
const runtimeRole = "company_os_runtime";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    const stdout = [];
    const stderr = [];
    child.stdout?.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", () => reject(new Error("RUNTIME_ROLE_ADMISSION_PROCESS_START_FAILED")));
    child.once("exit", (code) => {
      const stderrText = Buffer.concat(stderr).toString("utf8");
      const result = { code, stdout: Buffer.concat(stdout).toString("utf8"), stderr: stderrText };
      if (code === 0 || options.allowFailure) resolve(result);
      else {
        const stableCode = stderrText.match(/\bRUNTIME_DATABASE_[A-Z0-9_]{2,80}\b/g)?.at(-1);
        reject(new Error("RUNTIME_ROLE_ADMISSION_COMMAND_FAILED:" + command +
          (stableCode ? ":" + stableCode : "")));
      }
    });
  });
}

async function waitForPostgres() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await run("docker", ["exec", container, "pg_isready", "-U", owner], { allowFailure: true });
    if (result.code === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("RUNTIME_ROLE_ADMISSION_POSTGRES_TIMEOUT");
}

let cleaning = false;
async function cleanup() {
  if (cleaning) return;
  cleaning = true;
  await run("docker", ["rm", "--force", container], { allowFailure: true });
  await run("docker", ["network", "rm", network], { allowFailure: true });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });
}

let currentStage = "BUILD_OPERATIONS_IMAGE";
try {
  await run("docker", ["build", "--file", "deploy/Dockerfile.ops", "--tag", OPS_IMAGE, "."]);
  currentStage = "START_DISPOSABLE_DATABASE";
  await run("docker", ["network", "create", network]);
  await run("docker", ["run", "--detach", "--name", container, "--network", network,
    "--env", "POSTGRES_DB=" + database, "--env", "POSTGRES_USER=" + owner,
    "--env", "POSTGRES_PASSWORD=" + ownerPassword, POSTGRES_IMAGE]);
  currentStage = "WAIT_FOR_DISPOSABLE_DATABASE";
  await waitForPostgres();
  const adminUrl = "postgres://" + owner + ":" + ownerPassword + "@" + container + ":5432/" + database;
  const runtimeUrl = "postgres://" + runtimeRole + ":" + runtimePassword + "@" + container + ":5432/" + database;

  currentStage = "MIGRATE_DATABASE";
  await run("docker", ["run", "--rm", "--network", network,
    "--env", "COMPANY_OS_DATABASE_URL=" + adminUrl, OPS_IMAGE,
    "node", "--experimental-strip-types", "scripts/migrate-postgres.ts"]);
  currentStage = "PROVISION_RUNTIME_ROLE";
  const provision = await run("docker", ["run", "--rm", "--network", network,
    "--env", "COMPANY_OS_MIGRATION_DATABASE_URL=" + adminUrl,
    "--env", "COMPANY_OS_RUNTIME_DATABASE_USER=" + runtimeRole,
    "--env", "COMPANY_OS_RUNTIME_DATABASE_PASSWORD=" + runtimePassword, OPS_IMAGE,
    "node", "--experimental-strip-types", "scripts/provision-postgres-runtime-role.ts"]);
  const provisionResult = JSON.parse(provision.stdout.trim());
  if (provisionResult.status !== "PASS" || provisionResult.runtimeRole !== runtimeRole) {
    throw new Error("RUNTIME_ROLE_PROVISION_RESULT_INVALID");
  }
  currentStage = "VERIFY_RUNTIME_ROLE";
  const verification = await run("docker", ["run", "--rm", "--network", network,
    "--env", "COMPANY_OS_DATABASE_URL=" + runtimeUrl,
    "--env", "COMPANY_OS_RUNTIME_ROLE_FIXTURE_SUFFIX=" + suffix, OPS_IMAGE,
    "node", "--experimental-strip-types", "scripts/verify-postgres-runtime-role.ts"]);
  const result = JSON.parse(verification.stdout.trim());
  if (result.status !== "PASS" || result.deniedCapabilities !== 5) {
    throw new Error("RUNTIME_ROLE_VERIFICATION_RESULT_INVALID");
  }
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, status: "PASS",
    runtimeRole, deniedCapabilities: result.deniedCapabilities })}\n`);
} catch (error) {
  throw new Error(`RUNTIME_ROLE_ADMISSION_FAILED:${currentStage}`, { cause: error });
} finally {
  await cleanup();
}
