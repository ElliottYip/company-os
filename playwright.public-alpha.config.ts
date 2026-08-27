import { defineConfig } from "@playwright/test";

const webOrigin = process.env.COMPANY_OS_PUBLIC_ALPHA_WEB_URL?.trim();
if (!webOrigin) throw new Error("COMPANY_OS_PUBLIC_ALPHA_WEB_URL_REQUIRED");

const resolverRules = process.env.COMPANY_OS_PUBLIC_ALPHA_RESOLVER_RULES?.trim();

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: webOrigin,
    channel: "chrome",
    headless: true,
    ignoreHTTPSErrors: false,
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(resolverRules
      ? { launchOptions: { args: [`--host-resolver-rules=${resolverRules}`] } }
      : {}),
  },
});
