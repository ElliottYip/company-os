import "./family-ui.css";
import "./styles.css";
import { createFormalApplicationClient } from "./application-client.ts";
import { mountCompanyOS, type CompanyOSSection } from "./mount.ts";
import { mountHumanInviteAcceptance } from "./invite-acceptance.ts";
import { readCompanyOsRuntimeConfig } from "./runtime-config.ts";
import { mountTenantOnboarding } from "./tenant-onboarding.ts";
import { mountTenantActivation } from "./tenant-activation.ts";
import { parseCompanyWorkspacePath } from "./company-selection.ts";

const mountElement = document.querySelector<HTMLElement>("#company-os-root");
if (!mountElement) throw new Error("Company OS root element was not found.");

const parameters = new URLSearchParams(window.location.search);
const runtimeConfig = readCompanyOsRuntimeConfig(window);
const inviteMatch = window.location.pathname.match(
  /^\/invite\/(company_os_invite_[A-Za-z0-9_-]{32,128})$/,
);
const tenantMatch = window.location.pathname.match(
  /^\/t\/([a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9]))$/,
);
const workspaceRoute = parseCompanyWorkspacePath(window.location.pathname);
const formalMode = Boolean(inviteMatch) || Boolean(workspaceRoute) || parameters.get("mode") === "formal" ||
  runtimeConfig.mode === "formal" ||
  import.meta.env.VITE_COMPANY_OS_MODE === "formal";
const application = formalMode
  ? createFormalApplicationClient({
      baseUrl: runtimeConfig.apiBaseUrl ?? import.meta.env.VITE_COMPANY_OS_API_URL ?? "",
      webOrigin: window.location.origin,
      companyId: window.localStorage.getItem("company-os.selected-company") ?? undefined,
    })
  : undefined;

if (window.location.pathname === "/start") {
  mountTenantOnboarding(mountElement, { apiBaseUrl: runtimeConfig.apiBaseUrl });
} else if (tenantMatch) {
  mountTenantActivation(mountElement, {
    slug: tenantMatch[1] as string,
    apiBaseUrl: runtimeConfig.apiBaseUrl,
  });
} else if (inviteMatch && application) {
  mountHumanInviteAcceptance(mountElement, application, inviteMatch[1] as string);
} else if (window.location.pathname !== "/" && !workspaceRoute) {
  const state = document.createElement("main");
  state.className = "system-state";
  state.setAttribute("role", "alert");
  const heading = document.createElement("h1");
  heading.textContent = "无法打开公司空间";
  const detail = document.createElement("p");
  detail.textContent = "请检查访问地址，或返回 Company OS 首页。";
  const home = document.createElement("a");
  home.href = "/";
  home.textContent = "返回首页";
  state.append(heading, detail, home);
  mountElement.replaceChildren(state);
} else {
  mountCompanyOS({
    mountElement,
    publicDemoBaseUrl: runtimeConfig.apiBaseUrl,
    ...(workspaceRoute ? {
      requestedTenantSlug: workspaceRoute.slug,
      initialSection: (workspaceRoute.section ?? "office") as CompanyOSSection,
    } : {}),
  }, application);
}
