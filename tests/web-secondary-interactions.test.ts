import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const familyUi = await readFile(new URL("../web/family-ui.css", import.meta.url), "utf8");
const styles = await readFile(new URL("../web/styles.css", import.meta.url), "utf8");
const mount = await readFile(new URL("../web/mount.ts", import.meta.url), "utf8");
const operationalPages = await readFile(new URL("../web/pages/operational-pages.ts", import.meta.url), "utf8");
const portfolioPages = await readFile(new URL("../web/pages/agent-portfolio-pages.ts", import.meta.url), "utf8");

test("shared overlay primitives define deterministic modal and right-drawer placement", () => {
  assert.match(familyUi, /--z-overlay:/);
  assert.match(familyUi, /--overlay-edge:\s*1rem/);
  assert.match(familyUi, /\.family-modal\s*\{[^}]*position:\s*fixed;[^}]*top:\s*50%;[^}]*left:\s*50%;[^}]*margin:\s*0;[^}]*transform:\s*translate\(-50%, -50%\);/s);
  assert.match(familyUi, /\.family-drawer\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0 0 0 auto;[^}]*margin:\s*0;/s);
  assert.match(familyUi, /\.family-overlay::backdrop/);
  assert.doesNotMatch(familyUi, /overlay-content-offset/);
  assert.doesNotMatch(styles, /overlay-content-offset/);
  assert.match(styles, /\.editor-dialog form\s*\{[^}]*max-height:\s*inherit;[^}]*overflow-y:\s*auto;/s);
  assert.match(styles, /\.editor-dialog footer\s*\{[^}]*position:\s*sticky;[^}]*bottom:/s);
});

test("secondary detail surfaces share one field grid and one responsive edge contract", () => {
  assert.match(familyUi, /--overlay-label-width:\s*8rem;/);
  for (const selector of [
    ".colleague-detail-dialog dl > div",
    ".evidence-detail-body dl > div",
    ".portfolio-agent-detail-body dl > div",
  ]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(styles, new RegExp(`${escaped}[^}]*grid-template-columns:\\s*var\\(--overlay-label-width\\) minmax\\(0, 1fr\\)`, "s"));
  }
  assert.match(styles, /\.portfolio-renewal-dialog\s*\{[^}]*calc\(100vw - var\(--overlay-edge\) - var\(--overlay-edge\)\)/s);
  assert.match(styles, /@media \(max-width: 1180px\)[\s\S]*?\.portfolio-governance-subject,[\s\S]*?\.portfolio-usage-summary\s*\{[^}]*grid-template-columns:\s*1fr;/);
});

test("details use drawers while create, edit, restore and command flows use modals", () => {
  assert.match(mount, /colleague-detail-dialog family-overlay family-drawer/);
  assert.match(mount, /editor-dialog(?: editor-dialog--framed)? family-overlay family-modal/);
  assert.match(mount, /task-dialog family-overlay family-modal/);
  assert.match(mount, /command-palette family-overlay family-modal/);
  assert.match(mount, /company-restore-dialog family-overlay family-modal/);
});

test("the managed dialog controller owns close, backdrop, busy and focus-return behavior", () => {
  assert.match(mount, /const showManagedDialog/);
  assert.match(mount, /dialogReturnTargets/);
  assert.match(mount, /dialog\.addEventListener\("close"/);
  assert.match(mount, /dialog\.getAttribute\("aria-busy"\) === "true"/);
  assert.match(mount, /event\.target === dialog/);
  assert.match(mount, /target\?\.isConnected\) target\.focus\(\)/);
});

test("formal rejection and destructive planning changes use the shared confirmation contract", () => {
  assert.match(mount, /action-confirm-dialog family-overlay family-modal/);
  assert.match(mount, /confirmDangerousAction/);
  assert.match(mount, /Reject this approval\?/);
  assert.match(mount, /Cancel this goal\?/);
  assert.match(mount, /Cancel this project\?/);
  assert.match(mount, /Archive this project\?/);
  assert.match(styles, /\.action-confirm-dialog__actions[^}]*justify-content:\s*flex-end/);
});

test("workspace navigation reuses one projection and discards stale renders", () => {
  assert.match(mount, /let workspaceProjection:/);
  assert.match(mount, /workspaceProjectionInFlight \?\?=/);
  assert.match(mount, /generation !== renderGeneration/);
  assert.match(mount, /const navigateTo = async/);
  assert.doesNotMatch(mount, /const navigateTo[\s\S]{0,220}workspaceProjection\s*=\s*null/);
});

test("task detail navigation moves focus into the record and returns it to the source row", () => {
  assert.match(mount, /let workDetailReturnId:/);
  assert.match(mount, /id="work-title" tabindex="-1"/);
  assert.match(mount, /querySelector<HTMLElement>\("#work-title"\)\?\.focus\(\)/);
  assert.match(mount, /data-open-work-detail="\$\{CSS\.escape\(returnId\)\}"/);
});

test("page and administration forms keep actions at control height", () => {
  assert.match(operationalPages, /catalog-create-form/);
  assert.match(operationalPages, /budget-policy-form/);
  assert.match(styles, /\.formal-work-form:has\(> \.form-grid\)[^}]*grid-template-columns:\s*1fr/);
  assert.match(styles, /\.formal-work-form > \.family-button[^}]*justify-self:\s*start/);
  assert.match(styles, /\.budget-policy-form > \.family-button[^}]*min-height:\s*var\(--control-height-comfortable\)/);
});

test("people rows preserve the selected colleague when opening Organization", () => {
  assert.match(operationalPages, /data-open-colleague-after-navigation="human-/);
  assert.match(mount, /openColleagueAfterNavigation/);
});

test("approval and evidence flows expose read-only evidence drawers", () => {
  assert.match(operationalPages, /data-evidence-detail=/);
  assert.match(operationalPages, /data-evidence-detail-dialog=/);
  assert.match(operationalPages, /evidence-detail-dialog family-overlay family-drawer/);
  assert.match(operationalPages, /class="product-record-row evidence-record-row"/);
  assert.match(styles, /\.evidence-record-meta code/);
  assert.match(portfolioPages, /data-demo-evidence-dialog/);
  assert.match(portfolioPages, /evidence-detail-dialog family-overlay family-drawer/);
});

test("the Demo Agent inventory opens contextual Agent drawers", () => {
  assert.match(portfolioPages, /data-demo-agent-detail=/);
  assert.match(portfolioPages, /portfolio-agent-dialog family-overlay family-drawer/);
  assert.match(portfolioPages, /data-demo-agent-detail-dialog=/);
  assert.match(mount, /querySelectorAll<HTMLButtonElement>\("\[data-demo-agent-detail\]"\)/);
  assert.match(mount, /showManagedDialog\(dialog, button, "\[data-detail-close\]"\)/);
});

test("credential renewal uses a bounded workflow modal before mutation", () => {
  assert.match(portfolioPages, /portfolio-renewal-dialog editor-dialog family-overlay family-modal/);
  assert.match(portfolioPages, /data-demo-renewal-form=/);
  assert.match(mount, /showManagedDialog\(dialog, button, "textarea\[name='reason'\]"\)/);
  assert.match(mount, /querySelectorAll<HTMLFormElement>\("\[data-demo-renewal-form\]"\)/);
});

test("rejection uses a safe-focus confirmation modal before the governed decision", () => {
  assert.match(portfolioPages, /portfolio-reject-dialog editor-dialog family-overlay family-modal family-modal--confirm/);
  assert.match(portfolioPages, /data-demo-reject-form/);
  assert.match(mount, /querySelector<HTMLButtonElement>\("\[data-demo-open-reject\]"\)/);
  assert.match(mount, /"\[data-demo-reject-cancel\]"/);
  assert.match(mount, /decision: "REJECTED"/);
});

test("collapsed navigation preserves every public Demo portfolio destination", () => {
  assert.match(mount, /function mobileNavigation\(section: CompanyOSSection, portfolio = false\)/);
  for (const section of ["agents", "work", "approvals", "evidence", "connectors", "usage"]) {
    assert.match(mount, new RegExp(`id: "${section}"`));
  }
  assert.match(mount, /mobileNavigation\(section, isDemo && publicDemoSnapshot !== null\)/);
});

test("responsive page gutters never displace a top-layer dialog", () => {
  for (const page of [
    ".control-organization",
    ".control-accountability",
    ".control-administration",
    ".control-settings",
    ".product-list-page",
  ]) {
    const escaped = page.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(styles, new RegExp(`${escaped} > :not\\(\\.control-page-title\\):not\\(dialog\\)`));
  }
});
