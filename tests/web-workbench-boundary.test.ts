import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mountSource = await readFile(new URL("../web/mount.ts", import.meta.url), "utf8");
const clientSource = await readFile(new URL("../web/application-client.ts", import.meta.url), "utf8");
const operationalPagesSource = await readFile(new URL("../web/pages/operational-pages.ts", import.meta.url), "utf8");
const formalWorkStateSource = await readFile(new URL("../web/formal-work-state.ts", import.meta.url), "utf8");

test("Agent Boss workbench exposes stable projections without inheriting an upstream UI", () => {
  for (const section of ["office", "inbox", "work", "goals", "projects", "organization", "humans", "agents", "approvals", "evidence", "activity", "responsibility", "connectors", "usage", "settings"]) {
    assert.match(`${mountSource}\n${operationalPagesSource}`, new RegExp(`data-section=[\\\"]${section}[\\\"]`));
  }
  assert.doesNotMatch(mountSource, /paperclip|upstream-audit|node_modules/i);
  assert.doesNotMatch(mountSource, /fetch\s*\(|WebSocket\s*\(|EventSource\s*\(/);
  assert.match(mountSource, /CompanyOSApplicationClient/);
  assert.doesNotMatch(clientSource, /paperclip|react|raft\/web|nip-?07|relay/i);
});

test("every accepted operational page has Company OS-owned copy and no Paperclip runtime boundary", () => {
  for (const heading of ["INBOX", "GOALS", "PROJECTS", "HUMANS", "AGENTS", "APPROVALS", "EVIDENCE", "ACTIVITY", "USAGE & BUDGETS"]) {
    assert.match(operationalPagesSource, new RegExp(heading.replace(/[&]/g, "&")));
  }
  assert.doesNotMatch(operationalPagesSource, /paperclip|@paperclip|upstream-audit/i);
  assert.doesNotMatch(operationalPagesSource, /fetch\s*\(|WebSocket\s*\(|EventSource\s*\(/);
});

test("settings is standalone and provides a persistent product-language control", () => {
  assert.match(mountSource, /data-section="settings"/);
  assert.match(mountSource, /data-settings-tab="language"/);
  assert.match(mountSource, /data-locale="en"/);
  assert.match(mountSource, /data-locale="zh-CN"/);
  assert.match(mountSource, /setActiveLocale\(locale, window\.localStorage\)/);
  assert.match(mountSource, /User input, Agent output, evidence, and logs preserve their original text/);
});

test("company settings use a dedicated compare-and-swap profile command", () => {
  assert.match(mountSource, /data-company-profile-form/);
  assert.match(mountSource, /application\.updateCompanyProfile/);
  assert.match(clientSource, /companyEndpoint\("\/profile"\)/);
});

test("company closure is an export-bound ceremony rather than a local delete control", () => {
  assert.match(mountSource, /data-archive-company-form/);
  assert.match(mountSource, /Fresh backup file/);
  assert.match(mountSource, /Type “.*” to confirm/);
  assert.match(mountSource, /application\.archiveCompany/);
  assert.match(clientSource, /expectedStatus: "active"/);
  assert.match(clientSource, /\/companies\/\$\{encodeURIComponent\(companyId\(\)\)\}\/archive/);
  assert.doesNotMatch(mountSource, /data-delete-company/);
});

test("settings separates governed accountability review from disaster-recovery backup", () => {
  assert.match(mountSource, /data-export-accountability/);
  assert.match(mountSource, /Export accountability package/);
  assert.match(mountSource, /purposeCode: "AUDIT_REVIEW"/);
  assert.match(mountSource, /application\.exportAccountability/);
  assert.match(clientSource, /ACCOUNTABILITY_EXPORT_DIGEST_MISMATCH/);
  assert.match(clientSource, /rawEnterpriseRecord/);
});

test("portable restore creates a company atomically without inferring identity rebinding", () => {
  assert.match(mountSource, /data-formal-company-restore-form/);
  assert.match(mountSource, /identity rebinding is never inferred/);
  assert.match(mountSource, /application\.inspectCompanyBackup/);
  assert.match(mountSource, /dataset\.companyRestoreConfirmation/);
  assert.match(mountSource, /Exact human match/);
  assert.match(mountSource, /application\.importCompany/);
  assert.match(clientSource, /"\/api\/v1\/companies\/restore\/inspection"/);
  assert.match(clientSource, /"\/api\/v1\/companies\/restore"/);
  assert.doesNotMatch(clientSource, /portability\/import/);
});

test("mutation failures preserve the active product page and expose stable recovery controls", () => {
  assert.match(mountSource, /renderActionFailure/);
  assert.match(mountSource, /data-action-refresh/);
  assert.match(mountSource, /data-action-dismiss/);
  assert.match(mountSource, /current page and input have been preserved/);
});

test("interrupted execution preparation has an explicit human-reauthorization control", () => {
  assert.match(mountSource, /preparationStatus === "PENDING"/);
  assert.match(mountSource, /Resume execution preparation/);
  assert.match(mountSource, /original initiator must reauthorize/);
  assert.match(mountSource, /application\.retryWorkExecutionPreparation/);
  assert.match(clientSource, /\/preparation\/retry/);
});

test("workbench offers a local company draft while formal capabilities stay behind enterprise OIDC", () => {
  assert.match(mountSource, /data-enter-local/);
  assert.match(mountSource, /Local draft — formal capabilities are not connected/);
  assert.match(mountSource, /data-open-formal-access/);
  assert.match(mountSource, /Real Agent execution, enterprise data, Secrets, and production approvals remain unavailable/);
  assert.match(mountSource, /status\.blockers\[0\]\?\.code/);
  assert.match(mountSource, /Restricted formal navigation/);
  assert.match(mountSource, /NO COMPANY DATA LOADED/);
  assert.match(mountSource, /data-open-setup/);
  assert.match(mountSource, /data-company-menu-trigger/);
  assert.match(mountSource, /data-select-company/);
  assert.match(mountSource, /company-os\.selected-company/);
  assert.match(mountSource, /data-setup-dialog/);
  assert.match(mountSource, /Set up Company OS/);
  assert.match(mountSource, /data-add-human/);
  assert.match(mountSource, /data-add-agent/);
  assert.match(mountSource, /data-add-department/);
  assert.match(mountSource, /data-edit-department/);
  assert.match(mountSource, /data-archive-department/);
  assert.match(mountSource, /expectedResponsibilityRevision/);
  assert.match(mountSource, /data-human-profile-form/);
  assert.match(mountSource, /updateHumanProfile/);
  assert.match(mountSource, /data-agent-profile-form/);
  assert.match(mountSource, /Responsibility, autonomy and runtime use their own reviewed commands/);
  assert.match(mountSource, /data-new-task-dialog/);
});

test("dashboard prioritizes accountable humans, decisions, active work and evidence", () => {
  assert.match(mountSource, /Dashboard/);
  assert.match(mountSource, /high-risk action needs a human decision/);
  assert.match(mountSource, /Accountable human/);
  assert.match(mountSource, /Evidence admitted/);
  assert.match(mountSource, /data-section-target=\"work\"/);
  assert.match(mountSource, /data-section-target=\"agents\"/);
  assert.match(mountSource, /data-open-new-task/);
});

test("task and Inbox view controls are functional projections rather than decorative buttons", () => {
  assert.match(mountSource, /data-inbox-filter/);
  assert.match(mountSource, /activeInboxFilter = filter/);
  assert.match(mountSource, /data-work-view/);
  assert.match(mountSource, /activeWorkView =/);
  assert.match(mountSource, /data-work-filter/);
  assert.match(mountSource, /activeWorkFilter =/);
  assert.match(mountSource, /data-work-sort/);
  assert.match(mountSource, /activeWorkSort =/);
  assert.match(mountSource, /company-os\.work-view/);
  assert.match(mountSource, /company-os\.work-filter/);
  assert.match(mountSource, /company-os\.work-sort/);
});

test("workbench copy distinguishes deterministic fixtures from formal connectors", () => {
  assert.match(mountSource, /DEMO · NO NETWORK/);
  assert.match(mountSource, /fixture/);
  assert.match(mountSource, /Production connector/);
  assert.match(mountSource, /Unbound/);
});

test("governance Web exposes narrow data grant commands without Secret material", () => {
  assert.match(mountSource, /data-data-authorization-form/);
  assert.match(mountSource, /Create active grant/);
  assert.match(mountSource, /data-data-contract-status/);
  assert.match(mountSource, /revoked grants cannot be reopened/);
  assert.match(mountSource, /Installed broker/);
  assert.match(mountSource, /Formal Secret access remains fail-closed/);
  assert.match(mountSource, /data-model-route-form/);
  assert.match(mountSource, /Create disabled route/);
  assert.match(mountSource, /data-model-route-enabled/);
  assert.match(clientSource, /\/data-authorization-contracts/);
  assert.doesNotMatch(mountSource, /name="secret(Value|Material|Token|Password)"/i);
});

test("formal task assignment consumes enabled model policies without exposing credential metadata", () => {
  assert.match(mountSource, /name="modelRouting"/);
  assert.match(mountSource, /Company OS selects and freezes an eligible installed route/);
  assert.match(mountSource, /governance\.modelRoutingPolicies/);
  assert.match(mountSource, /credentialConfigured/);
  assert.doesNotMatch(formalWorkStateSource, /credentialReference|credentialVersion|modelSecret/i);
});

test("secret administration hands off to the Broker without collecting credential material", () => {
  assert.match(mountSource, /data-secret-management-form/);
  assert.match(mountSource, /Open secure Broker/);
  assert.match(mountSource, /target="_blank" rel="noopener noreferrer"/);
  assert.match(mountSource, /data-check-secret-session/);
  assert.match(clientSource, /\/secret-reference-sessions/);
  assert.doesNotMatch(mountSource, /name="(?:secretValue|credentialValue|accessToken|privateKey|password)/i);
});

test("formal profile exposes Better Auth sign-out without changing company responsibility", () => {
  assert.match(mountSource, /data-sign-out/);
  assert.match(mountSource, /application\.signOut\(\)/);
  assert.match(clientSource, /\/api\/auth\/sign-out/);
});

test("Agent roster exposes only the dedicated atomic responsibility-transfer command", () => {
  assert.match(operationalPagesSource, /data-responsibility-transfer-form/);
  assert.match(operationalPagesSource, /newAccountableHumanId/);
  assert.match(mountSource, /application\.transferResponsibility/);
  assert.match(clientSource, /\/responsibility-transfers/);
  assert.doesNotMatch(operationalPagesSource, /data-responsibility-transfer-form[^;]+name="accountableHumanId"/);
});

test("governance Web exposes upstream-aligned tool profiles, bindings, and policies", () => {
  assert.match(mountSource, /data-tool-profile-form/);
  assert.match(mountSource, /data-tool-binding-form/);
  assert.match(mountSource, /data-tool-policy-form/);
  assert.match(mountSource, /Default deny remains in force/);
  assert.match(mountSource, /require_approval/);
  assert.match(mountSource, /Unsupported runtime semantics fail closed/);
  assert.match(clientSource, /\/tool-profiles/);
  assert.match(clientSource, /\/tool-policies/);
});

test("usage page exposes verified costs and revisioned budget policy controls", () => {
  assert.match(operationalPagesSource, /data-budget-policy-form/);
  assert.match(operationalPagesSource, /Verified spend/);
  assert.match(operationalPagesSource, /No cost is estimated/);
  assert.doesNotMatch(operationalPagesSource, /Usage projection is not connected/);
  assert.match(clientSource, /\/budgets\/policies/);
});
