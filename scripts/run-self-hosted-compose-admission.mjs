import { randomBytes } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { createServer as createHttpsServer, request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KEYCLOAK_IMAGE = "quay.io/keycloak/keycloak@sha256:831330513f55695572286e521f94fcd3c7e285250ed5b848090265a33192f669";
const POSTGRES_IMAGE = "postgres:16.15-bookworm@sha256:bb3e1a57e5407e0a5280b4211980a5e537f4abd234a87014ac979849a78dd825";
const admissionProfile = process.env.COMPANY_OS_COMPOSE_ADMISSION_PROFILE?.trim() || "self-hosted";
if (!["self-hosted", "managed-cloud"].includes(admissionProfile)) {
  throw new Error("COMPOSE_ADMISSION_PROFILE_INVALID");
}
const managedCloud = admissionProfile === "managed-cloud";
const suffix = process.pid + "-" + randomBytes(4).toString("hex");
const project = "company-os-compose-" + suffix;
const keycloakContainer = "company-os-compose-keycloak-" + suffix;
const postgresContainer = "company-os-compose-postgres-" + suffix;
const externalNetwork = "company-os-compose-external-" + suffix;
const apiImage = "company-os-api:compose-" + suffix;
const webImage = "company-os-web:compose-" + suffix;
const temporaryDirectory = mkdtempSync(join(tmpdir(), "company-os-compose-"));
const tlsDirectory = temporaryDirectory + "/tls";
const importDirectory = temporaryDirectory + "/import";
mkdirSync(tlsDirectory);
mkdirSync(importDirectory);
const keyPath = tlsDirectory + "/tls-key.pem";
const certificatePath = tlsDirectory + "/tls-cert.pem";
const environmentPath = temporaryDirectory + "/compose.env";
const overridePath = temporaryDirectory + "/compose.override.yml";
// Use one DNS name for both sides of the OIDC flow: Docker resolves the
// Keycloak container on the admission network, while Playwright maps the same
// hostname to the loopback-published TLS port.
const identityHost = keycloakContainer;
const apiHost = "127.0.0.1";
const webHost = "127.0.0.1";
const realmName = "company-os-compose";
const clientId = "company-os-compose-client";
const clientSecret = randomBytes(32).toString("base64url");
const username = "compose-user-" + randomBytes(5).toString("hex");
const password = randomBytes(24).toString("base64url");
const adminUsername = "compose-admin-" + randomBytes(5).toString("hex");
const adminPassword = randomBytes(32).toString("base64url");
const databasePassword = randomBytes(32).toString("base64url");
const runtimeDatabasePassword = randomBytes(32).toString("base64url");
const databaseOwner = "company_os_owner";
const runtimeDatabaseUser = "company_os_runtime";
const sessionSecret = randomBytes(48).toString("base64url");
let webEdge;
let apiEdge;
let composeStarted = false;
let cleaned = false;

function docker(...args) {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function runInherited(command, args, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), stdio: "inherit", env: environment });
    child.once("error", () => reject(new Error("COMPOSE_ADMISSION_BROWSER_START_FAILED")));
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

function compose(...args) {
  return docker("compose", "--project-name", project, "--env-file", environmentPath,
    "--file", managedCloud ? "deploy/compose.managed-cloud.yml" : "deploy/compose.self-hosted.yml",
    "--file", overridePath, ...args);
}

async function availablePort() {
  const server = createHttpServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = address && typeof address === "object" ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  if (!port) throw new Error("COMPOSE_ADMISSION_PORT_UNAVAILABLE");
  return port;
}

async function startTlsProxy(port, backendPort, publicHost, key, certificate) {
  const server = createHttpsServer({ key, cert: certificate }, (incoming, outgoing) => {
    const proxy = httpRequest({ hostname: "127.0.0.1", port: backendPort, path: incoming.url,
      method: incoming.method, headers: { ...incoming.headers, host: publicHost + ":" + port,
        "x-forwarded-proto": "https" } }, (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    proxy.on("error", () => outgoing.writeHead(502).end());
    incoming.pipe(proxy);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return { close: () => new Promise((resolve) => server.close(resolve)) };
}

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* service is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("COMPOSE_ADMISSION_SERVICE_TIMEOUT");
}

function keycloakReady(port) {
  return new Promise((resolve) => {
    const probe = httpsRequest({ hostname: "127.0.0.1", port,
      path: "/realms/" + realmName + "/.well-known/openid-configuration",
      servername: identityHost, rejectUnauthorized: false,
      headers: { host: identityHost + ":" + port } }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    probe.setTimeout(2_000, () => { probe.destroy(); resolve(false); });
    probe.on("error", () => resolve(false));
    probe.end();
  });
}

async function waitForKeycloak(port) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await keycloakReady(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("COMPOSE_ADMISSION_KEYCLOAK_TIMEOUT");
}

async function waitForPostgres(container = postgresContainer) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      docker("exec", container, "pg_isready", "--username", databaseOwner, "--dbname", "company_os");
      return;
    } catch { /* database is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("COMPOSE_ADMISSION_POSTGRES_TIMEOUT");
}

function captureDurableState(container) {
  const query = [
    "SELECT json_build_object(",
    "'companies', (SELECT count(*) FROM company_os_company),",
    "'memberships', (SELECT count(*) FROM company_os_company_membership),",
    "'users', (SELECT count(*) FROM company_os_auth_user),",
    "'sessions', (SELECT count(*) FROM company_os_auth_session),",
    "'events', (SELECT count(*) FROM company_os_domain_event)",
    ")::text;",
  ].join(" ");
  const output = docker("exec", container, "psql", "--username", databaseOwner,
    "--dbname", "company_os", "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1",
    "--command", query);
  const state = JSON.parse(output);
  if ([state.companies, state.memberships, state.users, state.sessions, state.events]
    .some((count) => !Number.isSafeInteger(count) || count < 1)) {
    throw new Error("COMPOSE_ADMISSION_DURABLE_STATE_EMPTY");
  }
  return state;
}

async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  await webEdge?.close();
  await apiEdge?.close();
  if (composeStarted) {
    try { compose("down", "--volumes", "--remove-orphans"); } catch { /* exact project may already be down */ }
  }
  if (managedCloud) {
    try { docker("rm", "--force", postgresContainer); } catch { /* container may already be gone */ }
  }
  try { docker("image", "rm", apiImage, webImage); } catch { /* an interrupted build may not have produced both */ }
  try { docker("rm", "--force", keycloakContainer); } catch { /* container may already be gone */ }
  try { docker("network", "rm", externalNetwork); } catch { /* exact network may already be gone */ }
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });
}

try {
  const [keycloakPort, apiBackendPort, webBackendPort, apiEdgePort, webEdgePort] =
    await Promise.all([availablePort(), availablePort(), availablePort(), availablePort(), availablePort()]);
  const apiOrigin = "https://" + apiHost + ":" + apiEdgePort;
  const webOrigin = "https://" + webHost + ":" + webEdgePort;
  const issuer = "https://" + identityHost + ":" + keycloakPort + "/realms/" + realmName;
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "1",
    "-subj", "/CN=" + identityHost,
    "-addext", "subjectAltName=DNS:" + identityHost + ",IP:127.0.0.1",
    "-keyout", keyPath, "-out", certificatePath], { stdio: "ignore" });
  chmodSync(keyPath, 0o644);
  chmodSync(certificatePath, 0o644);

  const realm = {
    realm: realmName, enabled: true, sslRequired: "all", registrationAllowed: false,
    loginWithEmailAllowed: true, duplicateEmailsAllowed: false,
    clients: [{ clientId, enabled: true, protocol: "openid-connect", publicClient: false,
      secret: clientSecret, standardFlowEnabled: true, implicitFlowEnabled: false,
      directAccessGrantsEnabled: false, redirectUris: [apiOrigin + "/api/auth/oauth2/callback/enterprise-oidc"],
      webOrigins: [webOrigin], attributes: { "pkce.code.challenge.method": "S256" },
      defaultClientScopes: ["web-origins", "acr", "roles", "profile", "email"] }],
    users: [{ username, enabled: true, emailVerified: true, email: "compose-user@example.test",
      firstName: "Compose", lastName: "User",
      credentials: [{ type: "password", value: password, temporary: false }] }],
  };
  // The outer mkdtemp directory remains 0700. The mounted import file must be
  // readable by Keycloak's non-root container user on Linux.
  writeFileSync(importDirectory + "/company-os-compose-realm.json", JSON.stringify(realm, null, 2) + "\n", { mode: 0o644 });
  const managedMigrationDatabaseUrl = `postgres://${databaseOwner}:${databasePassword}@${postgresContainer}:5432/company_os`;
  const managedDatabaseUrl = `postgres://${runtimeDatabaseUser}:${runtimeDatabasePassword}@${postgresContainer}:5432/company_os`;
  const environmentLines = [
    "COMPANY_OS_PUBLIC_URL=" + apiOrigin,
    "COMPANY_OS_WEB_ORIGINS=" + webOrigin,
    "COMPANY_OS_API_PORT=" + apiBackendPort,
    "COMPANY_OS_WEB_PORT=" + webBackendPort,
    "COMPANY_OS_API_IMAGE=" + apiImage,
    "COMPANY_OS_WEB_IMAGE=" + webImage,
    "COMPANY_OS_OIDC_ISSUER=" + issuer,
    "COMPANY_OS_OIDC_DISCOVERY_URL=" + issuer + "/.well-known/openid-configuration",
    "COMPANY_OS_OIDC_CLIENT_ID=" + clientId,
    "COMPANY_OS_OIDC_CLIENT_SECRET=" + clientSecret,
    "COMPANY_OS_OIDC_REDIRECT_URI=" + apiOrigin + "/api/auth/oauth2/callback/enterprise-oidc",
    "COMPANY_OS_SESSION_SIGNING_KEY=" + sessionSecret,
    "COMPANY_OS_INSTANCE_ID=compose-admission-" + suffix,
  ];
  environmentLines.push(...(managedCloud ? [
    "COMPANY_OS_MIGRATION_DATABASE_URL=" + managedMigrationDatabaseUrl,
    "COMPANY_OS_DATABASE_URL=" + managedDatabaseUrl,
    "COMPANY_OS_RUNTIME_DATABASE_USER=" + runtimeDatabaseUser,
    "COMPANY_OS_RUNTIME_DATABASE_PASSWORD=" + runtimeDatabasePassword,
    "COMPANY_OS_TRUSTED_PROXY_CIDRS=127.0.0.1/32",
  ] : [
    "COMPANY_OS_EXPOSURE=private",
    "POSTGRES_DB=company_os",
    "POSTGRES_USER=" + databaseOwner,
    "POSTGRES_PASSWORD=" + databasePassword,
    "COMPANY_OS_RUNTIME_DATABASE_USER=" + runtimeDatabaseUser,
    "COMPANY_OS_RUNTIME_DATABASE_PASSWORD=" + runtimeDatabasePassword,
  ]));
  writeFileSync(environmentPath, environmentLines.join("\n") + "\n", { mode: 0o600 });
  const overrideLines = [
    "services:", "  api:",
    "    environment:", "      NODE_EXTRA_CA_CERTS: /company-os-test-tls/tls-cert.pem",
    "    volumes:", "      - \"" + tlsDirectory + ":/company-os-test-tls:ro\"",
  ];
  if (managedCloud) {
    overrideLines.push(
      "    ports:", "      - \"" + apiBackendPort + ":4310\"",
      "  web:", "    ports:", "      - \"" + webBackendPort + ":8080\"",
    );
  }
  overrideLines.push("networks:", "  default:", "    external: true", "    name: " + externalNetwork);
  writeFileSync(overridePath, overrideLines.join("\n") + "\n", { mode: 0o600 });

  docker("network", "create", externalNetwork);
  docker("run", "--detach", "--name", keycloakContainer, "--network", externalNetwork, "--memory", "1g",
    "--env", "KC_BOOTSTRAP_ADMIN_USERNAME=" + adminUsername,
    "--env", "KC_BOOTSTRAP_ADMIN_PASSWORD=" + adminPassword,
    "--publish", "127.0.0.1:" + keycloakPort + ":8443",
    "--volume", importDirectory + ":/opt/keycloak/data/import:ro",
    "--volume", tlsDirectory + ":/opt/keycloak/test-tls:ro", KEYCLOAK_IMAGE,
    "start-dev", "--import-realm", "--hostname=" + issuer.replace("/realms/" + realmName, ""),
    "--http-enabled=false", "--https-port=8443",
    "--https-certificate-file=/opt/keycloak/test-tls/tls-cert.pem",
    "--https-certificate-key-file=/opt/keycloak/test-tls/tls-key.pem");
  await waitForKeycloak(keycloakPort);

  if (managedCloud) {
    docker("run", "--detach", "--name", postgresContainer, "--network", externalNetwork,
      "--env", "POSTGRES_DB=company_os", "--env", "POSTGRES_USER=" + databaseOwner,
      "--env", "POSTGRES_PASSWORD=" + databasePassword, POSTGRES_IMAGE);
    await waitForPostgres();
    docker("build", "--no-cache", "--file", "deploy/Dockerfile.api", "--tag", apiImage, ".");
    docker("build", "--no-cache", "--file", "deploy/Dockerfile.web", "--tag", webImage, ".");
  } else {
    compose("build", "--no-cache", "api", "web");
  }
  composeStarted = true;
  compose("up", "--no-build", "--detach");
  await Promise.all([
    waitForUrl("http://127.0.0.1:" + apiBackendPort + "/ready", 90_000),
    waitForUrl("http://127.0.0.1:" + webBackendPort + "/", 90_000),
  ]);
  const key = readFileSync(keyPath);
  const certificate = readFileSync(certificatePath);
  apiEdge = await startTlsProxy(apiEdgePort, apiBackendPort, apiHost, key, certificate);
  webEdge = await startTlsProxy(webEdgePort, webBackendPort, webHost, key, certificate);

  const browserTest = managedCloud
    ? "tests/e2e/managed-cloud-compose-live.spec.ts"
    : "tests/e2e/self-hosted-compose-live.spec.ts";
  const result = await runInherited(process.execPath, ["node_modules/@playwright/test/cli.js", "test",
    browserTest, "--workers=1"], {
    ...process.env, NO_PROXY: "*", no_proxy: "*", COMPANY_OS_COMPOSE_WEB_ORIGIN: webOrigin,
      COMPANY_OS_COMPOSE_API_ORIGIN: apiOrigin, COMPANY_OS_COMPOSE_IDENTITY_HOST: identityHost,
      COMPANY_OS_COMPOSE_TEST_USERNAME: username, COMPANY_OS_COMPOSE_TEST_PASSWORD: password,
      ...(managedCloud ? {
        COMPANY_OS_MANAGED_API_IMAGE: apiImage,
        COMPANY_OS_MANAGED_NETWORK: externalNetwork,
        COMPANY_OS_MANAGED_DATABASE_URL: managedDatabaseUrl,
        COMPANY_OS_MANAGED_ADMIN_EMAIL: "compose-user@example.test",
      } : {}),
  });
  if (result !== 0) {
    process.stderr.write(compose("logs", "--no-color", "--tail", "120") + "\n");
    process.stderr.write(docker("logs", "--tail", "120", keycloakContainer) + "\n");
    process.exitCode = result;
  } else {
    const databaseContainer = managedCloud ? postgresContainer : compose("ps", "--quiet", "postgres");
    if (!databaseContainer) throw new Error("COMPOSE_ADMISSION_DATABASE_CONTAINER_MISSING");
    const beforeRestart = captureDurableState(databaseContainer);
    docker("restart", databaseContainer);
    await waitForPostgres(databaseContainer);
    compose("restart", "api");
    await waitForUrl("http://127.0.0.1:" + apiBackendPort + "/ready", 90_000);
    const afterRestart = captureDurableState(databaseContainer);
    if (JSON.stringify(afterRestart) !== JSON.stringify(beforeRestart)) {
      throw new Error("COMPOSE_ADMISSION_DURABLE_STATE_CHANGED");
    }
    process.stdout.write(JSON.stringify({ schemaVersion: 1, status: "PASS", profile: admissionProfile,
      recovered: true, durableState: afterRestart }) + "\n");
  }
} finally {
  await cleanup();
}
