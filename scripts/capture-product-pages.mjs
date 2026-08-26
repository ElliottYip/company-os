import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.env.COMPANY_OS_QA_URL ?? "http://127.0.0.1:8131";
const outputDirectory = resolve(process.env.COMPANY_OS_QA_OUTPUT ?? "docs/audits/2026-08-24-product-grade-current-run");
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const findings = [];

async function createCompany(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Create a company/ }).click();
  const setup = page.getByRole("dialog", { name: "What is your company called?" });
  await setup.getByLabel("Company name").fill("Northstar Studio");
  await setup.getByLabel("Company mission").fill("Help teams deliver trustworthy customer outcomes");
  await setup.getByRole("button", { name: "Continue" }).click();
  await setup.getByLabel("Department name").fill("Customer Success");
  await setup.getByRole("button", { name: "Continue" }).click();
  await setup.getByLabel("Human name").fill("Alex Chen");
  await setup.getByLabel("Role and responsibility").fill("Customer Success Lead");
  await setup.getByRole("button", { name: "Continue" }).click();
  await setup.getByRole("button", { name: "Continue" }).click();
  await setup.getByRole("button", { name: "Create company" }).click();
  await page.getByRole("heading", { name: "ORGANIZATION" }).waitFor();
}

async function capture(page, name) {
  await page.waitForLoadState("networkidle");
  const metrics = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    language: document.querySelector(".company-os")?.getAttribute("lang") ?? null,
  }));
  const file = `${name}.png`;
  await page.screenshot({ path: resolve(outputDirectory, file), fullPage: true });
  findings.push({ name, file, ...metrics });
}

async function openSection(page, name) {
  await page.getByRole("button", { name, exact: true }).first().click();
}

const acceptedSections = [
  "office",
  "inbox",
  "work",
  "goals",
  "projects",
  "organization",
  "humans",
  "agents",
  "approvals",
  "evidence",
  "activity",
  "responsibility",
  "connectors",
  "usage",
  "settings",
];

async function captureAcceptedSections(page, prefix) {
  for (const section of acceptedSections) {
    await page.locator(`.company-rail nav [data-section-target="${section}"]`).evaluate((button) => button.click());
    await page.locator(`.page-stage[data-section="${section}"]`).waitFor();
    await capture(page, `${prefix}-${section}`);
  }
}

const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
desktop.on("pageerror", (error) => findings.push({ name: "desktop-pageerror", message: error.message }));
await desktop.goto(baseUrl, { waitUntil: "networkidle" });
await capture(desktop, "01-front-door-desktop");
await createCompany(desktop);
await capture(desktop, "02-organization-desktop");
await openSection(desktop, "Dashboard");
await capture(desktop, "03-dashboard-desktop");
await openSection(desktop, "Tasks");
await capture(desktop, "04-tasks-desktop");
await openSection(desktop, "Accountability");
await capture(desktop, "05-accountability-desktop");
await openSection(desktop, "Governance");
await capture(desktop, "06-governance-desktop");
await openSection(desktop, "Settings");
await capture(desktop, "07-settings-desktop");
await captureAcceptedSections(desktop, "route-desktop-en");
await desktop.getByRole("tab", { name: "Language" }).click();
await desktop.getByRole("radio", { name: /简体中文/ }).click();
await capture(desktop, "08-settings-zh-desktop");
await openSection(desktop, "仪表盘");
await capture(desktop, "11-dashboard-zh-desktop");
await openSection(desktop, "组织");
await capture(desktop, "12-organization-zh-desktop");

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
mobile.on("pageerror", (error) => findings.push({ name: "mobile-pageerror", message: error.message }));
await mobile.goto(baseUrl, { waitUntil: "networkidle" });
await capture(mobile, "09-front-door-mobile");
await createCompany(mobile);
await mobile.getByRole("navigation", { name: "Company OS mobile navigation" }).getByRole("button", { name: "Settings", exact: true }).click();
await capture(mobile, "10-settings-mobile");
await captureAcceptedSections(mobile, "route-mobile-en");

await browser.close();
await writeFile(resolve(outputDirectory, "capture-report.json"), `${JSON.stringify(findings, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`);
