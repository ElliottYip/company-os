import type { CompanyWorkState } from "../../application/company-operations.ts";
import type { AdministrationProjection } from "../../application/get-administration-projection.ts";
import type { OperationalRiskProjection } from "../../application/get-operational-risk-projection.ts";
import type { OperationalRiskRuleCatalog } from "../../core/operational-risk.ts";
import type { OrganizationDraft } from "../../core/organization.ts";
import type { PlanningCatalog } from "../../core/planning.ts";
import type { CompanyOSLocale } from "../i18n/index.ts";
import type { CompanyOSAssignmentOptions } from "../application-client.ts";
import type { CompanyActivityPage } from "../../application/get-company-activity.ts";
import type { AccountabilityLedgerProjection } from "../../application/get-accountability-ledger.ts";
import type { FormalWorkCatalog, FormalWorkCatalogItem } from "../../application/formal-agent-boss-api.ts";
import { ACTION_CATALOG } from "../../core/responsibility.ts";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[character] ?? character);
}

function c(locale: CompanyOSLocale, english: string, chinese: string): string {
  return locale === "zh-CN" ? chinese : english;
}

function enumLabel(locale: CompanyOSLocale, value: string, uppercaseEnglish = false): string {
  if (locale !== "zh-CN") return uppercaseEnglish ? value.toLocaleUpperCase() : value;
  const labels: Readonly<Record<string, string>> = {
    company: "公司",
    team: "团队",
    agent: "Agent",
    task: "任务",
    planned: "已规划",
    active: "进行中",
    achieved: "已达成",
    cancelled: "已取消",
    backlog: "待规划",
    in_progress: "进行中",
    completed: "已完成",
    pending_approval: "待审批",
    paused: "已暂停",
    idle: "待命",
    running: "运行中",
    error: "异常",
    terminated: "已终止",
    eligible: "可执行",
    invalid_org_chain: "汇报关系异常",
    unknown_status: "状态未知",
    DRAFT: "草稿",
    ACTIVE: "生效中",
    SUSPENDED: "已暂停",
    ENDED: "已结束",
    MISSING: "未配置",
    ok: "正常",
    warning: "已预警",
    hard_stop: "已停止",
    reported: "已核验",
    unpriced: "未定价",
    calendar_month_utc: "自然月（UTC）",
    lifetime: "累计",
  };
  return labels[value] ?? value;
}

function principalName(organization: OrganizationDraft, id: string): string {
  return organization.humans.find((human) => human.id === id)?.name
    ?? organization.agents.find((agent) => agent.id === id)?.name
    ?? id;
}

function pageHeader(id: string, title: string, description: string, badge?: string): string {
  return `<header class="control-page-title"><div><h1 id="${id}">${title}</h1><p>${description}</p></div>${badge ? `<span class="status-pill">${badge}</span>` : ""}</header>`;
}

function emptyState(title: string, description: string): string {
  return `<div class="product-empty-state"><strong>${title}</strong><p>${description}</p></div>`;
}

export type InboxFilter = "needs-me" | "assigned" | "resolved";

export function operationalRiskPage(
  risk: OperationalRiskProjection | null,
  organization: OrganizationDraft,
  locale: CompanyOSLocale,
  ruleCatalog: OperationalRiskRuleCatalog | null,
): string {
  const actionFor = (status: string) => ({ CONTAINED: "START_INVESTIGATION", INVESTIGATING: "START_REMEDIATION",
    REMEDIATING: "REQUEST_REVIEW", REVIEW: "RECOVER", RECOVERED: "CLOSE", CLOSED: "REOPEN",
  })[status] ?? null;
  const cases = risk?.cases ?? [];
  const alerts = risk?.alerts ?? [];
  const actionLabel = (operation: string) => c(locale, ({ START_INVESTIGATION: "Start investigation",
    START_REMEDIATION: "Start remediation", REQUEST_REVIEW: "Request review", RECOVER: "Resume execution",
    CLOSE: "Close Case", REOPEN: "Reopen Case" } as Record<string, string>)[operation] ?? operation,
  ({ START_INVESTIGATION: "开始调查", START_REMEDIATION: "开始整改", REQUEST_REVIEW: "提交复核",
    RECOVER: "恢复执行", CLOSE: "关闭 Case", REOPEN: "重新打开" } as Record<string, string>)[operation] ?? operation);
  const caseRows = cases.map((record) => {
    const operation = actionFor(record.status);
    const fields = operation === "START_REMEDIATION"
      ? `<label class="family-field">${c(locale, "Root cause", "根因")}<textarea class="family-control" name="rootCause" maxlength="2000" required></textarea></label>`
      : operation === "REQUEST_REVIEW"
        ? `<label class="family-field">${c(locale, "Remediation", "整改措施")}<textarea class="family-control" name="remediation" maxlength="2000" required></textarea></label><label class="family-field">${c(locale, "Prevention", "预防措施")}<textarea class="family-control" name="prevention" maxlength="2000" required></textarea></label>` : "";
    return `<article class="admin-surface risk-case-card"><header><div><p class="family-kicker">${escapeHtml(record.id)} · rev ${record.revision}</p><h2>${escapeHtml(record.summary)}</h2></div><span class="status-pill ${record.status === "CLOSED" || record.status === "RECOVERED" ? "status-pill--demo" : "status-pill--human"}">${escapeHtml(enumLabel(locale, record.status))}</span></header><dl class="settings-list"><div><dt>${c(locale, "Agent", "Agent")}</dt><dd><button type="button" class="inline-record-link" data-open-agent-detail="${escapeHtml(record.agentId)}">${escapeHtml(principalName(organization, record.agentId))}</button></dd></div><div><dt>${c(locale, "Work", "任务")}</dt><dd>${escapeHtml(record.workId)}</dd></div><div><dt>${c(locale, "Accountable human", "真人负责人")}</dt><dd>${escapeHtml(principalName(organization, record.accountableHumanId))}</dd></div><div><dt>${c(locale, "Containment", "遏制状态")}</dt><dd>${escapeHtml(enumLabel(locale, record.containment))}</dd></div></dl>${record.rootCause ? `<p><strong>${c(locale, "Root cause", "根因")}:</strong> ${escapeHtml(record.rootCause)}</p>` : ""}${record.remediation ? `<p><strong>${c(locale, "Remediation", "整改")}:</strong> ${escapeHtml(record.remediation)}</p>` : ""}${operation ? `<form class="formal-work-form risk-case-form" data-ai-case-form data-case-id="${escapeHtml(record.id)}" data-case-operation="${operation}" data-case-revision="${record.revision}">${fields}<label class="family-field">${c(locale, "Decision reason", "处理原因")}<textarea class="family-control" name="reason" maxlength="1000" required></textarea></label><button class="family-button family-button--primary" type="submit">${actionLabel(operation)}</button></form>` : `<p class="family-kicker">${record.status === "RECOVERY_REQUESTED" ? c(locale, "Waiting for Connector recovery confirmation", "正在等待 Connector 确认恢复") : record.status === "OPEN" ? c(locale, "Waiting for durable containment confirmation", "正在等待持久化遏制确认") : c(locale, "No action available", "当前无可用操作")}</p>`}</article>`;
  }).join("");
  const edges = (risk?.accessEdges ?? []).map((edge) => {
    const trace = risk?.traces.find(({ id }) => id === edge.traceId);
    return `<article class="product-record-row product-record-row--static"><span class="record-monogram">→</span><span><small>${escapeHtml(edge.operation)} · ${escapeHtml(edge.authorityId)}</small><strong>${escapeHtml(edge.subjectAgentId)} → ${escapeHtml(edge.resourceType)}:${escapeHtml(edge.resourceId)}</strong><em>${escapeHtml(trace?.workId ?? edge.traceId)} · ${escapeHtml(trace?.recordedAt ?? edge.spanId)}</em></span></article>`;
  }).join("");
  const ruleRows = (ruleCatalog?.rules ?? []).map((rule) => `<article class="product-record-row"><span class="record-monogram">!</span><span><small>${escapeHtml(rule.severity)} · ${escapeHtml(rule.resourceType)}</small><strong>${escapeHtml(rule.summary)}</strong><em>${escapeHtml(rule.resourceId)}${rule.operation ? ` · ${escapeHtml(rule.operation)}` : ""}</em></span><button class="agent-lifecycle-action" type="button" data-delete-risk-rule="${escapeHtml(rule.id)}">${c(locale, "Remove", "移除")}</button></article>`).join("");
  const rules = ruleCatalog ? `<section class="admin-surface risk-rules-panel"><header><div><p class="family-kicker">${c(locale, "POLICY INPUT", "策略输入")} · rev ${ruleCatalog.revision}</p><h2>${c(locale, "Operational risk rules", "运行风险规则")}</h2></div></header><form class="formal-work-form" data-risk-rule-form data-rule-revision="${ruleCatalog.revision}"><label class="family-field">${c(locale, "Rule ID", "规则 ID")}<input class="family-control" name="id" required pattern="[a-z0-9][a-z0-9-]{0,63}"></label><label class="family-field">${c(locale, "Resource", "资源")}<select class="family-control" name="resourceType"><option>DATA</option><option>TOOL</option><option>MODEL</option><option>ASSET</option></select></label><label class="family-field">${c(locale, "Resource ID", "资源 ID")}<input class="family-control" name="resourceId" required pattern="[a-z0-9][a-z0-9-]{0,63}"></label><label class="family-field">${c(locale, "Operation (optional)", "操作（可选）")}<input class="family-control" name="operation" maxlength="120"></label><label class="family-field">${c(locale, "Severity", "严重级别")}<select class="family-control" name="severity"><option>CRITICAL</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></label><label class="family-field">${c(locale, "Summary", "告警说明")}<input class="family-control" name="summary" maxlength="1000" required></label><button class="family-button family-button--primary" type="submit">${c(locale, "Add rule", "添加规则")}</button></form><div class="product-list-surface">${ruleRows || emptyState(c(locale, "No risk rule configured", "尚未配置风险规则"), c(locale, "Runtime traces are retained as bounded access paths, but no alert or Case opens until a rule matches.", "运行 Trace 仍会以有限访问路径记录，但规则命中前不会创建告警或 Case。"))}</div></section>` : "";
  return `<section class="page-stage product-list-page" data-section="risk" aria-labelledby="risk-title">${pageHeader("risk-title", c(locale, "RISK & AI CASES", "风险与 AI CASE"), c(locale, "Runtime access paths, policy alerts, durable containment, investigation, remediation, and verified recovery in one chain.", "把运行访问路径、策略告警、持久化遏制、调查、整改与确认恢复串成一条可审计链。"), `${alerts.filter(({ status }) => status !== "RESOLVED").length} ${c(locale, "active alerts", "个活跃告警")}`)}${rules}<section class="risk-overview-grid"><div class="admin-surface"><h2>${c(locale, "Access Map", "Access Map")}</h2><p>${c(locale, "Bounded resource relationships only; prompts, outputs, credentials, and enterprise records are excluded.", "仅展示有限资源关系；提示词、输出、凭据与企业数据原文不会进入控制面。")}</p><div class="product-list-surface">${edges || emptyState(c(locale, "No observed access path", "暂无访问路径"), c(locale, "Paths appear after a formal Connector reports a bounded runtime trace.", "正式 Connector 上报有限运行 Trace 后，路径会显示在这里。"))}</div></div><div><h2>${c(locale, "AI Cases", "AI Case")}</h2>${caseRows || `<section class="admin-surface">${emptyState(c(locale, "No AI Case", "暂无 AI Case"), c(locale, "A Case opens only when an enabled rule detects a real Connector observation.", "仅当启用的规则命中真实 Connector 观测时才会创建 Case。"))}</section>`}</div></section></section>`;
}

const TERMINAL_ATTEMPT_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"]);
const TERMINAL_WORK_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

function latestWorkStatus(item: FormalWorkCatalogItem): string {
  return item.attempts.reduce((latest, attempt) =>
    !latest || attempt.attemptNumber > latest.attemptNumber ? attempt : latest, undefined as FormalWorkCatalogItem["attempts"][number] | undefined
  )?.status ?? item.work.status;
}

function inboxWorkRow(
  item: FormalWorkCatalogItem,
  organization: OrganizationDraft,
  locale: CompanyOSLocale,
): string {
  const status = latestWorkStatus(item);
  const agent = principalName(organization, item.work.agentId);
  return `<button type="button" class="product-record-row" data-open-work-detail="${escapeHtml(item.work.id)}"><span class="control-task-status ${status === "AWAITING_APPROVAL" ? "is-blocked" : ""}" aria-hidden="true"></span><span><small>${escapeHtml(status)}</small><strong>${escapeHtml(item.work.title)}</strong><em>${escapeHtml(agent)} · ${c(locale, "accountable to", "真人负责人")} ${escapeHtml(principalName(organization, item.work.accountableHumanId))}</em></span><span class="status-pill">${escapeHtml(enumLabel(locale, status, true))}</span></button>`;
}

export function inboxPage(
  state: CompanyWorkState,
  organization: OrganizationDraft,
  locale: CompanyOSLocale,
  filter: InboxFilter = "needs-me",
  catalog: FormalWorkCatalog | null = null,
  ledger: AccountabilityLedgerProjection | null = null,
  workTitle?: string,
): string {
  const pendingApprovals = ledger?.approvals.filter(({ status }) => status === "PENDING") ?? [];
  const pending = pendingApprovals.length > 0 || (ledger === null && state.phase === "AWAITING_APPROVAL");
  const agent = escapeHtml(principalName(organization, state.responsibility.executingAgentId));
  const human = escapeHtml(principalName(organization, state.responsibility.accountableHumanId));
  const assigned = (catalog?.items ?? []).filter((item) => {
    const status = latestWorkStatus(item);
    return !TERMINAL_ATTEMPT_STATUSES.has(status) && !TERMINAL_WORK_STATUSES.has(status);
  });
  const resolved = (catalog?.items ?? []).filter((item) => {
    const status = latestWorkStatus(item);
    return TERMINAL_ATTEMPT_STATUSES.has(status) || TERMINAL_WORK_STATUSES.has(status);
  });
  const selectedCount = filter === "needs-me" ? (pendingApprovals.length || (pending ? 1 : 0))
    : filter === "assigned" ? assigned.length : resolved.length;
  const filters: readonly { readonly id: InboxFilter; readonly label: string }[] = [
    { id: "needs-me", label: c(locale, "Needs me", "待我处理") },
    { id: "assigned", label: c(locale, "Assigned", "已分配") },
    { id: "resolved", label: c(locale, "Resolved", "已完成") },
  ];
  const needsMeContent = pending
    ? `<button type="button" class="product-record-row" data-section-target="approvals"><span class="control-task-status is-blocked" aria-hidden="true"></span><span><small>${c(locale, "HIGH RISK · PAUSED", "高风险 · 已暂停")}</small><strong>${escapeHtml(workTitle ?? c(locale, "High-risk work awaiting review", "待复核的高风险任务"))}</strong><em>${agent} ${c(locale, "is waiting for", "正在等待")} ${human}</em></span><span class="status-pill status-pill--human">${c(locale, "DECIDE", "查看审批")}</span></button>`
    : emptyState(c(locale, "Nothing needs your decision", "目前没有需要你处理的事项"), c(locale, "High-risk actions and responsibility exceptions appear here only after a valid server-side pause.", "高风险操作或责任异常暂停后，会自动进入待办。"));
  const workItems = filter === "assigned" ? assigned : resolved;
  const workContent = workItems.length
    ? workItems.map((item) => inboxWorkRow(item, organization, locale)).join("")
    : emptyState(
        filter === "assigned" ? c(locale, "No assigned work", "暂无已分配任务") : c(locale, "No resolved work", "暂无已完成任务"),
        filter === "assigned" ? c(locale, "Work appears here after a server-authorized assignment.", "任务通过服务端授权并分配后会显示在这里。") : c(locale, "Terminal work appears here after its result is recorded.", "任务形成终态并记录结果后会显示在这里。"),
      );
  return `<section class="page-stage product-list-page" data-section="inbox" aria-labelledby="inbox-title">
    ${pageHeader("inbox-title", c(locale, "INBOX", "待办"), c(locale, "Work that needs your attention, separated by responsibility and risk.", "需要你处理的审批和责任事项都在这里。"), selectedCount ? c(locale, `${selectedCount} ITEMS`, `${selectedCount} 项`) : c(locale, "ALL CLEAR", "暂无事项"))}
    <div class="product-filter-tabs" role="tablist" aria-label="${c(locale, "Inbox filters", "待办筛选")}">${filters.map(({ id, label }) => `<button type="button" role="tab" data-inbox-filter="${id}" aria-selected="${filter === id}">${label}</button>`).join("")}</div>
    <section class="admin-surface product-list-surface" role="tabpanel">${filter === "needs-me" ? needsMeContent : workContent}</section>
  </section>`;
}

export function goalsPage(
  state: CompanyWorkState,
  organization: OrganizationDraft,
  locale: CompanyOSLocale,
  planning?: PlanningCatalog,
  editable = false,
  activeWorkTitle?: string,
): string {
  const active = state.phase !== "READY";
  return `<section class="page-stage product-list-page" data-section="goals" aria-labelledby="goals-title">
    ${pageHeader("goals-title", c(locale, "GOALS", "目标"), c(locale, "Company outcomes with an accountable human, scope, and verifiable progress.", "每个目标都明确真人负责人、适用范围和可核验的进展。"))}
    ${editable ? `<form class="admin-surface formal-work-form" data-goal-form><label class="family-field">${c(locale, "Goal title", "目标名称")}<input class="family-control" name="title" required maxlength="120"></label><label class="family-field">${c(locale, "Level", "目标层级")}<select class="family-control" name="level"><option value="company">${enumLabel(locale, "company")}</option><option value="team">${enumLabel(locale, "team")}</option><option value="agent">${enumLabel(locale, "agent")}</option><option value="task">${enumLabel(locale, "task")}</option></select></label><label class="family-field">${c(locale, "Accountable human", "真人负责人")}<select class="family-control" name="accountableHumanId">${organization.humans.map((human) => `<option value="${escapeHtml(human.id)}">${escapeHtml(human.name)}</option>`).join("")}</select></label><button class="family-button family-button--primary" type="submit">${c(locale, "Create goal", "创建目标")}</button></form>` : ""}
    <section class="admin-surface product-list-surface"><article class="product-record-row product-record-row--static"><span class="record-monogram">G</span><span><small>${escapeHtml(organization.company.name)}</small><strong>${escapeHtml(organization.company.purpose || c(locale, "Company purpose not defined", "尚未设置公司使命"))}</strong><em>${c(locale, "Company-level purpose · owned by the company structure", "公司使命 · 由公司治理结构承接")}</em></span><span class="status-pill">${c(locale, "FOUNDATION", "公司目标")}</span></article>${(planning?.goals ?? []).map((goal) => {
      const transitions = goal.status === "planned" ? [["active", c(locale, "Activate", "启动")], ["cancelled", c(locale, "Cancel", "取消")]]
        : goal.status === "active" ? [["achieved", c(locale, "Mark achieved", "标记达成")], ["cancelled", c(locale, "Cancel", "取消")]]
          : [];
      const actions = editable && transitions.length
        ? `<span class="task-actions">${transitions.map(([status, label]) => `<button type="button" class="agent-lifecycle-action" data-goal-id="${escapeHtml(goal.id)}" data-goal-status="${status}">${label}</button>`).join("")}</span>`
        : "";
      return `<article class="product-record-row product-record-row--static"><span class="record-monogram">G</span><span><small>${escapeHtml(enumLabel(locale, goal.level, true))}</small><strong>${escapeHtml(goal.title)}</strong><em>${escapeHtml(goal.description ?? c(locale, "No description", "暂无描述"))}</em></span><span><span class="status-pill">${escapeHtml(enumLabel(locale, goal.status, true))}</span>${actions}</span></article>`;
    }).join("")}${active ? `<button type="button" class="product-record-row" data-section-target="work"><span class="control-task-status"></span><span><small>${escapeHtml(state.responsibility.workId)}</small><strong>${escapeHtml(activeWorkTitle ?? c(locale, "Active accountable work", "进行中的责任任务"))}</strong><em>${c(locale, "Executing work contributes to this outcome", "当前任务正在推进该目标")}</em></span><span class="status-pill status-pill--demo">${c(locale, "ACTIVE", "进行中")}</span></button>` : ""}</section>
  </section>`;
}

export function projectsPage(
  organization: OrganizationDraft,
  locale: CompanyOSLocale,
  planning?: PlanningCatalog,
  editable = false,
): string {
  return `<section class="page-stage product-list-page" data-section="projects" aria-labelledby="projects-title">
    ${pageHeader("projects-title", c(locale, "PROJECTS", "项目"), c(locale, "Cross-department scopes and workspaces without creating a second task authority.", "在同一套任务体系中管理跨部门项目和工作空间。"))}
    ${editable ? `<form class="admin-surface formal-work-form" data-project-form><label class="family-field">${c(locale, "Project name", "项目名称")}<input class="family-control" name="name" required maxlength="120"></label><label class="family-field">${c(locale, "Department", "部门")}<select class="family-control" name="departmentId">${organization.departments.map((department) => `<option value="${escapeHtml(department.id)}">${escapeHtml(department.name)}</option>`).join("")}</select></label><label class="family-field">${c(locale, "Accountable human", "真人负责人")}<select class="family-control" name="accountableHumanId">${organization.humans.map((human) => `<option value="${escapeHtml(human.id)}">${escapeHtml(human.name)}</option>`).join("")}</select></label><button class="family-button family-button--primary" type="submit">${c(locale, "Create project", "创建项目")}</button></form>` : ""}
    <section class="admin-surface product-list-surface">${(planning?.projects ?? []).map((project) => {
      const transitions = project.status === "backlog" ? [["planned", c(locale, "Plan", "进入计划")], ["cancelled", c(locale, "Cancel", "取消")]]
        : project.status === "planned" ? [["in_progress", c(locale, "Start", "开始")], ["backlog", c(locale, "Back to backlog", "退回待规划")], ["cancelled", c(locale, "Cancel", "取消")]]
          : project.status === "in_progress" ? [["completed", c(locale, "Complete", "完成")], ["cancelled", c(locale, "Cancel", "取消")]]
            : [];
      const lifecycle = editable && !project.archivedAt
        ? project.status === "completed" || project.status === "cancelled"
          ? `<button type="button" class="agent-lifecycle-action" data-project-archive="${escapeHtml(project.id)}">${c(locale, "Archive", "归档")}</button>`
          : transitions.map(([status, label]) => `<button type="button" class="agent-lifecycle-action" data-project-id="${escapeHtml(project.id)}" data-project-status="${status}">${label}</button>`).join("")
        : "";
      return `<article class="product-record-row product-record-row--static"><span class="record-monogram">${escapeHtml(project.name.slice(0, 1).toLocaleUpperCase())}</span><span><small>${c(locale, project.archivedAt ? "ARCHIVED PROJECT" : "PROJECT", project.archivedAt ? "已归档项目" : "项目")}</small><strong>${escapeHtml(project.name)}</strong><em>${escapeHtml(project.description ?? c(locale, "No description", "暂无描述"))}</em></span><span><span class="status-pill">${escapeHtml(project.archivedAt ? c(locale, "ARCHIVED", "已归档") : enumLabel(locale, project.status, true))}</span><span class="task-actions">${lifecycle}</span></span></article>`;
    }).join("")}${organization.departments.map((department) => `<article class="product-record-row product-record-row--static"><span class="record-monogram">${escapeHtml(department.name.slice(0, 1).toLocaleUpperCase())}</span><span><small>${c(locale, "DEPARTMENT WORKSPACE", "部门工作空间")}</small><strong>${escapeHtml(department.name)}</strong><em>${escapeHtml(department.mandate || c(locale, "No mandate recorded", "尚未设置部门职责"))}</em></span><span class="status-pill">${c(locale, "READY", "可用")}</span></article>`).join("")}</section>
  </section>`;
}

export function humansPage(organization: OrganizationDraft, locale: CompanyOSLocale): string {
  return `<section class="page-stage product-list-page" data-section="humans" aria-labelledby="humans-title">
    ${pageHeader("humans-title", c(locale, "HUMANS", "真人成员"), c(locale, "Verified people, company roles, and the Agent responsibilities they own.", "查看已验证的真人成员、公司岗位及其负责的 Agent。"), `${organization.humans.length}`)}
    <section class="admin-surface product-list-surface">${organization.humans.map((human) => { const agents = organization.agents.filter((agent) => agent.accountableHumanId === human.id); const department = organization.departments.find((entry) => entry.id === human.departmentId)?.name ?? human.departmentId; return `<button type="button" class="product-record-row" data-section-target="organization"><span class="record-monogram record-monogram--human">${escapeHtml(human.name.slice(0, 1).toLocaleUpperCase())}</span><span><small>${escapeHtml(department)}</small><strong>${escapeHtml(human.name)}</strong><em>${escapeHtml(human.title)} · ${c(locale, `Responsible for ${agents.length} Agents`, `负责 ${agents.length} 个 Agent`)}</em></span><span class="status-pill status-pill--human">${c(locale, "ACCOUNTABLE", "负责人")}</span></button>`; }).join("")}</section>
  </section>`;
}

export function agentsPage(
  state: CompanyWorkState,
  organization: OrganizationDraft,
  locale: CompanyOSLocale,
  options: CompanyOSAssignmentOptions,
  editable = false,
): string {
  const responsibilityAction = (agentId: string) => {
    const contract = options.responsibilities.contracts.find((entry) => entry.agentId === agentId);
    if (!contract || contract.status !== "DRAFT") return "";
    return `<button type="button" class="agent-lifecycle-action" data-responsibility-action="ACTIVATE" data-agent-id="${escapeHtml(agentId)}">${c(locale, "Activate responsibility", "启用责任合同")}</button>`;
  };
  const responsibilityPolicy = (agentId: string) => {
    const contract = options.responsibilities.contracts.find((entry) => entry.agentId === agentId);
    if (!editable || !contract || contract.status === "ENDED") return "";
    const rows = ACTION_CATALOG.map((action) => {
      const mode = contract.approvalRequiredActions.includes(action.id)
        ? "approval"
        : contract.allowedActions.includes(action.id) ? "allowed" : "blocked";
      return `<label class="responsibility-policy-row"><span><strong>${escapeHtml(action.label)}</strong><small>${escapeHtml(action.id)}${action.critical ? ` · ${c(locale, "high risk", "高风险")}` : ""}</small></span><select class="family-control" name="action:${escapeHtml(action.id)}" aria-label="${escapeHtml(action.id)} policy"><option value="blocked"${mode === "blocked" ? " selected" : ""}>${c(locale, "Blocked", "阻止")}</option>${action.critical ? "" : `<option value="allowed"${mode === "allowed" ? " selected" : ""}>${c(locale, "Allowed", "允许")}</option>`}<option value="approval"${mode === "approval" ? " selected" : ""}>${c(locale, "Human approval", "真人审批")}</option></select></label>`;
    }).join("");
    return `<details class="responsibility-policy-editor"><summary>${c(locale, "Action policy", "动作策略")}</summary><form data-responsibility-policy-form data-agent-id="${escapeHtml(agentId)}"><p>${c(locale, "Choose what this Agent may do. High-risk capabilities always require a human decision.", "配置该 Agent 可执行的动作；高风险能力必须经过真人审批。")}</p><div class="responsibility-policy-grid">${rows}</div><button class="agent-lifecycle-action" type="submit">${c(locale, "Save action policy", "保存动作策略")}</button></form></details>`;
  };
  const actionButtons = (agentId: string, status: string) => {
    const actions = status === "pending_approval" ? ["APPROVE", "TERMINATE"]
      : status === "paused" ? ["RESUME", "TERMINATE"]
      : status === "error" ? ["CLEAR_ERROR", "PAUSE", "TERMINATE"]
      : status === "terminated" ? []
      : ["PAUSE", "TERMINATE"];
    const english: Record<string, string> = {
      APPROVE: "Approve", PAUSE: "Pause", RESUME: "Resume",
      CLEAR_ERROR: "Clear error", TERMINATE: "Terminate",
    };
    const chinese: Record<string, string> = {
      APPROVE: "批准", PAUSE: "暂停", RESUME: "恢复",
      CLEAR_ERROR: "清除错误", TERMINATE: "终止",
    };
    return actions.map((action) => `<button type="button" class="agent-lifecycle-action" data-agent-lifecycle-action="${action}" data-agent-id="${escapeHtml(agentId)}">${c(locale, english[action] ?? action, chinese[action] ?? action)}</button>`).join("");
  };
  const transferForm = (agentId: string, currentHumanId: string) => {
    const alternatives = organization.humans.filter(({ id }) => id !== currentHumanId);
    if (!editable || !alternatives.length) return "";
    return `<form class="responsibility-transfer-form" data-responsibility-transfer-form data-agent-id="${escapeHtml(agentId)}"><label>${c(locale, "Transfer to", "转交给")}<select class="family-control" name="newAccountableHumanId">${alternatives.map((human) => `<option value="${escapeHtml(human.id)}">${escapeHtml(human.name)}</option>`).join("")}</select></label><label>${c(locale, "Backup human", "候补负责人")}<select class="family-control" name="newBackupHumanId"><option value="">${c(locale, "None", "无")}</option>${organization.humans.map((human) => `<option value="${escapeHtml(human.id)}">${escapeHtml(human.name)}</option>`).join("")}</select></label><label>${c(locale, "Reason", "转交原因")}<input class="family-control" name="reason" required maxlength="1000"></label><button class="agent-lifecycle-action" type="submit">${c(locale, "Transfer responsibility", "转交责任")}</button></form>`;
  };
  return `<section class="page-stage product-list-page" data-section="agents" aria-labelledby="agents-title">
    ${pageHeader("agents-title", c(locale, "AGENTS", "AGENT"), c(locale, "Agent colleagues with equal Connector contracts and explicit human ownership.", "所有 Agent 通过统一的 Connector 合约接入，并明确绑定真人负责人。"), `${organization.agents.length}`)}
    <section class="admin-surface product-list-surface">${organization.agents.map((agent) => { const running = agent.id === state.responsibility.executingAgentId && state.phase !== "READY"; const lifecycle = options.lifecycle.agents.find(({ agentId }) => agentId === agent.id); const contract = options.responsibilities.contracts.find(({ agentId }) => agentId === agent.id); const status = running ? "running" : lifecycle?.status ?? "pending_approval"; const reason = lifecycle?.eligibility.invokabilityReason ?? "pending_approval"; return `<article class="product-record-row product-record-row--static agent-lifecycle-row"><span class="record-monogram record-monogram--agent">AI</span><span><small>${escapeHtml(agent.runtimeConnectorId)}</small><strong>${escapeHtml(agent.name)}</strong><em>${escapeHtml(agent.role)} · ${c(locale, "accountable to", "真人负责人")} ${escapeHtml(principalName(organization, agent.accountableHumanId))}</em><small>${c(locale, "Invocation", "执行资格")}: ${escapeHtml(enumLabel(locale, reason))} · ${c(locale, "Responsibility", "责任合同")}: ${escapeHtml(enumLabel(locale, contract?.status ?? "MISSING"))}</small>${responsibilityPolicy(agent.id)}${transferForm(agent.id, agent.accountableHumanId)}</span><div class="agent-lifecycle-controls"><button type="button" class="agent-lifecycle-action" data-open-agent-detail="${escapeHtml(agent.id)}">${c(locale, "Details & runtime", "详情与运行环境")}</button><span class="status-pill ${running ? "status-pill--demo" : ""}">${escapeHtml(enumLabel(locale, status, true))}</span>${responsibilityAction(agent.id)}${actionButtons(agent.id, status)}</div></article>`; }).join("")}</section>
  </section>`;
}

export function approvalsPage(
  state: CompanyWorkState,
  organization: OrganizationDraft,
  locale: CompanyOSLocale,
  workTitle?: string,
  ledger?: AccountabilityLedgerProjection | null,
): string {
  const pending = state.phase === "AWAITING_APPROVAL";
  const currentApprovalId = state.responsibility.approvalIds.at(-1);
  const history = ledger?.approvals.filter(({ request, status }) =>
    !(pending && status === "PENDING" && request.id === currentApprovalId))
    .map(({ request, decision, status }) => `<article class="product-record-row product-record-row--static"><span class="record-monogram">A</span><span><small>${escapeHtml(status)} · ${escapeHtml(request.requestedAt)}</small><strong>${escapeHtml(request.binding.action.description)}</strong><em>${escapeHtml(request.binding.workId)} · ${escapeHtml(request.binding.action.inputDigest)} · ${request.binding.evidenceReferences.length} ${c(locale, "evidence references", "项证据引用")}</em></span><span class="status-pill ${status === "APPROVED" ? "status-pill--demo" : status === "REJECTED" ? "status-pill--unbound" : "status-pill--human"}">${escapeHtml(status)}</span>${decision?.note ? `<p>${escapeHtml(decision.note)}</p>` : ""}</article>`).join("") ?? "";
  return `<section class="page-stage product-list-page" data-section="approvals" aria-labelledby="approvals-title">
    ${pageHeader("approvals-title", c(locale, "APPROVALS", "审批"), c(locale, "Human decisions bound to one immutable high-risk action and responsibility context.", "每项审批都精确绑定一次高风险操作，并完整记录责任信息。"))}
    <section class="admin-surface product-list-surface">${pending ? `<article class="approval-detail-card"><header><span class="status-pill status-pill--human">${c(locale, "DECISION REQUIRED", "待审批")}</span><h2>${escapeHtml(workTitle ?? c(locale, "High-risk work awaiting review", "待复核的高风险任务"))}</h2><p>${escapeHtml(principalName(organization, state.responsibility.executingAgentId))} → ${escapeHtml(principalName(organization, state.responsibility.accountableHumanId))}</p></header><dl><div><dt>${c(locale, "Work", "任务")}</dt><dd>${escapeHtml(state.responsibility.workId)}</dd></div><div><dt>${c(locale, "Approval", "审批记录")}</dt><dd>${escapeHtml(state.responsibility.approvalIds.at(-1) ?? "pending")}</dd></div><div><dt>${c(locale, "Evidence", "证据")}</dt><dd>${state.responsibility.evidenceIds.length}</dd></div><div><dt>${c(locale, "Policy", "审批规则")}</dt><dd>${c(locale, "Exact action binding", "仅对本次操作有效")}</dd></div></dl><div class="task-actions" data-task-actions></div></article>` : ""}${history || (!pending ? emptyState(c(locale, "No approval needs a decision", "暂无待审批事项"), c(locale, "Completed and rejected decisions remain discoverable in Activity and the responsibility record.", "已处理的审批仍可在动态和责任记录中查询。")) : "")}</section>
  </section>`;
}

export function evidencePage(
  state: CompanyWorkState,
  locale: CompanyOSLocale,
  ledger?: AccountabilityLedgerProjection | null,
): string {
  const entries = ledger?.evidence ?? state.responsibility.evidenceIds.map((id) => ({ id }));
  return `<section class="page-stage product-list-page" data-section="evidence" aria-labelledby="evidence-title">
    ${pageHeader("evidence-title", c(locale, "EVIDENCE", "证据"), c(locale, "Admitted evidence and verified results—not a generic file browser.", "这里仅展示通过校验的证据与结果，不收录普通附件。"), `${entries.length + (state.responsibility.resultId ? 1 : 0)}`)}
    <section class="admin-surface product-list-surface">${entries.length ? entries.map((entry, index) => `<article class="product-record-row product-record-row--static"><span class="record-monogram">${"kind" in entry && entry.kind === "RESULT" ? "R" : `E${index + 1}`}</span><span><small>${"kind" in entry ? escapeHtml(entry.kind) : c(locale, "ADMITTED EVIDENCE", "有效证据")}</small><strong>${escapeHtml(entry.id)}</strong><em>${"contentDigest" in entry ? `${escapeHtml(entry.contentDigest)} · ${escapeHtml(entry.source)} · ${escapeHtml(entry.recordedAt)}` : c(locale, "Bound to work, Agent, provenance and responsibility record", "已关联任务、Agent、来源和责任记录")}</em></span><span class="status-pill ${"kind" in entry && entry.kind === "RESULT" ? "status-pill--human" : "status-pill--demo"}">${state.mode === "DEMO_FIXTURE" ? c(locale, "FIXTURE", "演示") : c(locale, "FORMAL", "正式")}</span></article>`).join("") : emptyState(c(locale, "No admitted evidence yet", "暂无有效证据"), c(locale, "Ordinary attachments do not become evidence until provenance, digest, and responsibility checks pass.", "附件通过来源、摘要和责任校验后，才会进入证据记录。"))}${!ledger && state.responsibility.resultId ? `<article class="product-record-row product-record-row--static"><span class="record-monogram">R</span><span><small>${c(locale, "VERIFIED RESULT", "已核验结果")}</small><strong>${escapeHtml(state.responsibility.resultId)}</strong><em>${c(locale, "Traceable to goal, Agent, human decision and evidence", "可追溯到目标、Agent、审批人和证据")}</em></span><span class="status-pill status-pill--human">${c(locale, "RESULT", "结果")}</span></article>` : ""}</section>
  </section>`;
}

export function activityPage(
  state: CompanyWorkState,
  locale: CompanyOSLocale,
  formalActivity?: CompanyActivityPage | null,
): string {
  const entries = formalActivity?.items.map((item) => ({ ...item, isFixture: false })) ?? state.events;
  return `<section class="page-stage product-list-page" data-section="activity" aria-labelledby="activity-title">
    ${pageHeader("activity-title", c(locale, "ACTIVITY", "动态"), c(locale, "Chronological structured events with stable codes and original record text.", "结构化事件按时间排列；事件代码和原始记录保持不变。"), `${state.events.length}`)}
    <section class="admin-surface activity-timeline">${entries.length ? entries.map((event) => `<article><time>${escapeHtml(event.occurredAt)}</time><span class="activity-dot" aria-hidden="true"></span><div><small>${escapeHtml(event.type)}</small><strong>${escapeHtml(event.summary)}</strong><em>${event.isFixture ? c(locale, "Deterministic fixture", "确定性演示数据") : c(locale, "Formal event", "正式事件")}</em></div></article>`).join("") : emptyState(c(locale, "No activity yet", "尚无活动"), c(locale, "Activity appears after a goal is assigned or a company configuration changes.", "分配目标或公司配置发生变化后，活动会显示在这里。"))}</section>
  </section>`;
}

export function usagePage(
  administration: AdministrationProjection | null,
  locale: CompanyOSLocale,
): string {
  const usage = administration?.usageBudget;
  const ledger = usage?.ledger;
  const money = (cents: number) => new Intl.NumberFormat(locale === "zh-CN" ? "zh-CN" : "en-US", {
    style: "currency", currency: "USD",
  }).format(cents / 100);
  const budgetRows = usage?.policySummaries.map((policy) => `<article class="product-record-row product-record-row--static"><span class="record-monogram">B</span><span><small>${escapeHtml(enumLabel(locale, policy.scopeType))} · ${escapeHtml(enumLabel(locale, policy.windowKind))}</small><strong>${money(policy.observedAmount)} / ${money(policy.amount)}</strong><em>${Math.round(policy.utilizationPercent)}% · ${policy.hardStopEnabled ? c(locale, "hard stop enabled", "达到上限后停止执行") : c(locale, "warning only", "仅发送预警")}</em></span><span class="status-pill ${policy.status === "ok" ? "status-pill--demo" : "status-pill--unbound"}">${escapeHtml(enumLabel(locale, policy.status))}</span></article>`).join("") ?? "";
  const costRows = ledger?.costEvents.slice().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 20)
    .map((event) => `<article class="product-record-row product-record-row--static"><span class="record-monogram">$</span><span><small>${escapeHtml(event.provider)} · ${escapeHtml(event.billingType)}</small><strong>${escapeHtml(event.model)} · ${event.costStatus === "reported" ? money(event.costCents) : c(locale, "Unpriced", "未定价")}</strong><em>${event.inputTokens + event.cachedInputTokens + event.outputTokens} tokens · ${escapeHtml(event.occurredAt)}</em></span><span class="status-pill ${event.costStatus === "reported" ? "status-pill--demo" : "status-pill--unbound"}">${escapeHtml(enumLabel(locale, event.costStatus))}</span></article>`).join("") ?? "";
  const form = administration && ledger ? `<form class="admin-surface formal-work-form" data-budget-policy-form><div class="form-grid"><label class="family-field">${c(locale, "Policy ID", "策略 ID")}<input class="family-control" name="policyId" required pattern="[a-z0-9][a-z0-9-]{0,127}" placeholder="monthly-company-budget"></label><label class="family-field">${c(locale, "Scope", "范围")}<select class="family-control" name="scope"><option value="company|${escapeHtml(ledger.companyId)}">${c(locale, "Company", "公司")}</option></select></label><label class="family-field">${c(locale, "Window", "统计周期")}<select class="family-control" name="windowKind"><option value="calendar_month_utc">${c(locale, "Calendar month (UTC)", "自然月（UTC）")}</option><option value="lifetime">${c(locale, "Lifetime", "累计")}</option></select></label><label class="family-field">${c(locale, "Budget (USD)", "预算（美元）")}<input class="family-control" name="amount" type="number" min="0" step="0.01" required></label><label class="family-field">${c(locale, "Warn at", "预警阈值")}<input class="family-control" name="warnPercent" type="number" min="1" max="99" value="80" required></label><label class="family-field"><input name="hardStopEnabled" type="checkbox" checked> ${c(locale, "Hard stop at limit", "达到预算上限后停止执行")}</label></div><button class="family-button family-button--primary" type="submit">${c(locale, "Save budget policy", "保存预算策略")}</button></form>` : "";
  return `<section class="page-stage product-list-page" data-section="usage" aria-labelledby="usage-title">
    ${pageHeader("usage-title", c(locale, "USAGE & BUDGETS", "用量与预算"), c(locale, "Provider-neutral cost and policy visibility without invented billing data.", "统一查看各厂商的用量、成本和预算策略；所有金额均来自已核验记录。"))}
    ${form}<section class="admin-surface product-list-surface"><dl class="usage-boundary"><div><dt>${c(locale, "Verified spend", "已核验支出")}</dt><dd>${usage ? money(usage.totalReportedCostCents) : "—"}</dd></div><div><dt>${c(locale, "Unpriced events", "未定价记录")}</dt><dd>${usage?.unpricedEventCount ?? 0}</dd></div><div><dt>${c(locale, "Active policies", "有效策略")}</dt><dd>${usage?.policySummaries.filter(({ isActive }) => isActive).length ?? 0}</dd></div></dl>${budgetRows || emptyState(c(locale, "No budget policy", "尚无预算策略"), c(locale, "Save a company budget before enabling paid execution.", "启用付费执行前，请先设置公司预算。"))}</section>
    <section class="admin-surface product-list-surface">${costRows || emptyState(c(locale, "No verified usage yet", "尚无已核验用量"), c(locale, "No cost is estimated. Records appear only after a formal runtime reports a source reference and digest.", "系统不会估算成本；只有正式运行时提交来源引用和摘要后，记录才会显示。"))}</section>
  </section>`;
}
