import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright";

const webOrigin = process.env.COMPANY_OS_PUBLIC_ALPHA_WEB_URL?.trim();
const outputDirectory = process.env.COMPANY_OS_PUBLIC_ALPHA_OUTPUT_DIRECTORY?.trim();
if (!webOrigin || new URL(webOrigin).protocol !== "https:") {
  throw new Error("COMPANY_OS_PUBLIC_ALPHA_HTTPS_WEB_URL_REQUIRED");
}
if (!outputDirectory) throw new Error("COMPANY_OS_PUBLIC_ALPHA_OUTPUT_DIRECTORY_REQUIRED");

const resolverRules = process.env.COMPANY_OS_PUBLIC_ALPHA_RESOLVER_RULES?.trim();
const root = resolve(outputDirectory);
await mkdir(root, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  ...(resolverRules ? { args: [`--host-resolver-rules=${resolverRules}`] } : {}),
});

const problems = [];
const screenshots = [];

function observe(page, name) {
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      problems.push({ page: name, type: `console:${message.type()}`, text: message.text() });
    }
  });
  page.on("pageerror", (error) => problems.push({ page: name, type: "pageerror", text: error.message }));
  page.on("requestfailed", (request) => problems.push({
    page: name,
    type: "requestfailed",
    text: `${request.method()} ${request.url()} ${request.failure()?.errorText ?? "unknown"}`,
  }));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      problems.push({ page: name, type: "http", text: `${response.status()} ${response.url()}` });
    }
  });
}

async function shot(page, name) {
  const path = resolve(root, name);
  await page.screenshot({ path, fullPage: true });
  const value = await readFile(path);
  screenshots.push({ name, bytes: value.byteLength,
    digest: `sha256:${createHash("sha256").update(value).digest("hex")}` });
}

try {
  const desktop = await browser.newContext({
    locale: "en-US",
    viewport: { width: 1440, height: 900 },
  });
  const page = await desktop.newPage();
  observe(page, "desktop");
  await page.goto(webOrigin, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "One control plane for every enterprise agent." }).waitFor();
  await shot(page, "01-desktop-landing-en.png");
  await page.getByRole("button", { name: "Explore the Company OS demo" }).click();
  await page.getByRole("heading", { name: "Agent Portfolio" }).waitFor();
  await page.getByText("DEMO FIXTURE · NO EXTERNAL CALLS").waitFor();
  await shot(page, "02-desktop-portfolio-en.png");
  await desktop.close();

  const tablet = await browser.newContext({
    locale: "en-US",
    viewport: { width: 768, height: 900 },
  });
  const tabletPage = await tablet.newPage();
  observe(tabletPage, "tablet");
  await tabletPage.goto(webOrigin, { waitUntil: "networkidle" });
  await tabletPage.getByRole("button", { name: "Explore the Company OS demo" }).click();
  await tabletPage.getByRole("button", { name: "Settings", exact: true }).first().click();
  await tabletPage.getByRole("tab", { name: "Language" }).click();
  await tabletPage.getByRole("radio", { name: /简体中文/ }).click();
  await tabletPage.getByRole("heading", { name: "设置", exact: true }).waitFor();
  await shot(tabletPage, "03-tablet-settings-zh-CN.png");
  await tablet.close();
} finally {
  await browser.close();
}

const result = {
  schemaVersion: 1,
  status: problems.length === 0 ? "PASSED" : "FAILED",
  webOrigin,
  screenshots,
  problems,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (problems.length > 0) process.exitCode = 1;
