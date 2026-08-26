import { chromium } from "playwright";

const base = process.env.COMPANY_OS_QA_URL ?? "http://127.0.0.1:8129";
const output = new URL("../outputs/ux-audit-2026-08-24/", import.meta.url).pathname;
const browser = await chromium.launch({ headless: true });
const findings = [];

async function inspect(page, name, path) {
  const metrics = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  await page.screenshot({ path: `${output}${path}`, fullPage: true });
  findings.push({ name, path, ...metrics });
}

const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
desktop.on("pageerror", (error) => findings.push({ name: "desktop-pageerror", message: error.message }));
await desktop.goto(base);
await inspect(desktop, "dashboard-desktop", "10-dashboard-redesign-final.png");

await desktop.goto(base);
await desktop.getByRole("button", { name: "组织与同事" }).click();
await inspect(desktop, "organization-desktop", "06-organization-workspace-final.png");

await desktop.goto(base);
await desktop.locator("[data-open-new-task]").first().click();
const dialog = desktop.getByRole("dialog");
await dialog.getByLabel("任务标题").fill("审核客户数据出口申请");
await dialog.getByLabel("成功目标").fill("形成带证据和真人审批记录的可审计结果");
await dialog.getByRole("button", { name: "分配任务" }).click();
await inspect(desktop, "task-record-desktop", "07-task-record-final.png");

await desktop.goto(base);
await desktop.getByRole("button", { name: "Connectors" }).click();
await desktop.getByRole("tab", { name: "Secrets" }).click();
await inspect(desktop, "administration-desktop", "08-administration-secrets-final.png");

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
mobile.on("pageerror", (error) => findings.push({ name: "mobile-pageerror", message: error.message }));
await mobile.goto(base);
await inspect(mobile, "dashboard-mobile", "11-dashboard-redesign-mobile.png");

await mobile.goto(base);
await mobile.getByRole("button", { name: "Connectors" }).click();
await mobile.getByRole("tab", { name: "工具权限" }).click();
await inspect(mobile, "administration-mobile", "09-administration-mobile-final.png");

await browser.close();
process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`);
