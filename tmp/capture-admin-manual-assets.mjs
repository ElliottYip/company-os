import { chromium } from "playwright";
import { resolve } from "node:path";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "体验 Company OS 公开 Demo" }).click();
await page.locator('.family-nav-item[data-section-target="office"]').waitFor({ state: "visible" });

for (const [section, file] of [
  ["connectors", "11-governance.png"],
  ["usage", "12-usage.png"],
  ["settings", "13-settings.png"],
]) {
  await page.locator(`.family-nav-item[data-section-target="${section}"]`).first().click({ timeout: 8000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve("tmp/company-os-manual-assets-current", file), animations: "disabled" });
  console.log(JSON.stringify({ section, file, heading: await page.locator("main h1, main h2").first().textContent() }));
}

await browser.close();
