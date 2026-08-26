import type { CompanyOSApplicationClient } from "./application-client.ts";

export function mountHumanInviteAcceptance(
  root: HTMLElement,
  application: CompanyOSApplicationClient,
  token: string,
): void {
  root.innerHTML = `<main class="invite-acceptance"><section class="formal-gate-panel" aria-live="polite">
    <p class="family-kicker">ENTERPRISE COMPANY INVITE</p>
    <h1>Join this company with your verified identity</h1>
    <p>The invitation becomes an active company membership only after enterprise OIDC verifies the expected email. The link is single-use and expires automatically.</p>
    <div class="invite-acceptance-status" data-invite-status>Checking enterprise session…</div>
  </section></main>`;
  const status = root.querySelector<HTMLElement>("[data-invite-status]");
  if (!status) return;

  void application.formalAccess().then((access) => {
    if (access.entryState !== "READY") {
      status.innerHTML = `<p>A verified enterprise session is required before this invitation can be accepted.</p><button class="formal-sign-in" type="button" data-invite-sign-in>Continue with enterprise SSO</button>`;
      status.querySelector<HTMLButtonElement>("[data-invite-sign-in]")?.addEventListener("click", () => {
        void application.beginFormalSignIn(window.location.pathname)
          .then((url) => window.location.assign(url))
          .catch((error) => renderInviteFailure(status, error));
      });
      return;
    }
    status.innerHTML = `<p>Your enterprise session is verified. Accepting creates the membership, role grants, organization principal, and audit event atomically.</p><button class="formal-sign-in" type="button" data-invite-accept>Accept invitation</button>`;
    status.querySelector<HTMLButtonElement>("[data-invite-accept]")?.addEventListener("click", () => {
      status.setAttribute("aria-busy", "true");
      void application.acceptHumanInvite(token).then((accepted) => {
        application.selectCompany(accepted.companyId);
        window.localStorage.setItem("company-os.selected-company", accepted.companyId);
        status.removeAttribute("aria-busy");
        status.innerHTML = `<strong>Invitation accepted</strong><p>Your active membership is ready. Opening the company…</p>`;
        window.location.assign("/?mode=formal");
      }).catch((error) => renderInviteFailure(status, error));
    });
  }).catch((error) => renderInviteFailure(status, error));
}

function renderInviteFailure(target: HTMLElement, error: unknown): void {
  target.removeAttribute("aria-busy");
  const code = error instanceof Error ? error.message : "HUMAN_INVITE_ACCEPTANCE_FAILED";
  target.innerHTML = `<strong>Invitation could not be accepted</strong><p><code>${escapeHtml(code)}</code></p>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}
