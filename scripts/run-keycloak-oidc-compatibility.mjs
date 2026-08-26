import { randomBytes } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KEYCLOAK_IMAGE = "quay.io/keycloak/keycloak@sha256:831330513f55695572286e521f94fcd3c7e285250ed5b848090265a33192f669";
const POSTGRES_IMAGE = "postgres:16.15-bookworm@sha256:bb3e1a57e5407e0a5280b4211980a5e537f4abd234a87014ac979849a78dd825";
const keycloakPort = 58443;
const edgePort = 58444;
const postgresPort = 55440;
const suffix = `${process.pid}-${randomBytes(4).toString("hex")}`;
const keycloakContainer = `company-os-keycloak-compat-${suffix}`;
const postgresContainer = `company-os-keycloak-pg-${suffix}`;
const temporaryDirectory = mkdtempSync(join(tmpdir(), "company-os-keycloak-compat-"));
const importDirectory = `${temporaryDirectory}/import`;
const tlsDirectory = `${temporaryDirectory}/tls`;
mkdirSync(importDirectory);
mkdirSync(tlsDirectory);
const keyPath = `${tlsDirectory}/tls-key.pem`;
const certificatePath = `${tlsDirectory}/tls-cert.pem`;
const clientId = "company-os-keycloak-compat";
const clientSecret = randomBytes(32).toString("base64url");
const username = `compat-user-${randomBytes(5).toString("hex")}`;
const password = randomBytes(24).toString("base64url");
const adminUsername = `compat-admin-${randomBytes(5).toString("hex")}`;
const adminPassword = randomBytes(32).toString("base64url");
let cleaned = false;

function docker(...args) {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function cleanup() {
  if (cleaned) return;
  cleaned = true;
  for (const name of [keycloakContainer, postgresContainer]) {
    try { docker("rm", "--force", name); } catch { /* already removed */ }
  }
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

process.once("SIGINT", () => { cleanup(); process.exit(130); });
process.once("SIGTERM", () => { cleanup(); process.exit(143); });

try {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "1",
    "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1",
    "-keyout", keyPath, "-out", certificatePath], { stdio: "ignore" });
  chmodSync(keyPath, 0o644);
  chmodSync(certificatePath, 0o644);
  const realm = {
    realm: "company-os-compat", enabled: true, displayName: "Company OS compatibility",
    sslRequired: "all", registrationAllowed: false, resetPasswordAllowed: false,
    loginWithEmailAllowed: true, duplicateEmailsAllowed: false,
    clients: [{
      clientId, name: "Company OS compatibility client", enabled: true,
      protocol: "openid-connect", publicClient: false, secret: clientSecret,
      standardFlowEnabled: true, implicitFlowEnabled: false, directAccessGrantsEnabled: false,
      serviceAccountsEnabled: false,
      redirectUris: [`https://127.0.0.1:${edgePort}/api/auth/oauth2/callback/enterprise-oidc`],
      webOrigins: [`https://127.0.0.1:${edgePort}`],
      attributes: { "pkce.code.challenge.method": "S256" },
      defaultClientScopes: ["web-origins", "acr", "roles", "profile", "email"],
      optionalClientScopes: ["address", "phone", "offline_access", "microprofile-jwt"],
    }],
    users: [{
      username, enabled: true, emailVerified: true, email: "keycloak-user@example.test",
      firstName: "Keycloak", lastName: "User",
      credentials: [{ type: "password", value: password, temporary: false }],
    }],
  };
  // The outer mkdtemp directory remains 0700. The mounted import file must be
  // readable by Keycloak's non-root container user on Linux.
  writeFileSync(`${importDirectory}/company-os-compat-realm.json`, `${JSON.stringify(realm, null, 2)}\n`, { mode: 0o644 });

  docker("run", "-d", "--name", postgresContainer,
    "-e", "POSTGRES_USER=company_os_test", "-e", "POSTGRES_PASSWORD=company_os_test",
    "-e", "POSTGRES_DB=company_os_test", "-p", `127.0.0.1:${postgresPort}:5432`, POSTGRES_IMAGE);
  waitForPostgres();
  docker("run", "-d", "--name", keycloakContainer, "--memory", "1g",
    "-e", `KC_BOOTSTRAP_ADMIN_USERNAME=${adminUsername}`,
    "-e", `KC_BOOTSTRAP_ADMIN_PASSWORD=${adminPassword}`,
    "-p", `127.0.0.1:${keycloakPort}:8443`,
    "-v", `${importDirectory}:/opt/keycloak/data/import:ro`,
    "-v", `${tlsDirectory}:/opt/keycloak/test-tls:ro`, KEYCLOAK_IMAGE,
    "start-dev", "--import-realm", `--hostname=https://127.0.0.1:${keycloakPort}`,
    "--http-enabled=false", "--https-port=8443",
    "--https-certificate-file=/opt/keycloak/test-tls/tls-cert.pem",
    "--https-certificate-key-file=/opt/keycloak/test-tls/tls-key.pem");
  await waitForHttps(`https://127.0.0.1:${keycloakPort}/realms/company-os-compat/.well-known/openid-configuration`, 120_000);

  const result = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test",
    "tests/e2e/keycloak-identity-live.spec.ts", "--workers=1"], {
    cwd: process.cwd(), stdio: "inherit",
    env: {
      ...process.env,
      COMPANY_OS_TEST_DATABASE_URL: `postgresql://company_os_test:company_os_test@127.0.0.1:${postgresPort}/company_os_test`,
      COMPANY_OS_KEYCLOAK_ISSUER: `https://127.0.0.1:${keycloakPort}/realms/company-os-compat`,
      COMPANY_OS_KEYCLOAK_CLIENT_ID: clientId, COMPANY_OS_KEYCLOAK_CLIENT_SECRET: clientSecret,
      COMPANY_OS_KEYCLOAK_TEST_USERNAME: username, COMPANY_OS_KEYCLOAK_TEST_PASSWORD: password,
      COMPANY_OS_KEYCLOAK_TLS_KEY: keyPath, COMPANY_OS_KEYCLOAK_TLS_CERTIFICATE: certificatePath,
      COMPANY_OS_KEYCLOAK_EDGE_PORT: String(edgePort),
    },
  });
  if (result.status !== 0) {
    let logs = "KEYCLOAK_COMPAT_LOGS_UNAVAILABLE";
    try { logs = docker("logs", "--tail", "120", keycloakContainer); } catch { /* preserve the test failure */ }
    process.stderr.write(`${logs}\n`);
    process.exitCode = result.status ?? 1;
  }
} finally {
  cleanup();
}

function waitForPostgres() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const result = spawnSync("docker", ["exec", postgresContainer, "pg_isready", "-U", "company_os_test", "-d", "company_os_test"]);
    if (result.status === 0) return;
  }
  throw new Error("KEYCLOAK_COMPAT_POSTGRES_NOT_READY");
}

async function waitForHttps(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await httpsReady(url)) return;
    const running = spawnSync("docker", ["inspect", "--format", "{{.State.Running}}", keycloakContainer], { encoding: "utf8" });
    if (running.status === 0 && running.stdout.trim() === "false") {
      throw new Error(`KEYCLOAK_COMPAT_EXITED:${docker("logs", "--tail", "120", keycloakContainer)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`KEYCLOAK_COMPAT_NOT_READY:${docker("logs", "--tail", "120", keycloakContainer)}`);
}

function httpsReady(url) {
  return new Promise((resolve) => {
    const probe = request(url, { rejectUnauthorized: false }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    probe.setTimeout(2_000, () => { probe.destroy(); resolve(false); });
    probe.on("error", () => resolve(false));
    probe.end();
  });
}
