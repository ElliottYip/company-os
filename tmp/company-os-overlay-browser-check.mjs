import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const response = await page.goto("http://127.0.0.1:14620/", { waitUntil: "networkidle" });
  if (response?.status() !== 200) throw new Error("OVERLAY_HOME_UNAVAILABLE");
  const setup = page.locator("[data-enter-local]");
  if (await setup.count() !== 1 || !(await setup.isVisible())) throw new Error("OVERLAY_SETUP_CONTROL_MISSING");
  await setup.click();
  await page.waitForURL("http://127.0.0.1:14620/start");
  const heading = page.getByRole("heading", { name: "选择公司的使用方式" });
  if (!(await heading.isVisible())) throw new Error("OVERLAY_ONBOARDING_MISSING");
  await page.getByRole("radio", { name: /独立部署/ }).click();
  if (!(await page.getByRole("heading", { name: "生成独立部署交接单" }).isVisible())) {
    throw new Error("OVERLAY_INDEPENDENT_MODE_MISSING");
  }
  if (await page.locator('input[type="password"]:visible').count() !== 0) {
    throw new Error("OVERLAY_INDEPENDENT_SECRET_INPUT_PRESENT");
  }
  process.stdout.write(JSON.stringify({
    status: "PASS",
    homeStatus: response.status(),
    finalPath: new URL(page.url()).pathname,
    independentMode: true,
    independentSecretInputs: 0,
  }) + "\n");
} finally {
  await browser.close();
}
