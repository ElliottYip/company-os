import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createCompanyDatabase } from "../../adapters/persistence/postgres/company-database.ts";
import { createIsolatedPostgresTestDatabase } from "../support/isolated-postgres-test-database.ts";
import { availablePort, startCompanyWebEdge, waitForHttp } from "../support/company-web-edge.ts";

const configuration = {
  databaseUrl: process.env.COMPANY_OS_TEST_DATABASE_URL?.trim(),
  issuer: process.env.COMPANY_OS_KEYCLOAK_ISSUER?.trim(),
  clientId: process.env.COMPANY_OS_KEYCLOAK_CLIENT_ID?.trim(),
  clientSecret: process.env.COMPANY_OS_KEYCLOAK_CLIENT_SECRET?.trim(),
  username: process.env.COMPANY_OS_KEYCLOAK_TEST_USERNAME?.trim(),
  password: process.env.COMPANY_OS_KEYCLOAK_TEST_PASSWORD?.trim(),
  tlsKeyPath: process.env.COMPANY_OS_KEYCLOAK_TLS_KEY?.trim(),
  tlsCertificatePath: process.env.COMPANY_OS_KEYCLOAK_TLS_CERTIFICATE?.trim(),
  edgePort: Number(process.env.COMPANY_OS_KEYCLOAK_EDGE_PORT ?? "58444"),
};
const configured = Object.values(configuration).every((value) => value !== undefined && value !== "" &&
  (typeof value !== "number" || Number.isSafeInteger(value) && value > 0 && value <= 65_535));

test.use({ ignoreHTTPSErrors: true });

test("Keycloak completes real PKCE login and opens an accountable Company OS organization", async ({ page }) => {
  test.skip(!configured, "Keycloak compatibility environment is not configured");
  const isolated = await createIsolatedPostgresTestDatabase(configuration.databaseUrl as string, "keycloak_browser");
  const database = createCompanyDatabase(isolated.connectionString);
  const key = readFileSync(configuration.tlsKeyPath as string);
  const certificate = readFileSync(configuration.tlsCertificatePath as string);
  const edge = await startCompanyWebEdge(key, certificate, configuration.edgePort);
  let backend: ChildProcess | null = null;
  try {
    await database.migrate();
    await database.close();
    const backendPort = await availablePort();
    edge.setBackendPort(backendPort);
    backend = spawn(process.execPath, ["--experimental-strip-types", "adapters/http/service-entry.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_TLS_REJECT_UNAUTHORIZED: "0",
        COMPANY_OS_HOST: "127.0.0.1", COMPANY_OS_PORT: String(backendPort),
        COMPANY_OS_PROFILE: "self-hosted", COMPANY_OS_EXPOSURE: "private",
        COMPANY_OS_PUBLIC_URL: edge.origin, COMPANY_OS_DATABASE_URL: isolated.connectionString,
        COMPANY_OS_OIDC_ISSUER: configuration.issuer,
        COMPANY_OS_OIDC_DISCOVERY_URL: `${configuration.issuer}/.well-known/openid-configuration`,
        COMPANY_OS_OIDC_CLIENT_ID: configuration.clientId,
        COMPANY_OS_OIDC_CLIENT_SECRET: configuration.clientSecret,
        COMPANY_OS_OIDC_REDIRECT_URI: `${edge.origin}/api/auth/oauth2/callback/enterprise-oidc`,
        COMPANY_OS_SESSION_SIGNING_KEY: "keycloak-compatibility-session-signing-key-at-least-32-bytes",
        COMPANY_OS_INSTANCE_ID: "keycloak-compatibility",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output: string[] = [];
    backend.stdout?.on("data", (chunk) => output.push(String(chunk)));
    backend.stderr?.on("data", (chunk) => output.push(String(chunk)));
    await waitForHttp(`http://127.0.0.1:${backendPort}/health`, backend, output);

    await page.goto(`${edge.origin}/?mode=formal`);
    await expect(page).toHaveURL(/\/protocol\/openid-connect\/auth/);
    const authorization = new URL(page.url());
    assert.equal(authorization.searchParams.get("client_id"), configuration.clientId);
    assert.equal(authorization.searchParams.get("response_type"), "code");
    assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
    assert.match(authorization.searchParams.get("code_challenge") ?? "", /^[A-Za-z0-9_-]{43}$/);
    await page.locator("#username").fill(configuration.username as string);
    await page.locator("#password").fill(configuration.password as string);
    await page.locator("#kc-login").click();

    await expect(page).toHaveURL(`${edge.origin}/?mode=formal`);
    await expect(page.getByRole("heading", { name: "Claim this private instance" })).toBeVisible();
    await page.getByRole("button", { name: "Claim first administrator" }).click();
    await page.getByLabel("Company name").fill("Keycloak Compatibility Company");
    await page.getByLabel("Company purpose").fill("Verify replaceable enterprise identity with accountable humans.");
    await page.locator("[data-formal-company-form]").getByRole("button", { name: "Create company" }).click();
    await page.getByLabel("Department name").fill("Operations");
    await page.getByLabel("Your company title").fill("Accountable Owner");
    await page.getByRole("button", { name: "Create organization" }).click();
    await expect(page.locator(".sidebar-brand strong")).toHaveText("Keycloak Compatibility Company");
    await expect(page.getByText("Production", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Settings" }).first().click();
    await page.getByRole("tab", { name: "Identity & access" }).click();
    await expect(page.getByText("keycloak-user@example.test", { exact: true })).toBeVisible();
  } finally {
    if (backend && backend.exitCode === null) {
      backend.kill("SIGTERM");
      await Promise.race([
        new Promise<void>((resolve) => backend?.once("exit", () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
      ]);
      if (backend.exitCode === null) backend.kill("SIGKILL");
    }
    await edge.close();
    await database.close();
    await isolated.dispose();
  }
});
