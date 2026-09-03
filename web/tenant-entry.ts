import "./tenant-entry.css";
import { readCompanyOsRuntimeConfig } from "./runtime-config.ts";
import { mountTenantActivation } from "./tenant-activation.ts";
import { mountTenantOnboarding } from "./tenant-onboarding.ts";

const root = document.querySelector<HTMLElement>("#company-os-root");
if (!root) throw new Error("Company OS tenant root element was not found.");

const runtime = readCompanyOsRuntimeConfig(window);
const tenantMatch = window.location.pathname.match(
  /^\/t\/([a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9]))$/,
);

if (window.location.pathname === "/start") {
  mountTenantOnboarding(root, { apiBaseUrl: runtime.apiBaseUrl });
} else if (tenantMatch) {
  mountTenantActivation(root, {
    slug: tenantMatch[1] as string,
    apiBaseUrl: runtime.apiBaseUrl,
  });
} else {
  window.location.replace("/");
}
