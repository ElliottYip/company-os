import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const configuration = {
  webOrigin: process.env.COMPANY_OS_COMPOSE_WEB_ORIGIN?.trim(),
  apiOrigin: process.env.COMPANY_OS_COMPOSE_API_ORIGIN?.trim(),
  identityHost: process.env.COMPANY_OS_COMPOSE_IDENTITY_HOST?.trim(),
  username: process.env.COMPANY_OS_COMPOSE_TEST_USERNAME?.trim(),
  password: process.env.COMPANY_OS_COMPOSE_TEST_PASSWORD?.trim(),
  apiImage: process.env.COMPANY_OS_MANAGED_API_IMAGE?.trim(),
  network: process.env.COMPANY_OS_MANAGED_NETWORK?.trim(),
  databaseUrl: process.env.COMPANY_OS_MANAGED_DATABASE_URL?.trim(),
  adminEmail: process.env.COMPANY_OS_MANAGED_ADMIN_EMAIL?.trim(),
};
const configured = Object.values(configuration).every((value) => Boolean(value));
const resolver = configured ? "MAP * 127.0.0.1, EXCLUDE localhost" : "";

test.use({ ignoreHTTPSErrors: true, launchOptions: { args: resolver
  ? ["--no-proxy-server", `--host-resolver-rules=${resolver}`] : [] } });

test("managed-cloud Compose provisions a verified human and creates an accountable company", async ({ page }) => {
  test.skip(!configured, "managed-cloud Compose admission environment is not configured");
  await page.goto(`${configuration.webOrigin}/?mode=formal`);
  await expect(page).toHaveURL(/\/protocol\/openid-connect\/auth/);
  const authorization = new URL(page.url());
  assert.equal(authorization.searchParams.get("response_type"), "code");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  await page.locator("#username").fill(configuration.username as string);
  await page.locator("#password").fill(configuration.password as string);
  await page.locator("#kc-login").click();

  await expect(page).toHaveURL(`${configuration.webOrigin}/?mode=formal`);
  await expect(page.getByRole("heading", { name: "Managed account provisioning" })).toBeVisible();
  const publicClaimStatus = await page.evaluate(async (origin) => (await fetch(`${origin}/api/v1/bootstrap/claim`, {
    method: "POST", credentials: "include",
  })).status, configuration.apiOrigin as string);
  expect(publicClaimStatus).toBe(404);

  execFileSync("docker", ["run", "--rm", "--network", configuration.network as string,
    "--env", "COMPANY_OS_PROFILE=managed-cloud",
    "--env", `COMPANY_OS_DATABASE_URL=${configuration.databaseUrl}`,
    "--env", `COMPANY_OS_PROVISION_ADMIN_EMAIL=${configuration.adminEmail}`,
    configuration.apiImage as string, "node", "--experimental-strip-types",
    "scripts/provision-managed-instance-admin.ts"], { stdio: "ignore" });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Create your first company" })).toBeVisible();
  await page.getByLabel("Company name").fill("Managed Admission Company");
  await page.getByLabel("Company purpose").fill("Prove the managed topology end to end.");
  await page.locator("[data-formal-company-form]").getByRole("button", { name: "Create company" }).click();
  await page.getByLabel("Department name").fill("Operations");
  await page.getByLabel("Your company title").fill("Accountable Owner");
  await page.getByRole("button", { name: "Create organization" }).click();

  await expect(page.locator(".sidebar-brand strong")).toHaveText("Managed Admission Company");
  await expect(page.getByText("Production", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(".sidebar-brand strong")).toHaveText("Managed Admission Company");
  const ready = await page.evaluate(async (origin) => (await fetch(`${origin}/ready`, {
    credentials: "include",
  })).status, configuration.apiOrigin as string);
  expect(ready).toBe(200);
});
