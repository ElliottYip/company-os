import assert from "node:assert/strict";
import { expect, test } from "@playwright/test";

const configuration = {
  webOrigin: process.env.COMPANY_OS_COMPOSE_WEB_ORIGIN?.trim(),
  apiOrigin: process.env.COMPANY_OS_COMPOSE_API_ORIGIN?.trim(),
  identityHost: process.env.COMPANY_OS_COMPOSE_IDENTITY_HOST?.trim(),
  username: process.env.COMPANY_OS_COMPOSE_TEST_USERNAME?.trim(),
  password: process.env.COMPANY_OS_COMPOSE_TEST_PASSWORD?.trim(),
};
const configured = Object.values(configuration).every((value) => Boolean(value));
const resolver = configured ? "MAP * 127.0.0.1, EXCLUDE localhost" : "";

test.use({ ignoreHTTPSErrors: true, launchOptions: { args: resolver
  ? ["--no-proxy-server", `--host-resolver-rules=${resolver}`] : [] } });

test("self-hosted Compose completes enterprise login and accountable company setup", async ({ page }) => {
  test.skip(!configured, "self-hosted Compose admission environment is not configured");
  await page.goto(`${configuration.webOrigin}/?mode=formal`);
  await expect(page).toHaveURL(/\/protocol\/openid-connect\/auth/);
  const authorization = new URL(page.url());
  assert.equal(authorization.searchParams.get("response_type"), "code");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  await page.locator("#username").fill(configuration.username as string);
  await page.locator("#password").fill(configuration.password as string);
  await page.locator("#kc-login").click();

  await expect(page).toHaveURL(`${configuration.webOrigin}/?mode=formal`);
  await expect(page.getByRole("heading", { name: "Claim this private instance" })).toBeVisible();
  await page.getByRole("button", { name: "Claim first administrator" }).click();
  await page.getByLabel("Company name").fill("Compose Admission Company");
  await page.getByLabel("Company purpose").fill("Prove the released self-hosted topology end to end.");
  await page.locator("[data-formal-company-form]").getByRole("button", { name: "Create company" }).click();
  await page.getByLabel("Department name").fill("Operations");
  await page.getByLabel("Your company title").fill("Accountable Owner");
  await page.getByRole("button", { name: "Create organization" }).click();

  await expect(page.locator(".sidebar-brand strong")).toHaveText("Compose Admission Company");
  await expect(page.getByText("Production", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(".sidebar-brand strong")).toHaveText("Compose Admission Company");
  const ready = await page.evaluate(async (origin) => {
    const response = await fetch(`${origin}/ready`, { credentials: "include" });
    return response.status;
  }, configuration.apiOrigin as string);
  expect(ready).toBe(200);
});
