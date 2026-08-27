import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    ...(process.env.CI ? {} : { channel: "chrome" }),
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: [{
    command: "COMPANY_OS_PORT=4310 COMPANY_OS_PUBLIC_DEMO_ENABLED=true COMPANY_OS_WEB_ORIGINS=http://127.0.0.1:4173 npm start",
    url: "http://127.0.0.1:4310/health",
    reuseExistingServer: false,
    timeout: 30_000,
  }, {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 30_000,
  }],
});
