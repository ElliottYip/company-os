import "./family-ui.css";
import "./styles.css";
import { createFormalApplicationClient } from "./application-client.ts";
import { mountCompanyOS } from "./mount.ts";
import { mountHumanInviteAcceptance } from "./invite-acceptance.ts";
import { readCompanyOsRuntimeConfig } from "./runtime-config.ts";

const mountElement = document.querySelector<HTMLElement>("#company-os-root");
if (!mountElement) throw new Error("Company OS root element was not found.");

const parameters = new URLSearchParams(window.location.search);
const runtimeConfig = readCompanyOsRuntimeConfig(window);
const inviteMatch = window.location.pathname.match(
  /^\/invite\/(company_os_invite_[A-Za-z0-9_-]{32,128})$/,
);
const formalMode = Boolean(inviteMatch) || parameters.get("mode") === "formal" ||
  runtimeConfig.mode === "formal" ||
  import.meta.env.VITE_COMPANY_OS_MODE === "formal";
const application = formalMode
  ? createFormalApplicationClient({
      baseUrl: runtimeConfig.apiBaseUrl ?? import.meta.env.VITE_COMPANY_OS_API_URL ?? "",
      webOrigin: window.location.origin,
      companyId: window.localStorage.getItem("company-os.selected-company") ?? undefined,
    })
  : undefined;

if (inviteMatch && application) {
  mountHumanInviteAcceptance(mountElement, application, inviteMatch[1] as string);
} else {
  mountCompanyOS({ mountElement, publicDemoBaseUrl: runtimeConfig.apiBaseUrl }, application);
}
