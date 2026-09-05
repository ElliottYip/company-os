import type { CompanyWorkState } from "../application/company-operations.ts";
import type { AdministrationProjection } from "../application/get-administration-projection.ts";
import type { FormalAccessStatus } from "../application/get-formal-access-status.ts";
import type { FormalWorkCatalog, FormalWorkCatalogItem } from "../application/formal-agent-boss-api.ts";
import type { WorkRunTimelinePage } from "../application/get-work-run-timeline.ts";
import type { OrganizationDraft } from "../core/organization.ts";
import type { PlanningCatalog } from "../core/planning.ts";
import { ACTION_CATALOG, type ActionId } from "../core/responsibility.ts";
import type {
  SecretReferenceManagementResult,
  SecretReferenceManagementSession,
} from "../core/secret-governance.ts";
import type { IconNode } from "lucide";
import createLucideElement from "lucide/dist/esm/createElement.mjs";
import ArrowUpDown from "lucide/dist/esm/icons/arrow-up-down.mjs";
import Bot from "lucide/dist/esm/icons/bot.mjs";
import BriefcaseBusiness from "lucide/dist/esm/icons/briefcase-business.mjs";
import ChartNoAxesColumnIncreasing from "lucide/dist/esm/icons/chart-no-axes-column-increasing.mjs";
import CircleCheckBig from "lucide/dist/esm/icons/circle-check-big.mjs";
import Clock3 from "lucide/dist/esm/icons/clock-3.mjs";
import Columns3 from "lucide/dist/esm/icons/columns-3.mjs";
import FileCheck2 from "lucide/dist/esm/icons/file-check-corner.mjs";
import FolderKanban from "lucide/dist/esm/icons/folder-kanban.mjs";
import Funnel from "lucide/dist/esm/icons/funnel.mjs";
import Goal from "lucide/dist/esm/icons/goal.mjs";
import Inbox from "lucide/dist/esm/icons/inbox.mjs";
import LayoutDashboard from "lucide/dist/esm/icons/layout-dashboard.mjs";
import List from "lucide/dist/esm/icons/list.mjs";
import Network from "lucide/dist/esm/icons/network.mjs";
import Plus from "lucide/dist/esm/icons/plus.mjs";
import RotateCcw from "lucide/dist/esm/icons/rotate-ccw.mjs";
import Scale from "lucide/dist/esm/icons/scale.mjs";
import Search from "lucide/dist/esm/icons/search.mjs";
import Settings from "lucide/dist/esm/icons/settings.mjs";
import ShieldCheck from "lucide/dist/esm/icons/shield-check.mjs";
import UserRound from "lucide/dist/esm/icons/user-round.mjs";
import UsersRound from "lucide/dist/esm/icons/users-round.mjs";
import Workflow from "lucide/dist/esm/icons/workflow.mjs";
import X from "lucide/dist/esm/icons/x.mjs";
import {
  createDemoApplicationClient,
  type CompanyBackupInspection,
  type CompanyDirectoryProjection,
  type CompanyHumanMemberDirectory,
  type HumanInviteProjection,
  type CompanyOSApplicationClient,
} from "./application-client.ts";
import { companyWorkspacePath, resolveFormalCompanySelection } from "./company-selection.ts";
import { createButton } from "./components/button.ts";
import {
  raftMetricStrip,
  raftSectionHeader,
  raftStatus,
  type RaftStatusTone,
} from "./components/raft-ui.ts";
import { createFormalAssignment, formalWebFailure } from "./formal-work-state.ts";
import {
  getActiveLocale,
  readStoredLocale,
  setActiveLocale,
  t,
  type CompanyOSLocale,
} from "./i18n/index.ts";
import {
  addAgentColleague,
  addHumanColleague,
  createOrganizationSetupDraft,
  updateAgentProfile,
  updateHumanProfile,
  upsertDepartment,
} from "./product-onboarding/onboarding-model.ts";
import {
  activityPage,
  agentsPage,
  approvalsPage,
  evidencePage,
  goalsPage,
  humansPage,
  inboxPage,
  projectsPage,
  usagePage,
  type InboxFilter,
} from "./pages/operational-pages.ts";
import { agentPortfolioPage } from "./pages/agent-portfolio-pages.ts";
import {
  createPublicDemoClient,
  type PublicDemoPortfolioSnapshot,
} from "./public-demo-client.ts";

export type CompanyOSSection =
  | "office"
  | "inbox"
  | "work"
  | "goals"
  | "projects"
  | "organization"
  | "humans"
  | "agents"
  | "approvals"
  | "evidence"
  | "activity"
  | "responsibility"
  | "connectors"
  | "usage"
  | "settings";

export interface CompanyOSHostContract {
  readonly mountElement: HTMLElement;
  readonly basePath?: string;
  readonly initialSection?: CompanyOSSection;
  readonly requestedTenantSlug?: string;
  readonly publicDemoBaseUrl?: string;
  readonly onNavigate?: (path: string) => void;
}

export interface MountedCompanyOS {
  unmount(): void;
}

function sections(): readonly {
  readonly id: CompanyOSSection;
  readonly label: string;
  readonly group: "WORK" | "COMPANY" | "CONTROL" | "ADMIN";
}[] {
  return [
    { id: "office", label: t("nav.office"), group: "WORK" },
    { id: "inbox", label: t("nav.inbox"), group: "WORK" },
    { id: "work", label: t("nav.workApprovals"), group: "WORK" },
    { id: "goals", label: t("nav.goals"), group: "WORK" },
    { id: "projects", label: t("nav.projects"), group: "WORK" },
    { id: "organization", label: t("nav.organization"), group: "COMPANY" },
    { id: "humans", label: t("nav.humans"), group: "COMPANY" },
    { id: "agents", label: t("nav.agents"), group: "COMPANY" },
    { id: "approvals", label: t("nav.approvals"), group: "CONTROL" },
    { id: "evidence", label: t("nav.evidence"), group: "CONTROL" },
    { id: "activity", label: t("nav.activity"), group: "CONTROL" },
    { id: "responsibility", label: t("nav.responsibility"), group: "CONTROL" },
    { id: "connectors", label: t("nav.connectors"), group: "ADMIN" },
    { id: "usage", label: t("nav.usage"), group: "ADMIN" },
    { id: "settings", label: t("nav.settings"), group: "ADMIN" },
  ];
}

function iconSvg(icon: IconNode, className = ""): string {
  const element = createLucideElement(icon);
  element.setAttribute("aria-hidden", "true");
  element.setAttribute("focusable", "false");
  element.setAttribute("stroke-width", "1.75");
  if (className) element.setAttribute("class", className);
  return element.outerHTML;
}

function sectionIcon(section: CompanyOSSection): string {
  const icons: Readonly<Record<CompanyOSSection, IconNode>> = {
    office: LayoutDashboard,
    inbox: Inbox,
    work: BriefcaseBusiness,
    goals: Goal,
    projects: FolderKanban,
    organization: UsersRound,
    humans: UserRound,
    agents: Bot,
    approvals: CircleCheckBig,
    evidence: FileCheck2,
    activity: Clock3,
    responsibility: Scale,
    connectors: Workflow,
    usage: ChartNoAxesColumnIncreasing,
    settings: Settings,
  };
  return iconSvg(icons[section]);
}

function copy(english: string, chinese: string): string {
  return getActiveLocale() === "zh-CN" ? chinese : english;
}

function statusCopy(state: CompanyWorkState): string {
  const copy: Record<CompanyWorkState["phase"], string> = {
    READY: getActiveLocale() === "zh-CN" ? "可开始" : "Ready",
    PLANNING: getActiveLocale() === "zh-CN" ? "规划中" : "Planning",
    SIMULATING_TOOL_ACTIVITY: getActiveLocale() === "zh-CN" ? "运行中" : "Running",
    AWAITING_APPROVAL: getActiveLocale() === "zh-CN" ? "需要审批" : "Needs approval",
    COMPLETED: getActiveLocale() === "zh-CN" ? "已完成" : "Completed",
    REJECTED: getActiveLocale() === "zh-CN" ? "已拒绝" : "Rejected",
  };
  return copy[state.phase];
}

function statusTone(state: CompanyWorkState): RaftStatusTone {
  if (state.phase === "AWAITING_APPROVAL") return "approval";
  if (state.phase === "REJECTED") return "blocked";
  if (state.phase === "COMPLETED") return "complete";
  if (["PLANNING", "SIMULATING_TOOL_ACTIVITY"].includes(state.phase)) return "working";
  return "neutral";
}

function eventKind(type: string): string {
  const kinds: Readonly<Record<string, string>> = {
    "work.assigned": copy("Goal and responsibility bound", "目标与责任关系已确认"),
    "plan.recorded": copy("Plan recorded", "计划已记录"),
    "tool.activity.recorded": copy("Tool activity recorded", "工具活动已记录"),
    "approval.requested": copy("High-risk action paused", "高风险操作已暂停"),
    "approval.decided": copy("Human decision recorded", "审批决定已记录"),
    "evidence.recorded": copy("Evidence recorded", "证据已记录"),
    "work.completed": copy("Result recorded", "结果已记录"),
    "attempt.state_changed": copy("Run state changed", "运行状态已更新"),
    "connector.observation": copy("Connector update", "Connector 进度更新"),
  };
  return kinds[type] ?? type;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[
        character
      ] ?? character,
  );
}

function principalName(organization: OrganizationDraft, id: string): string {
  return (
    organization.humans.find((human) => human.id === id)?.name ??
    organization.agents.find((agent) => agent.id === id)?.name ??
    id
  );
}

function fixtureAgentSuffix(name: string, state: CompanyWorkState): string {
  return state.mode === "DEMO_FIXTURE" && !/[（(](?:演示|模拟)/.test(name)
    ? " (fixture)"
    : "";
}

function responsibilityChain(
  state: CompanyWorkState,
  organization: OrganizationDraft,
): string {
  const agentName = principalName(organization, state.responsibility.executingAgentId);
  return `<ol class="chain-list" data-testid="responsibility-chain">
    <li><span>${t("responsibility.initiator")}</span><strong>${escapeHtml(principalName(organization, state.responsibility.goalInitiatorId))}</strong></li>
    <li><span>${t("responsibility.executor")}</span><strong>${escapeHtml(agentName)}${fixtureAgentSuffix(agentName, state)}</strong></li>
    <li><span>${t("responsibility.permissionsData")}</span><strong>${state.responsibility.permissionIds.length} ${copy("permissions", "项权限")} · ${state.responsibility.dataAuthorizationIds.length} ${copy("data contract", "份数据授权合同")}</strong></li>
    <li><span>${t("responsibility.approval")}</span><strong>${state.responsibility.approvalIds.length ? `${escapeHtml(principalName(organization, state.responsibility.accountableHumanId))} · ${copy("exactly bound", "仅对本次操作有效")}` : copy("Not requested", "无需审批")}</strong></li>
    <li><span>${t("responsibility.evidenceResult")}</span><strong>${state.responsibility.evidenceIds.length} ${copy("evidence items", "项证据")} · ${state.responsibility.resultId ? copy("Result recorded", "结果已记录") : copy("Result pending", "等待提交结果")}</strong></li>
  </ol>`;
}

function eventFeed(state: CompanyWorkState, compact = false): string {
  const events = state.events.length
    ? state.events
        .map(
          (event) => `<article class="event-row family-list-row" data-event-code="${escapeHtml(event.type)}">
      <time>${event.occurredAt.slice(11, 19)}</time>
      <div><strong>${escapeHtml(eventKind(event.type))}</strong><p>${escapeHtml(event.summary)}</p></div>
      <span>${event.isFixture ? copy("FIXTURE", "演示") : copy("FORMAL", "正式")}</span>
    </article>`,
        )
        .join("")
    : `<p class="empty-copy">${t("events.empty")}</p>`;
  return `<section class="family-panel event-feed${compact ? " event-feed--compact" : ""}" aria-live="polite">
    ${raftSectionHeader({ title: t("events.title"), description: copy("Plans, approvals, and evidence in chronological order.", "计划、审批和证据按时间排列。") })}
    <div class="event-feed-body">${events}</div>
  </section>`;
}

function evidenceArtifacts(state: CompanyWorkState): string {
  const items = state.responsibility.evidenceIds.length
    ? state.responsibility.evidenceIds.map((id, index) => `<article class="evidence-artifact"><div><p class="family-kicker">${copy("ADMITTED EVIDENCE", "有效证据")} ${index + 1}</p><h3>${escapeHtml(id)}</h3><p>${copy("Bound to the work, executing Agent, and responsibility record. Raw credentials, private sessions, and chain-of-thought are never shown.", "已关联任务、执行 Agent 和责任记录。这里不会显示原始凭据、私有会话或私有推理。")}</p></div><span class="status-pill ${state.mode === "DEMO_FIXTURE" ? "status-pill--demo" : "status-pill--human"}">${state.mode === "DEMO_FIXTURE" ? copy("FIXTURE", "演示") : copy("FORMAL", "正式")}</span></article>`).join("")
    : `<div class="admin-empty"><strong>${copy("No admitted evidence yet", "暂无有效证据")}</strong><p>${copy("Plans, tool activity, and results appear only after provenance, digest, and responsibility bindings are recorded.", "来源、摘要和责任关系校验通过后，计划、工具活动和结果才会显示在这里。")}</p></div>`;
  const result = state.responsibility.resultId
    ? `<article class="evidence-artifact evidence-artifact--result"><div><p class="family-kicker">${copy("VERIFIED RESULT", "可验证结果")}</p><h3>${escapeHtml(state.responsibility.resultId)}</h3><p>${copy("The result remains traceable to its goal, Agent, human approval, and evidence chain.", "结果可追溯到目标、Agent、真人审批和证据链。")}</p></div><span class="status-pill status-pill--human">${copy("RESULT", "结果")}</span></article>`
    : "";
  return `<section class="evidence-library" aria-label="${copy("Deliverables and evidence", "交付物与证据")}"><header><h3>${copy("Deliverables and evidence", "交付物与证据")}</h3><p>${copy("Only admitted evidence and verified results appear here. An ordinary attachment is not evidence by default.", "这里仅展示通过校验的证据与结果；普通附件不会自动计入证据。")}</p></header><div>${items}${result}</div></section>`;
}

function responsibilityPanel(
  state: CompanyWorkState,
  organization: OrganizationDraft,
): string {
  return `<section class="family-panel responsibility-panel" aria-label="${t("responsibility.aria")}">
    ${raftSectionHeader({ title: t("responsibility.title"), description: copy("From goal ownership to a verified result", "目标、执行、审批与结果全程可追溯") })}
    ${responsibilityChain(state, organization)}
  </section>`;
}

function officeView(state: CompanyWorkState, organization: OrganizationDraft, activeWorkTitle?: string): string {
  const accountableHuman = principalName(organization, state.responsibility.accountableHumanId);
  const executingAgent = principalName(organization, state.responsibility.executingAgentId);
  const needsDecision = state.phase === "AWAITING_APPROVAL";
  const isActive = ["PLANNING", "SIMULATING_TOOL_ACTIVITY", "AWAITING_APPROVAL"].includes(state.phase);
  return `<section class="page-stage control-dashboard" aria-labelledby="office-title" data-section="office" data-phase="${state.phase}">
    <header class="control-page-title"><h1 id="office-title">${copy("DASHBOARD", "仪表盘")}</h1></header>
    ${needsDecision ? `<section class="control-alert" aria-label="${copy("Approval required", "需要审批")}"><span aria-hidden="true">${iconSvg(ShieldCheck)}</span><div><strong>${copy("1 high-risk action needs a human decision", "有 1 项高风险操作待审批")}</strong><p>${escapeHtml(executingAgent)} ${copy("is paused until", "已暂停，等待")} ${escapeHtml(accountableHuman)} ${copy("reviews the exact action and evidence binding.", "审核本次操作及其证据。")}</p></div><button type="button" data-section-target="approvals">${copy("Review approval", "查看审批")}</button></section>` : ""}
    <section class="control-section control-active-agents" aria-labelledby="active-agents-title">
      <header><div><h2 id="active-agents-title">${copy("Active Agents", "Agent 状态")}</h2><p>${copy("Execution status and accountable human ownership", "执行状态与真人负责人")}</p></div><button type="button" data-section-target="agents">${copy("View all Agents", "查看全部 Agent")}</button></header>
      <div class="control-agent-grid">
        ${organization.agents.map((agent) => `<button type="button" data-section-target="agents" class="control-agent-card"><span class="control-agent-avatar">AI</span><span><strong>${escapeHtml(agent.name)}</strong><small>${escapeHtml(agent.role)}</small><em>${copy("Owner", "真人负责人")}: ${escapeHtml(principalName(organization, agent.accountableHumanId))}</em></span><span class="control-agent-state ${isActive && agent.id === state.responsibility.executingAgentId ? "is-active" : ""}">${isActive && agent.id === state.responsibility.executingAgentId ? statusCopy(state) : copy("Idle", "待命")}</span></button>`).join("")}
      </div>
    </section>
    <dl class="control-metric-grid" aria-label="${copy("Company metrics", "公司指标")}">
      <button type="button" data-section-target="agents"><dt>${copy("Agents enabled", "已启用 Agent")}</dt><dd>${organization.agents.length}</dd><small>${isActive ? copy("1 running", "1 个运行中") : copy("0 running", "0 个运行中")} · ${organization.agents.length - (isActive ? 1 : 0)} ${copy("idle", "个空闲")}</small></button>
      <button type="button" data-section-target="work"><dt>${copy("Tasks in progress", "进行中任务")}</dt><dd>${isActive ? 1 : 0}</dd><small>${state.phase === "READY" ? copy("Ready for assignment", "可分配任务") : statusCopy(state)}</small></button>
      <button type="button" data-section-target="approvals"><dt>${copy("Pending approvals", "待审批")}</dt><dd>${needsDecision ? 1 : 0}</dd><small>${needsDecision ? copy("Action paused", "操作已暂停") : copy("Nothing waiting", "无需处理")}</small></button>
      <button type="button" data-section-target="evidence"><dt>${copy("Evidence admitted", "有效证据")}</dt><dd>${state.responsibility.evidenceIds.length}</dd><small>${state.responsibility.resultId ? copy("Result recorded", "结果已记录") : copy("Result pending", "等待结果")}</small></button>
    </dl>
    <div class="control-dashboard-grid">
      <section class="control-section control-recent-work">
        <header><div><h2>${copy("Recent tasks", "最近任务")}</h2><p>${copy("Work updated most recently", "按更新时间排序")}</p></div><button type="button" data-section-target="work">${copy("View all", "查看全部")}</button></header>
        <button class="control-task-row" type="button" data-section-target="work"><span class="control-task-status ${needsDecision ? "is-blocked" : ""}" aria-hidden="true"></span><span><small>${escapeHtml(state.responsibility.workId)}</small><strong>${escapeHtml(activeWorkTitle ?? t("work.goal"))}</strong><em>${escapeHtml(executingAgent)} · ${copy("accountable to", "真人负责人")} ${escapeHtml(accountableHuman)}</em></span>${raftStatus(statusCopy(state), statusTone(state))}</button>
        <div class="control-task-actions"><div class="task-actions" data-task-actions></div><button class="family-button family-button--secondary" type="button" data-open-new-task>${copy("New task", "新建任务")}</button></div>
      </section>
      ${eventFeed(state, true)}
    </div>
  </section>`;
}

function workView(
  state: CompanyWorkState,
  organization: OrganizationDraft,
  showDetail: boolean,
  catalog: FormalWorkCatalog | null = null,
  controls: {
    readonly view: "list" | "board";
    readonly filter: "all" | "active" | "resolved";
    readonly sort: "newest" | "oldest";
  } = { view: "list", filter: "all", sort: "newest" },
): string {
  const approval = state.phase === "AWAITING_APPROVAL";
  const accountableHuman = principalName(organization, state.responsibility.accountableHumanId);
  const executingAgent = principalName(organization, state.responsibility.executingAgentId);
  const catalogItem = catalog?.items.find(({ work }) => work.id === state.responsibility.workId);
  const workTitle = catalogItem?.work.title ?? t("work.goal");
  const workGoal = catalogItem?.work.goal ?? t("work.goal");
  if (!showDetail) {
    const terminal = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT", "COMPLETED"]);
    const visibleItems = catalog ? [...catalog.items].filter(({ work, attempts }) => {
      const status = attempts.reduce((latest, attempt) =>
        !latest || attempt.attemptNumber > latest.attemptNumber ? attempt : latest, undefined as FormalWorkCatalogItem["attempts"][number] | undefined
      )?.status ?? work.status;
      return controls.filter === "all" || (controls.filter === "resolved" ? terminal.has(status) : !terminal.has(status));
    }) : [];
    if (controls.sort === "newest") visibleItems.reverse();
    const filterLabel = controls.filter === "all" ? copy("All tasks", "全部任务")
      : controls.filter === "active" ? copy("Active tasks", "进行中任务") : copy("Resolved tasks", "已完成任务");
    const sortLabel = controls.sort === "newest" ? copy("Newest first", "最新优先") : copy("Oldest first", "最早优先");
    return `<section class="page-stage control-task-list" data-section="work" data-phase="${state.phase}" aria-labelledby="work-list-title">
      <header class="control-page-title"><h1 id="work-list-title">${copy("TASKS", "任务")}</h1></header>
      <div class="control-list-toolbar">
        <button class="control-new-button" type="button" data-open-new-task>${iconSvg(Plus)} ${copy("New Task", "新建任务")}</button>
        <label class="control-search"><span aria-hidden="true">${iconSvg(Search)}</span><input type="search" data-work-list-search aria-label="${copy("Search tasks", "搜索任务")}" placeholder="${copy("Search tasks…", "搜索任务…")}"></label>
        <div class="control-view-controls" role="group" aria-label="${copy("Task view", "任务视图")}"><button type="button" data-work-view="list" aria-pressed="${controls.view === "list"}" aria-label="${copy("List view", "列表视图")}">${iconSvg(List)}</button><button type="button" data-work-view="board" aria-pressed="${controls.view === "board"}" aria-label="${copy("Board view", "看板视图")}">${iconSvg(Columns3)}</button><button type="button" data-work-filter aria-pressed="${controls.filter !== "all"}" aria-label="${copy("Filter tasks", "筛选任务")}: ${filterLabel}" title="${filterLabel}">${iconSvg(Funnel)}</button><button type="button" data-work-sort aria-pressed="${controls.sort === "oldest"}" aria-label="${copy("Sort tasks", "排序任务")}: ${sortLabel}" title="${sortLabel}">${iconSvg(ArrowUpDown)}</button></div>
      </div>
      <div class="control-task-list-body${controls.view === "board" ? " control-task-list-body--board" : ""}" role="list" aria-label="${copy("Tasks", "任务")}">
        ${catalog ? visibleItems.map(({ work, attempts }) => {
          const assignee = principalName(organization, work.agentId);
          const status = attempts.at(-1)?.status ?? work.status;
          return `<button class="control-list-task" type="button" role="listitem" data-open-work-detail="${escapeHtml(work.id)}" data-work-search-value="${escapeHtml(`${work.id} ${work.title} ${assignee}`.toLocaleLowerCase("en-US"))}">
          <span class="control-task-status ${status === "AWAITING_APPROVAL" ? "is-blocked" : ""}" aria-hidden="true"></span>
          <span class="control-task-id">${escapeHtml(work.id)}</span>
          <strong>${escapeHtml(work.title)}</strong>
          <span class="control-list-assignee">${escapeHtml(assignee)}</span>
          <time>${escapeHtml(status)}</time>
        </button>`;
        }).join("") || `<div class="control-list-empty"><strong>${copy("No tasks yet", "尚无任务")}</strong><p>${copy("Create a task to start an accountable Work record.", "创建任务后，系统会生成可追责的工作记录。")}</p></div>` : `<button class="control-list-task" type="button" role="listitem" data-open-work-detail="${escapeHtml(state.responsibility.workId)}" data-work-search-value="${escapeHtml(`${state.responsibility.workId} ${t("work.goal")} ${executingAgent}`.toLocaleLowerCase("en-US"))}">
          <span class="control-task-status ${approval ? "is-blocked" : ""}" aria-hidden="true"></span>
          <span class="control-task-id">${escapeHtml(state.responsibility.workId)}</span>
          <strong>${t("work.goal")}</strong>
          <span class="control-list-assignee">${escapeHtml(executingAgent)}</span>
          <time>${state.events.length ? copy("Updated now", "刚刚更新") : copy("Not started", "尚未开始")}</time>
        </button>`}
        <div class="control-list-empty" data-work-list-empty hidden><strong>${copy("No matching tasks", "没有匹配任务")}</strong><p>${copy("Try a different search term or create a new task.", "尝试其他关键词，或创建新任务。")}</p></div>
      </div>
    </section>`;
  }
  const workBody = approval
    ? `<div class="family-banner family-banner--warning"><strong>${copy("Decision required", "待审批")}</strong><span>${copy("The publish action is paused and approval is scoped to this task.", "发布操作已暂停，本次审批只对当前任务有效。")}</span></div>
       <dl class="work-facts"><div><dt>${copy("Owner", "负责人")}</dt><dd>${escapeHtml(accountableHuman)}</dd></div><div><dt>${copy("Risk", "风险")}</dt><dd>${copy("High", "高")}</dd></div><div><dt>${copy("Evidence", "证据")}</dt><dd>${state.responsibility.evidenceIds.length}</dd></div></dl>
       <section class="approval-binding" aria-label="${copy("Exact approval binding", "当前操作的审批范围")}"><header><p class="family-kicker">${copy("EXACT APPROVAL BINDING", "审批范围")}</p><strong>${copy("Approve only this high-risk action", "仅审批当前高风险操作")}</strong></header><dl><div><dt>${copy("Approval", "审批")}</dt><dd>${escapeHtml(state.responsibility.approvalIds.at(-1) ?? copy("pending", "待处理"))}</dd></div><div><dt>${copy("Work", "任务")}</dt><dd>${escapeHtml(state.responsibility.workId)}</dd></div><div><dt>${copy("Action", "操作")}</dt><dd>${state.mode === "DEMO_FIXTURE" ? copy("publish-content (simulated)", "publish-content（模拟）") : copy("Server-side structured action binding", "服务端结构化操作记录")}</dd></div><div><dt>Agent</dt><dd>${escapeHtml(executingAgent)}</dd></div><div><dt>${copy("Approver", "审批人")}</dt><dd>${escapeHtml(accountableHuman)}</dd></div><div><dt>${copy("Evidence", "证据")}</dt><dd>${state.responsibility.evidenceIds.length} ${copy("items; the decision is appended to the responsibility record", "项；审批结果会写入责任记录")}</dd></div></dl></section>`
    : `<p class="work-summary">${copy("Status", "状态")}: ${statusCopy(state)}. ${state.mode === "DEMO_FIXTURE" ? copy("Events come from a deterministic fixture; no real model or tool is called.", "事件来自确定性演示数据；不会调用真实模型或工具。") : copy("Commands revalidate identity, tenant, contract and action permissions.", "命令会重新校验身份、租户、合同和动作权限。")}</p>`;
  return `<section class="page-stage control-task-detail" data-section="work" data-phase="${state.phase}" aria-labelledby="work-title">
    <header class="control-detail-breadcrumb"><button type="button" data-close-work-detail>${copy("Tasks", "任务")}</button><span aria-hidden="true">›</span><span class="control-task-status ${approval ? "is-blocked" : ""}"></span><span>${escapeHtml(state.responsibility.workId)}</span><strong>${escapeHtml(workTitle)}</strong></header>
    <article class="task-record-shell" data-testid="${approval ? "approval-focus" : "active-work"}">
      <header class="task-record-heading"><div><p class="family-kicker">${escapeHtml(state.responsibility.workId)} · ${copy("COMPANY OS WORK", "COMPANY OS 工作")}</p><h2 id="work-title">${escapeHtml(workTitle)}</h2><p>${escapeHtml(accountableHuman)} ${copy("is accountable;", "负责；")} ${escapeHtml(executingAgent)} ${copy("executes", "执行")}</p></div>${raftStatus(statusCopy(state), statusTone(state))}</header>
      <div class="task-record-tabs" role="tablist" aria-label="${copy("Task record views", "任务记录视图")}"><button type="button" role="tab" aria-selected="true" data-task-tab="detail">${copy("Details", "详情")}</button><button type="button" role="tab" aria-selected="false" data-task-tab="activity">${copy("Activity", "活动")} <span>${state.events.length}</span></button><button type="button" role="tab" aria-selected="false" data-task-tab="evidence">${copy("Deliverables and evidence", "交付物与证据")} <span>${state.responsibility.evidenceIds.length + (state.responsibility.resultId ? 1 : 0)}</span></button><button type="button" role="tab" aria-selected="false" data-task-tab="responsibility">${copy("Responsibility", "责任")}</button></div>
      <div class="task-record-panel" role="tabpanel" aria-label="${copy("Details", "详情")}" data-task-panel="detail">
        <div class="task-record-primary"><p class="family-kicker">${copy("CURRENT GOAL", "当前目标")}</p><h3>${escapeHtml(workGoal)}</h3>${workBody}<div class="task-actions" data-task-actions></div></div>
        <aside class="task-properties" aria-label="${copy("Task properties", "任务属性")}"><h3>${copy("Task properties", "任务属性")}</h3><dl><div><dt>${copy("Status", "状态")}</dt><dd>${statusCopy(state)}</dd></div><div><dt>${copy("Accountable human", "真人负责人")}</dt><dd>${escapeHtml(accountableHuman)}</dd></div><div><dt>${copy("Executing Agent", "执行 Agent")}</dt><dd>${escapeHtml(executingAgent)}${fixtureAgentSuffix(executingAgent, state)}</dd></div><div><dt>${copy("Permissions", "权限")}</dt><dd>${state.responsibility.permissionIds.length} ${copy("bound", "项已绑定")}</dd></div><div><dt>${copy("Data contracts", "数据授权合同")}</dt><dd>${state.responsibility.dataAuthorizationIds.length} ${copy("bound", "份已绑定")}</dd></div><div><dt>${copy("Approval", "审批")}</dt><dd>${state.responsibility.approvalIds.length ? copy("Exact action bound", "仅对当前操作有效") : copy("Not requested", "无需审批")}</dd></div><div><dt>${copy("Result", "结果")}</dt><dd>${state.responsibility.resultId ? copy("Recorded", "已记录") : copy("Awaiting a verifiable result", "等待可核验结果")}</dd></div></dl></aside>
      </div>
      <div class="task-record-panel" role="tabpanel" aria-label="${copy("Activity", "活动")}" data-task-panel="activity" hidden>${eventFeed(state)}</div>
      <div class="task-record-panel" role="tabpanel" aria-label="${copy("Deliverables and evidence", "交付物与证据")}" data-task-panel="evidence" hidden>${evidenceArtifacts(state)}</div>
      <div class="task-record-panel" role="tabpanel" aria-label="${copy("Responsibility", "责任")}" data-task-panel="responsibility" hidden>${responsibilityPanel(state, organization)}</div>
    </article>
  </section>`;
}

function workStateForCatalogItem(
  base: CompanyWorkState,
  item: FormalWorkCatalogItem,
  timeline: WorkRunTimelinePage | null = null,
): CompanyWorkState {
  const attempt = item.attempts.at(-1);
  const phase: CompanyWorkState["phase"] = attempt?.status === "AWAITING_APPROVAL" ? "AWAITING_APPROVAL"
    : attempt?.status === "SUCCEEDED" ? "COMPLETED"
      : ["FAILED", "CANCELLED", "TIMED_OUT"].includes(attempt?.status ?? "") ? "REJECTED"
        : ["LEASED", "RUNNING", "CANCELLATION_REQUESTED", "OUTCOME_UNKNOWN"].includes(attempt?.status ?? "") ? "SIMULATING_TOOL_ACTIVITY"
          : "PLANNING";
  return {
    mode: base.mode,
    phase,
    events: timeline?.items.map((event) => ({
      id: event.id,
      type: event.type,
      occurredAt: event.occurredAt,
      summary: event.summary,
      isFixture: false,
    })) ?? [],
    responsibility: {
      workId: item.work.id,
      goalInitiatorId: item.work.requestedBy,
      accountableHumanId: item.work.accountableHumanId,
      executingAgentId: item.work.agentId,
      permissionIds: [],
      dataAuthorizationIds: [],
      approvalIds: base.responsibility.workId === item.work.id ? base.responsibility.approvalIds : [],
      evidenceIds: attempt?.evidenceReferences ?? [],
      resultId: attempt?.resultId ?? null,
    },
  };
}

function organizationView(
  organization: OrganizationDraft,
  editable: boolean,
  isDemo: boolean,
  isFormal: boolean,
  latestInvite: HumanInviteProjection | null,
  administration: AdministrationProjection | null,
): string {
  const departmentOptions = organization.departments
    .map((department) => `<option value="${escapeHtml(department.id)}">${escapeHtml(department.name)}</option>`)
    .join("");
  const humanOptions = organization.humans
    .map((human) => `<option value="${escapeHtml(human.id)}">${escapeHtml(human.name)} · ${escapeHtml(human.title)}</option>`)
    .join("");
  const bindableConnectors = administration?.connectorCatalog.connectors.filter((connector) =>
    connector.status === "ENABLED" && administration.runtimeConnectors.some((runtime) =>
      runtime.connectorId === connector.id && runtime.registered && runtime.health !== "UNAVAILABLE")) ?? [];
  const departments = organization.departments.map((department) => {
    const humans = organization.humans.filter((human) => human.departmentId === department.id);
    const agents = organization.agents.filter((agent) => agent.departmentId === department.id);
    return `<article class="organization-department">
      <header><div><p class="family-kicker">${copy("DEPARTMENT", "部门")}</p><h2>${escapeHtml(department.name)}</h2></div><div><span>${humans.length} ${copy(humans.length === 1 ? "human" : "humans", "名成员")} · ${agents.length} ${agents.length === 1 ? "Agent" : "Agents"}</span>${editable ? `<button type="button" class="agent-lifecycle-action" data-edit-department="${escapeHtml(department.id)}">${copy("Edit", "编辑")}</button>` : ""}</div></header>
      <p>${escapeHtml(department.mandate || copy("No department mandate yet", "尚未记录部门职责"))}</p>
      <div class="organization-people">
        ${humans.map((human) => `<button class="colleague-row colleague-row--human" type="button" data-colleague-detail="human-${escapeHtml(human.id)}" aria-label="${copy("View", "查看")} ${escapeHtml(human.name)}"><span class="colleague-avatar">${escapeHtml(human.name.slice(0, 1))}</span><span><strong>${escapeHtml(human.name)}</strong><small>${escapeHtml(human.title)} · ${copy("Accountable human", "真人负责人")}</small></span></button>`).join("")}
        ${agents.map((agent) => `<button class="colleague-row colleague-row--agent" type="button" data-colleague-detail="agent-${escapeHtml(agent.id)}" aria-label="${copy("View", "查看")} ${escapeHtml(agent.name)}"><span class="colleague-avatar">AI</span><span><strong>${escapeHtml(agent.name)}</strong><small>${escapeHtml(agent.role)} · ${copy("Owner", "真人负责人")} ${escapeHtml(principalName(organization, agent.accountableHumanId))} · L${agent.autonomyLevel}</small></span></button>`).join("")}
      </div>
    </article>`;
  }).join("");
  const humans = organization.humans.map((human) => {
    const department = organization.departments.find((candidate) => candidate.id === human.departmentId);
    const ownedAgents = organization.agents.filter((agent) => agent.accountableHumanId === human.id);
    return `<button class="roster-row" type="button" data-colleague-detail="human-${escapeHtml(human.id)}" aria-label="${copy("View", "查看")} ${escapeHtml(human.name)}">
      <span class="colleague-avatar">${escapeHtml(human.name.slice(0, 1))}</span><span class="roster-identity"><strong>${escapeHtml(human.name)}</strong><small>${escapeHtml(human.title)}</small></span>
      <span class="roster-meta"><small>${copy("Department", "部门")}</small><strong>${escapeHtml(department?.name ?? copy("Unassigned", "未分配"))}</strong></span><span class="roster-meta"><small>${copy("Owned Agents", "负责的 Agent")}</small><strong>${ownedAgents.length}</strong></span><span class="status-pill status-pill--human">${copy("Human", "成员")}</span>
    </button>`;
  }).join("");
  const agents = organization.agents.map((agent) => {
    const department = organization.departments.find((candidate) => candidate.id === agent.departmentId);
    return `<button class="roster-row" type="button" data-colleague-detail="agent-${escapeHtml(agent.id)}" aria-label="${copy("View", "查看")} ${escapeHtml(agent.name)}">
      <span class="colleague-avatar colleague-avatar--agent">AI</span><span class="roster-identity"><strong>${escapeHtml(agent.name)}</strong><small>${escapeHtml(agent.role)}</small></span>
      <span class="roster-meta"><small>${copy("Accountable human", "真人负责人")}</small><strong>${escapeHtml(principalName(organization, agent.accountableHumanId))}</strong></span><span class="roster-meta"><small>${copy("Department · autonomy", "部门 · 自主等级")}</small><strong>${escapeHtml(department?.name ?? copy("Unassigned", "未分配"))} · L${agent.autonomyLevel}</strong></span><span class="status-pill ${isDemo ? "status-pill--demo" : "status-pill--unbound"}">${isDemo ? copy("Demo simulation", "演示数据") : copy("Unverified", "待验证")}</span>
    </button>`;
  }).join("");
  const humanDetails = organization.humans.map((human) => {
    const department = organization.departments.find((candidate) => candidate.id === human.departmentId);
    const ownedAgents = organization.agents.filter((agent) => agent.accountableHumanId === human.id);
    const editDepartmentOptions = organization.departments.map((candidate) =>
      `<option value="${escapeHtml(candidate.id)}"${candidate.id === human.departmentId ? " selected" : ""}>${escapeHtml(candidate.name)}</option>`).join("");
    return `<dialog class="colleague-detail-dialog" data-detail-dialog="human-${escapeHtml(human.id)}" aria-label="${escapeHtml(human.name)} ${copy("details", "详情")}"><header><span class="colleague-avatar">${escapeHtml(human.name.slice(0, 1))}</span><div><p class="family-kicker">${copy("ACCOUNTABLE HUMAN", "真人负责人")}</p><h2>${escapeHtml(human.name)}</h2><p>${escapeHtml(human.title)}</p></div><button type="button" data-detail-close aria-label="${copy("Close", "关闭")}">${iconSvg(X)}</button></header><dl><div><dt>${copy("Department", "部门")}</dt><dd>${escapeHtml(department?.name ?? copy("Unassigned", "未分配"))}</dd></div><div><dt>${copy("Organizational responsibility", "组织责任")}</dt><dd>${copy("Accountable for the goals, permissions, high-risk approvals, and results of assigned Agents", "对名下 Agent 的目标、权限、高风险审批和结果负责")}</dd></div><div><dt>${copy("Owned Agents", "负责的 Agent")}</dt><dd>${ownedAgents.length ? ownedAgents.map((agent) => escapeHtml(agent.name)).join(", ") : copy("None", "暂无")}</dd></div><div><dt>${copy("Identity status", "身份状态")}</dt><dd>${isDemo ? copy("Demo fixture; no real identity is created", "演示数据，不会创建真实身份") : copy("Bound through IdentityPort and audited independently", "通过 IdentityPort 接入，并保留独立审计记录")}</dd></div></dl>${editable ? `<form class="colleague-profile-form" data-human-profile-form><input type="hidden" name="humanId" value="${escapeHtml(human.id)}"><label class="company-field">${copy("Name", "姓名")}<input class="company-form-control" name="name" required maxlength="120" value="${escapeHtml(human.name)}"></label><label class="company-field">${copy("Role and responsibility", "岗位与职责")}<input class="company-form-control" name="title" required maxlength="120" value="${escapeHtml(human.title)}"></label><label class="company-field">${copy("Department", "部门")}<select class="company-form-control" name="departmentId">${editDepartmentOptions}</select></label><button class="family-button family-button--primary" type="submit">${copy("Save profile", "保存资料")}</button></form>` : ""}</dialog>`;
  }).join("");
  const agentDetails = organization.agents.map((agent) => {
    const department = organization.departments.find((candidate) => candidate.id === agent.departmentId);
    const binding = administration?.agentRuntimeBindings.bindings.find((candidate) => candidate.agentId === agent.id);
    const bindingStatus = binding?.status ?? (agent.runtimeConnectorId === "connector-unbound"
      ? "UNBOUND" : "BOUND_UNVERIFIED");
    const bindingRevision = binding?.revision ?? 0;
    const selectedConnectorId = binding?.connectorId ?? (agent.runtimeConnectorId === "connector-unbound"
      ? null : agent.runtimeConnectorId);
    const runtimeOptions = bindableConnectors.length
      ? bindableConnectors.map((connector) => `<option value="${escapeHtml(connector.id)}"${connector.id === selectedConnectorId ? " selected" : ""}>${escapeHtml(connector.displayName)} · ${escapeHtml(connector.id)}</option>`).join("")
      : `<option value="" disabled>${copy("No healthy registered runtime", "暂无健康且已注册的运行环境")}</option>`;
    const bindingForm = isFormal ? `<form class="colleague-profile-form agent-runtime-binding-form" data-agent-runtime-binding-form data-agent-id="${escapeHtml(agent.id)}"><h3>${copy("Runtime binding", "运行环境绑定")}</h3><p>${copy("Create the Agent first, then attach a discovered runtime. Every bind, rebind, and unbind is authorized and revision checked.", "先创建 Agent，再绑定已发现的运行环境。绑定、换绑和解绑都会经过授权与版本校验。")}</p><label class="company-field">${copy("Available runtime", "可用运行环境")}<select class="company-form-control" name="connectorId"${bindableConnectors.length ? "" : " disabled"}>${runtimeOptions}</select></label><label class="company-field">${copy("Reason", "变更原因")}<input class="company-form-control" name="reason" required maxlength="1000" placeholder="${copy("Why this runtime is appropriate", "说明为何选择此运行环境")}"></label><footer><button class="family-button family-button--primary" type="submit" name="operation" value="BIND"${bindableConnectors.length ? "" : " disabled"}>${selectedConnectorId ? copy("Review and rebind", "审核并换绑") : copy("Review and bind", "审核并绑定")}</button>${selectedConnectorId ? `<button class="family-button family-button--danger" type="submit" name="operation" value="UNBIND">${copy("Review and unbind", "审核并解绑")}</button>` : ""}</footer><input type="hidden" name="expectedRevision" value="${bindingRevision}"></form>` : "";
    const editDepartmentOptions = organization.departments.map((candidate) =>
      `<option value="${escapeHtml(candidate.id)}"${candidate.id === agent.departmentId ? " selected" : ""}>${escapeHtml(candidate.name)}</option>`).join("");
    return `<dialog class="colleague-detail-dialog" data-detail-dialog="agent-${escapeHtml(agent.id)}" aria-label="${escapeHtml(agent.name)} ${copy("details", "详情")}"><header><span class="colleague-avatar colleague-avatar--agent">AI</span><div><p class="family-kicker">${copy("AGENT COLLEAGUE", "AGENT 同事")}</p><h2>${escapeHtml(agent.name)}</h2><p>${escapeHtml(agent.role)}</p></div><button type="button" data-detail-close aria-label="${copy("Close", "关闭")}">${iconSvg(X)}</button></header><dl><div><dt>${copy("Accountable human", "真人负责人")}</dt><dd>${escapeHtml(principalName(organization, agent.accountableHumanId))}</dd></div><div><dt>${copy("Department", "部门")}</dt><dd>${escapeHtml(department?.name ?? copy("Unassigned", "未分配"))}</dd></div><div><dt>${copy("Autonomy level", "自主等级")}</dt><dd>L${agent.autonomyLevel} · ${copy("High-risk actions still require a matching human approval", "高风险操作仍须由对应的真人负责人审批")}</dd></div><div><dt>${copy("Runtime connection", "运行环境")}</dt><dd>${isDemo ? copy("Demo simulation; no model, shell, relay, or enterprise system connection", "演示环境未连接模型、Shell、Relay 或企业系统") : selectedConnectorId ? escapeHtml(selectedConnectorId) : copy("Not bound", "未绑定")}</dd></div><div><dt>${copy("Binding state", "绑定状态")}</dt><dd><span class="status-pill ${bindingStatus === "VERIFIED" ? "status-pill--demo" : "status-pill--unbound"}">${escapeHtml(bindingStatus)}</span> · ${copy("revision", "版本")} ${bindingRevision}</dd></div><div><dt>${copy("Data access", "数据权限")}</dt><dd>${isDemo ? copy("Unauthorized; deterministic fixtures only", "未授权，仅使用固定演示数据") : copy("Controlled by data authorization contracts and egress policy", "受数据授权合同和数据出口策略约束")}</dd></div></dl>${editable ? `<form class="colleague-profile-form" data-agent-profile-form><input type="hidden" name="agentId" value="${escapeHtml(agent.id)}"><label class="company-field">${copy("Agent name", "Agent 名称")}<input class="company-form-control" name="name" required maxlength="120" value="${escapeHtml(agent.name)}"></label><label class="company-field">${copy("Role", "岗位")}<input class="company-form-control" name="role" required maxlength="120" value="${escapeHtml(agent.role)}"></label><label class="company-field">${copy("Department", "部门")}<select class="company-form-control" name="departmentId">${editDepartmentOptions}</select></label><p class="profile-boundary-note">${copy("Responsibility, autonomy and runtime use their own reviewed commands.", "责任人、自主等级和运行环境需通过各自的审核命令修改。")}</p><button class="family-button family-button--primary" type="submit">${copy("Save profile", "保存资料")}</button></form>${bindingForm}` : ""}</dialog>`;
  }).join("");
  const disabled = editable ? "" : " disabled aria-disabled=\"true\"";
  return `<section class="page-stage control-organization" data-section="organization" aria-labelledby="organization-title">
    <header class="control-page-title control-page-title--actions"><div><h1 id="organization-title">${copy("ORGANIZATION", "组织架构")}</h1><p>${copy("Define accountable humans before placing Agents into roles and reporting lines.", "先确定真人负责人，再为 Agent 分配岗位和汇报关系。")}</p></div><div><button class="control-secondary-button" type="button" data-add-department${disabled}>${copy("Add department", "添加部门")}</button><button class="control-secondary-button" type="button" data-add-human${disabled}>${copy("Add human", "添加真人成员")}</button><button class="control-new-button" type="button" data-add-agent${disabled}>${iconSvg(Plus)} ${copy("Add Agent", "添加 Agent")}</button></div></header>
    <div class="organization-toolbar">
      <div><strong>${escapeHtml(organization.company.name)}</strong><span>${escapeHtml(organization.company.purpose || copy("AI Native Company", "AI 原生公司"))}</span></div>
      <div><span>${organization.departments.length} ${copy(organization.departments.length === 1 ? "department" : "departments", "个部门")}</span><span>${organization.humans.length} ${copy(organization.humans.length === 1 ? "human" : "humans", "名成员")}</span><span>${organization.agents.length} ${organization.agents.length === 1 ? "Agent" : "Agents"}</span></div>
    </div>
    ${isDemo ? `<div class="family-banner family-banner--info"><strong>${copy("Editable demo organization", "可编辑的演示组织")}</strong><span>${copy("Changes stay in this isolated browser fixture. No account, credential, or real Agent is created.", "修改只保存在当前浏览器，不会创建账号、凭据或真实 Agent。")}</span></div>` : isFormal ? `<div class="family-banner family-banner--warning"><strong>${copy("Formal organization records", "正式组织记录")}</strong><span>${copy("New humans and Agents remain non-executable records until identity, Connector, permission, data, and responsibility bindings are verified.", "新增真人与 Agent 在身份、Connector、权限、数据和责任校验完成前，都不可执行工作。")}</span></div>` : editable ? `<div class="family-banner family-banner--warning"><strong>${copy("Local draft workspace", "本地草稿")}</strong><span>${copy("People and Agents are configuration drafts until identity, Connector, permission, data, and responsibility bindings are verified.", "身份、Connector、权限、数据和责任校验完成前，成员与 Agent 都只是配置草稿。")}</span></div>` : `<div class="family-banner family-banner--warning"><strong>${copy("Read-only formal projection", "正式环境只读")}</strong><span>${copy("Writes remain disabled until the production organization command boundary is connected.", "接入正式组织写入接口后，才能在这里修改。")}</span></div>`}
    ${latestInvite ? `<div class="family-banner family-banner--info" role="status"><strong>${copy("Invite link created", "邀请链接已创建")}</strong><span><code>${escapeHtml(latestInvite.invitePath)}</code> · ${copy("Expires", "有效期至")} ${escapeHtml(latestInvite.expiresAt)}</span></div>` : ""}
    <div class="organization-tabs" role="tablist" aria-label="${copy("Organization views", "组织视图")}"><button type="button" role="tab" aria-selected="true" data-org-tab="structure">${copy("Structure", "组织架构")}</button><button type="button" role="tab" aria-selected="false" data-org-tab="humans">${copy("Humans", "成员")} <span>${organization.humans.length}</span></button><button type="button" role="tab" aria-selected="false" data-org-tab="agents">Agents <span>${organization.agents.length}</span></button></div>
    <div role="tabpanel" data-org-panel="structure"><div class="organization-grid">${departments}</div></div>
    <div role="tabpanel" data-org-panel="humans" hidden><div class="roster-list">${humans}</div></div>
    <div role="tabpanel" data-org-panel="agents" hidden><div class="roster-list">${agents}</div></div>
    ${humanDetails}${agentDetails}
    <dialog class="editor-dialog" data-department-dialog aria-labelledby="department-dialog-title">
      <form method="dialog" data-department-form><header><div><p class="family-kicker">${copy("ORGANIZATION BOUNDARY", "组织边界")}</p><h2 id="department-dialog-title">${copy("Department", "部门")}</h2></div><button type="button" data-editor-close aria-label="${copy("Close", "关闭")}">${iconSvg(X)}</button></header>
        <input type="hidden" name="departmentId">
        <p>${copy("Departments scope people, Agents, work and data responsibility. Renaming never changes opaque IDs.", "部门用于界定成员、Agent、工作与数据责任范围；修改名称不会改变稳定 ID。")}</p>
        <label class="company-field">${copy("Department name", "部门名称")}<input class="company-form-control" name="name" required maxlength="120"></label>
        <label class="company-field">${copy("Mandate", "部门职责")}<textarea class="company-form-control" name="mandate" maxlength="2000" rows="4"></textarea></label>
        ${isFormal && organization.departments.length > 1 ? `<div class="department-archive-controls" data-department-archive-controls hidden><label class="company-field">${copy("Move records to", "转移到部门")}<select class="company-form-control" name="destinationDepartmentId">${departmentOptions}</select></label><label class="company-field">${copy("Archive reason", "归档原因")}<input class="company-form-control" name="archiveReason" maxlength="1000"></label><button class="family-button family-button--danger" type="button" data-archive-department>${copy("Archive and reassign", "归档并转移")}</button></div>` : ""}
        <footer><button class="family-button family-button--secondary" type="button" data-editor-close>${copy("Cancel", "取消")}</button><button class="family-button family-button--primary" type="submit">${copy("Save department", "保存部门")}</button></footer>
      </form>
    </dialog>
    <dialog class="editor-dialog" data-human-dialog aria-labelledby="human-dialog-title">
      <form method="dialog" data-human-form><header><div><p class="family-kicker">${copy("HUMAN PRINCIPAL", "公司成员")}</p><h2 id="human-dialog-title">${copy("Add an accountable human", "添加负责人")}</h2></div><button type="button" data-editor-close aria-label="${copy("Close", "关闭")}">${iconSvg(X)}</button></header>
        <p>${copy("A human holds organizational responsibility. An Agent's high-risk actions return to a matching human decision.", "真人承担组织责任。Agent 发起高风险操作时，必须由对应负责人审批。")}</p>
        ${isFormal ? `<label class="company-field">${copy("Enterprise email", "企业邮箱")}<input class="company-form-control" name="email" type="email" required maxlength="254" autocomplete="email" placeholder="jordan@example.com"></label>` : `<label class="company-field">${copy("Name", "姓名")}<input class="company-form-control" name="name" required maxlength="120" autocomplete="name" placeholder="${copy("Example: Jordan Lee", "例如：陈晨")}"></label>`}
        <label class="company-field">${copy("Role and responsibility", "岗位与职责")}<input class="company-form-control" name="title" required maxlength="120" placeholder="${copy("Example: Customer Success Lead", "例如：客户成功负责人")}"></label>
        <label class="company-field">${copy("Department", "部门")}<select class="company-form-control" name="departmentId">${departmentOptions}</select></label>
        ${isFormal ? `<label class="company-field">${copy("Company role", "公司权限角色")}<select class="company-form-control" name="role"><option value="operator">${copy("Operator", "操作员")}</option><option value="viewer">${copy("Viewer", "只读成员")}</option><option value="admin">${copy("Admin", "管理员")}</option><option value="owner">${copy("Owner", "所有者")}</option></select></label>` : ""}
        <footer><button class="family-button family-button--secondary" type="button" data-editor-close>${copy("Cancel", "取消")}</button><button class="family-button family-button--primary" type="submit">${copy("Add human", "添加真人成员")}</button></footer>
      </form>
    </dialog>
    <dialog class="editor-dialog" data-agent-dialog aria-labelledby="agent-dialog-title">
      <form method="dialog" data-agent-form><header><div><p class="family-kicker">AGENT COLLEAGUE</p><h2 id="agent-dialog-title">${copy("Add an Agent colleague", "添加 Agent 同事")}</h2></div><button type="button" data-editor-close aria-label="${copy("Close", "关闭")}">${iconSvg(X)}</button></header>
        <p>${isDemo ? copy("This creates a simulated demo colleague. It never connects to a real model or execution system.", "这里创建的是模拟 Agent，不会连接真实模型或执行系统。") : copy("This creates a local draft. Runtime, model, permission, and data access remain disabled until separately verified.", "这里只创建本地草稿。运行环境、模型、权限和数据访问需要单独校验后才会启用。")}</p>
        <label class="company-field">${copy("Agent name", "Agent 名称")}<input class="company-form-control" name="name" required maxlength="120" placeholder="${copy("Example: Research Assistant", "例如：研究助理")}"></label>
        <label class="company-field">${copy("Role", "岗位")}<input class="company-form-control" name="role" required maxlength="120" placeholder="${copy("Example: Market Research Agent", "例如：市场研究 Agent")}"></label>
        <label class="company-field">${copy("Department", "部门")}<select class="company-form-control" name="departmentId">${departmentOptions}</select></label>
        <label class="company-field">${copy("Accountable human", "真人负责人")}<select class="company-form-control" name="accountableHumanId">${humanOptions}</select></label>
        ${isFormal ? `<p class="profile-boundary-note">${copy("Create the Agent first, then attach a discovered runtime from its detail page.", "先创建 Agent，再从详情页绑定已发现的运行环境。")}</p>` : ""}
        <label class="company-field">${copy("Autonomy level", "自主等级")}<select class="company-form-control" name="autonomyLevel"><option value="1">${copy("L1 · Recommend only", "L1 · 仅提供建议")}</option><option value="2" selected>${copy("L2 · Execute low-risk actions", "L2 · 可执行低风险操作")}</option><option value="3">${copy("L3 · Act within explicit boundaries", "L3 · 可在明确边界内自主执行")}</option></select></label>
        <footer><button class="family-button family-button--secondary" type="button" data-editor-close>${copy("Cancel", "取消")}</button><button class="family-button family-button--primary" type="submit">${copy("Add Agent", "添加 Agent")}</button></footer>
      </form>
    </dialog>
  </section>`;
}

function setupDialog(): string {
  return `<dialog class="setup-dialog" data-setup-dialog aria-labelledby="setup-title">
    <form data-setup-form data-setup-step="1">
      <button class="setup-close" type="button" data-setup-close aria-label="${copy("Close setup", "关闭设置")}">${iconSvg(X)}</button>
      <div class="setup-progress" aria-label="${copy("Setup progress", "设置进度")}">${[1, 2, 3, 4, 5].map((step) => `<span data-setup-progress="${step}"></span>`).join("")}</div>
      <section data-setup-step-panel="1"><p class="family-kicker">${copy("STEP 1 · COMPANY", "第 1 步 · 公司")}</p><h2 id="setup-title">${copy("What is your company called?", "你的公司叫什么？")}</h2><p>${copy("Create the company before configuring Agents or work.", "先创建公司，再配置 Agent 和工作。")}</p><label class="company-field">${copy("Company name", "公司名称")}<input class="company-form-control" name="companyName" required maxlength="120" placeholder="${copy("Example: Northstar Studio", "例如：北极星工作室")}"></label><label class="company-field">${copy("Company mission", "公司使命")}<textarea class="company-form-control" name="companyPurpose" required maxlength="1000" rows="4" placeholder="${copy("Who does this company serve, and what problem does it solve?", "这家公司服务谁，解决什么问题？")}"></textarea></label></section>
      <section data-setup-step-panel="2" hidden><p class="family-kicker">${copy("STEP 2 · DEPARTMENT", "第 2 步 · 部门")}</p><h2>${copy("Create the first department", "创建第一个部门")}</h2><p>${copy("A department is an organizational boundary for work, data scope, and accountability.", "部门用于划分工作职责、数据范围和责任边界。")}</p><label class="company-field">${copy("Department name", "部门名称")}<input class="company-form-control" name="departmentName" required maxlength="120" placeholder="${copy("Example: Customer Success", "例如：客户成功部")}"></label></section>
      <section data-setup-step-panel="3" hidden><p class="family-kicker">${copy("STEP 3 · ACCOUNTABLE HUMAN", "第 3 步 · 负责人")}</p><h2>${copy("Who is accountable for the outcome?", "谁对结果负责？")}</h2><p>${copy("Company OS establishes a human owner before an Agent can enter a role.", "为 Agent 分配岗位前，先确定一位真人负责人。")}</p><label class="company-field" for="setup-human-name">${copy("Human name", "负责人姓名")}</label><input class="company-form-control" id="setup-human-name" name="humanName" required maxlength="120" placeholder="${copy("Example: Alex Chen", "例如：陈晨")}"><label class="company-field" for="setup-human-title">${copy("Role and responsibility", "岗位与职责")}</label><input class="company-form-control" id="setup-human-title" name="humanTitle" required maxlength="120" placeholder="${copy("Example: Customer Success Lead", "例如：客户成功负责人")}"></section>
      <section data-setup-step-panel="4" hidden><p class="family-kicker">${copy("STEP 4 · FIRST AGENT", "第 4 步 · 第一个 Agent")}</p><h2>${copy("Add the first Agent colleague", "添加第一位 Agent 同事")}</h2><p>${copy("The Agent starts unconnected. Runtime, model, permission, data, and responsibility bindings are configured after setup.", "Agent 创建后不会自动连接外部系统。完成公司设置后，再配置运行环境、模型、权限、数据授权和责任关系。")}</p><label class="company-field">${copy("Agent name", "Agent 名称")}<input class="company-form-control" name="agentName" required maxlength="120" value="${copy("Research Assistant", "研究助理")}"></label><label class="company-field">${copy("Agent role", "Agent 岗位")}<input class="company-form-control" name="agentRole" required maxlength="120" value="${copy("Organize information and submit evidence-backed results", "整理信息并提交附有证据的结果")}"></label></section>
      <section data-setup-step-panel="5" hidden><p class="family-kicker">${copy("STEP 5 · REVIEW", "第 5 步 · 确认")}</p><h2>${copy("Review your company", "确认公司信息")}</h2><p>${copy("This creates a local workspace only. Formal identity, Connector, permission, data, and responsibility bindings remain required before production execution.", "这一步只创建本地工作区。进入正式环境前，还需要配置身份、Connector、权限、数据和责任关系。")}</p><dl class="setup-review"><div><dt>${copy("Company", "公司")}</dt><dd data-review="companyName">—</dd></div><div><dt>${copy("Department", "部门")}</dt><dd data-review="departmentName">—</dd></div><div><dt>${copy("Accountable human", "负责人")}</dt><dd data-review="humanName">—</dd></div><div><dt>${copy("First Agent", "第一个 Agent")}</dt><dd data-review="agentName">—</dd></div></dl></section>
      <footer><button class="family-button family-button--secondary" type="button" data-setup-back hidden>${copy("Back", "上一步")}</button><span></span><button class="family-button family-button--primary" type="button" data-setup-next>${copy("Continue", "继续")}</button><button class="family-button family-button--primary" type="submit" data-setup-submit hidden>${copy("Create company", "创建公司")}</button></footer>
    </form>
  </dialog>`;
}

function newTaskDialog(
  state: CompanyWorkState,
  options: Awaited<ReturnType<CompanyOSApplicationClient["assignmentOptions"]>>,
  isLocalDraft: boolean,
  allowsConcurrentWork: boolean,
  administration: AdministrationProjection | null,
): string {
  const optionsHtml = options.agents.map((agent) => `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name)}</option>`).join("");
  const canAssign = options.agents.length > 0 && (allowsConcurrentWork || state.phase === "READY");
  const dataContracts = administration?.governance.dataAuthorizationContracts
    .filter(({ status }) => status === "ACTIVE") ?? [];
  const dataContractOptions = dataContracts.map((contract) =>
    `<option value="${escapeHtml(contract.id)}">${escapeHtml(contract.dataSourceId)} · ${escapeHtml(contract.id)}</option>`).join("");
  const modelChoices = new Map<string, string>();
  for (const policy of administration?.governance.modelRoutingPolicies ?? []) {
    for (const route of policy.routes) {
      if (!route.enabled || !route.credentialConfigured) continue;
      for (const classification of route.allowedDataClassifications) {
        const value = [policy.companyId, policy.id, classification, route.residency].join("|");
        if (!modelChoices.has(value)) {
          modelChoices.set(value, `${route.modelReference} · ${classification} · ${route.residency}`);
        }
      }
    }
  }
  const modelRouteOptions = [...modelChoices].map(([value, label]) =>
    `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
  return `<dialog class="editor-dialog task-dialog" data-new-task-dialog aria-labelledby="new-task-title">
    <form method="dialog" data-new-task-form><header><div><p class="family-kicker">${copy("NEW TASK", "新建任务")}</p><h2 id="new-task-title">${copy("Assign a task", "分配任务")}</h2></div><button type="button" data-editor-close aria-label="${copy("Close", "关闭")}">${iconSvg(X)}</button></header>
      ${canAssign ? `<p>${isLocalDraft ? copy("Local simulation only — no model, tool, Connector, or enterprise system will be called.", "仅在本地模拟，不会调用模型、工具、Connector 或企业系统。") : copy("The goal, executing Agent, and accountable human are bound to the same work record.", "目标、执行 Agent 和真人负责人会记录在同一项任务中。")}</p>
      <label class="company-field">${copy("Task title", "任务标题")}<input class="company-form-control" name="title" required maxlength="120" placeholder="${copy("Example: Summarize this week's customer feedback", "例如：汇总本周客户反馈")}"></label>
      <label class="company-field">${copy("Desired outcome", "期望结果")}<textarea class="company-form-control" name="goal" required maxlength="1000" rows="4" placeholder="${copy("Describe completion criteria, required evidence, and boundaries", "描述完成标准、所需证据和边界")}"></textarea></label>
      <label class="company-field">${copy("Executing Agent", "执行 Agent")}<select class="company-form-control" name="agentId">${optionsHtml}</select></label>
      ${modelRouteOptions ? `<label class="company-field">${copy("Model route", "模型路由")}<select class="company-form-control" name="modelRouting"><option value="">${copy("Connector-managed / no Company OS model grant", "由 Connector 管理 / 不签发模型授权")}</option>${modelRouteOptions}</select><small>${copy("Company OS selects and freezes an eligible installed route when the task is assigned.", "分配任务时，Company OS 会选择并冻结符合条件的已安装路由。")}</small></label>` : ""}
      ${dataContractOptions ? `<details class="task-data-access"><summary>${copy("Enterprise data access (optional)", "企业数据访问（可选）")}</summary><p>${copy("Choose an existing authorization contract. Company OS validates the Agent, purpose, classification, operation, destination, and validity again on the server.", "选择已有数据授权合同。Company OS 会在服务端再次校验 Agent、用途、分级、操作、出口和有效期。")}</p>
        <label class="company-field">${copy("Authorization contract", "数据授权合同")}<select class="company-form-control" name="dataContractId"><option value="">${copy("No enterprise data", "不访问企业数据")}</option>${dataContractOptions}</select></label>
        <label class="company-field">${copy("Operation", "操作")}<select class="company-form-control" name="dataOperation"><option>READ</option><option>WRITE</option><option>EXPORT</option></select></label>
        <label class="company-field">${copy("Authorized purpose", "授权用途")}<input class="company-form-control" name="dataPurpose" maxlength="256" placeholder="customer-report"></label>
        <label class="company-field">${copy("Data classification", "数据分级")}<select class="company-form-control" name="dataClassification"><option>PUBLIC</option><option>INTERNAL</option><option>CONFIDENTIAL</option><option>RESTRICTED</option></select></label>
        <label class="company-field">${copy("Export destination (EXPORT only)", "出口目标（仅 EXPORT）")}<input class="company-form-control" name="dataDestinationId" maxlength="64"></label>
        <label class="company-field">${copy("Approved content digest (EXPORT only)", "已批准内容摘要（仅 EXPORT）")}<input class="company-form-control" name="dataContentDigest" maxlength="135" placeholder="sha256:…"></label>
      </details>` : ""}
      <footer><button class="family-button family-button--secondary" type="button" data-editor-close>${copy("Cancel", "取消")}</button><button class="family-button family-button--primary" type="submit">${isLocalDraft ? copy("Run simulation", "运行模拟") : copy("Assign task", "分配任务")}</button></footer>` : !options.agents.length ? `<div class="dialog-state"><strong>${copy("No executable Agent is ready", "暂无可执行的 Agent")}</strong><p>${copy("Activate an Agent only after its identity, Connector, permissions, data authorization, and responsibility contract are verified.", "请先完成 Agent 身份、Connector、权限、数据授权和责任合同校验，再启用任务执行。")}</p></div><footer><button class="family-button family-button--primary" type="button" data-editor-close>${copy("Got it", "知道了")}</button></footer>` : `<div class="dialog-state"><strong>${copy("A task is already in progress", "已有任务正在进行")}</strong><p>${copy("Complete, reject, or reset the current task before creating another one.", "请先完成、拒绝或重置当前任务，再创建新任务。")}</p></div><footer><button class="family-button family-button--primary" type="button" data-editor-close>${copy("Got it", "知道了")}</button></footer>`}
    </form>
  </dialog>`;
}

function responsibilityView(
  state: CompanyWorkState,
  organization: OrganizationDraft,
  activeWorkTitle?: string,
): string {
  const approvalPending = state.phase === "AWAITING_APPROVAL";
  const accountableHuman = principalName(organization, state.responsibility.accountableHumanId);
  const executingAgent = principalName(organization, state.responsibility.executingAgentId);
  return `<section class="page-stage control-accountability" data-section="responsibility" data-phase="${state.phase}" aria-labelledby="responsibility-title">
    <header class="control-page-title"><div><h1 id="responsibility-title">${copy("ACCOUNTABILITY", "责任链")}</h1><p>${copy("Every commitment connects a goal, owner, permissions, approval, evidence, and result.", "每项工作都完整记录目标、真人负责人、权限、审批、证据和结果。")}</p></div></header>
    ${raftMetricStrip([
      { label: copy("Work record", "任务记录"), value: 1, detail: escapeHtml(state.responsibility.workId) },
      { label: copy("Permissions", "权限"), value: state.responsibility.permissionIds.length, detail: copy("Bound by contract", "已按合同绑定") },
      { label: copy("Data access", "数据授权"), value: state.responsibility.dataAuthorizationIds.length, detail: copy("Purpose and scope bound", "已限定用途和范围") },
      { label: copy("Evidence", "证据"), value: state.responsibility.evidenceIds.length, detail: state.responsibility.resultId ? copy("Result recorded", "结果已记录") : copy("Result pending", "等待提交结果") },
    ], copy("Responsibility record summary", "责任记录摘要"))}
    <div class="accountability-tabs" role="tablist" aria-label="${copy("Accountability views", "责任链视图")}"><button type="button" role="tab" aria-selected="true" data-account-tab="chain">${copy("Responsibility chain", "责任链")}</button><button type="button" role="tab" aria-selected="false" data-account-tab="approvals">${copy("Approvals", "审批")} <span>${approvalPending ? 1 : 0}</span></button><button type="button" role="tab" aria-selected="false" data-account-tab="evidence">${copy("Evidence", "证据")} <span>${state.responsibility.evidenceIds.length}</span></button><button type="button" role="tab" aria-selected="false" data-account-tab="activity">${copy("Activity", "动态")} <span>${state.events.length}</span></button></div>
    <div role="tabpanel" aria-label="${copy("Responsibility chain", "责任链")}" data-account-panel="chain"><div class="responsibility-layout">
        ${responsibilityPanel(state, organization)}
        <section class="family-panel contract-panel">
          ${raftSectionHeader({ title: copy("Responsibility contract", "责任合同"), description: copy("Source identifiers remain available for audits.", "保留来源标识，便于审计追溯。") })}
          <dl class="contract-facts family-data-grid"><div><dt>${copy("Work ID", "任务 ID")}</dt><dd>${escapeHtml(state.responsibility.workId)}</dd></div><div><dt>${copy("Source", "来源")}</dt><dd>${state.mode === "DEMO_FIXTURE" ? copy("Deterministic fixture", "确定性演示数据") : copy("Formal projection", "正式数据")}</dd></div><div><dt>${copy("Accountable human", "真人负责人")}</dt><dd>${escapeHtml(accountableHuman)}</dd></div><div><dt>${copy("Executor", "执行 Agent")}</dt><dd>${escapeHtml(executingAgent)}</dd></div><div><dt>${copy("Data access", "数据授权")}</dt><dd>${state.responsibility.dataAuthorizationIds.length}</dd></div><div><dt>${copy("Result", "结果")}</dt><dd>${state.responsibility.resultId ? escapeHtml(state.responsibility.resultId) : copy("Pending", "待提交")}</dd></div></dl>
        </section>
    </div></div>
    <div role="tabpanel" aria-label="${copy("Approvals", "审批")}" data-account-panel="approvals" hidden><section class="admin-surface"><header class="accountability-panel-header"><h2>${copy("Human approvals", "真人审批")}</h2><p>${copy("Decisions are bound to one exact action, digest, work record, contract, Agent, human, evidence set, and result.", "审批决定会精确绑定操作、摘要、任务、合同、Agent、真人负责人、证据和结果。")}</p></header>${approvalPending ? `<article class="approval-list-row"><span class="control-task-status is-blocked"></span><div><p class="family-kicker">${copy("HIGH RISK · PAUSED", "高风险 · 已暂停")}</p><h3>${escapeHtml(activeWorkTitle ?? copy("High-risk work awaiting review", "待复核的高风险任务"))}</h3><p>${escapeHtml(executingAgent)} ${copy("is waiting for", "正在等待")} ${escapeHtml(accountableHuman)}。</p></div><div class="task-actions" data-task-actions></div></article>` : `<div class="admin-empty"><strong>${copy("No approval needs a decision", "暂无待审批事项")}</strong><p>${copy("A high-risk action appears here only after the runtime pauses with an exact, immutable approval binding.", "高风险操作暂停并生成不可变审批记录后，才会显示在这里。")}</p></div>`}</section></div>
    <div role="tabpanel" aria-label="${copy("Evidence", "证据")}" data-account-panel="evidence" hidden><section class="admin-surface">${evidenceArtifacts(state)}</section></div>
    <div role="tabpanel" aria-label="${copy("Activity", "动态")}" data-account-panel="activity" hidden>${eventFeed(state)}</div>
  </section>`;
}

function connectorsView(
  mode: CompanyOSApplicationClient["mode"],
  administration: AdministrationProjection | null,
  isDemo: boolean,
  organization: OrganizationDraft,
  secretManagement: {
    readonly session: SecretReferenceManagementSession;
    readonly result: SecretReferenceManagementResult | null;
  } | null,
): string {
  const connectorCount = mode === "DEMO_FIXTURE" ? 2 : (administration?.connectorCatalog.connectors.length ?? 0);
  const runtimeConnectors = administration?.runtimeConnectors ?? [];
  const federatedSources = administration?.runtimeFederatedSources ?? [];
  const registeredRows = administration?.connectorCatalog.connectors
    .map((connector) => `<article class="connector-row family-list-row"><span class="connector-orb ${connector.runtimeHealth === "HEALTHY" ? "connector-orb--green" : ""}"></span><div><h2>${escapeHtml(connector.displayName)}</h2><p>${connector.operations.join(" · ")} · ${escapeHtml(connector.executionResidency)}</p><small>${connector.secretConfigured ? copy("Secret reference configured", "已配置 Secret 引用") : copy("No secret reference", "未配置 Secret 引用")}</small></div><div>${raftStatus(connector.runtimeHealth === "NOT_BOUND" ? copy("Runtime not bound", "未绑定运行环境") : connector.runtimeHealth, connector.runtimeHealth === "HEALTHY" ? "working" : "neutral")}<button type="button" class="agent-lifecycle-action" data-connector-status="${connector.status === "ENABLED" ? "DISABLED" : "ENABLED"}" data-connector-id="${escapeHtml(connector.id)}">${connector.status === "ENABLED" ? copy("Disable", "停用") : copy("Enable", "启用")}</button></div></article>`)
    .join("") ?? "";
  const runtimeOnlyRows = runtimeConnectors.filter(({ registered }) => !registered)
    .map((connector) => `<article class="connector-row family-list-row"><span class="connector-orb ${connector.health === "HEALTHY" ? "connector-orb--green" : ""}"></span><div><h2>${escapeHtml(connector.displayName)}</h2><p>${escapeHtml(connector.connectorId)} · protocol ${escapeHtml(connector.protocolVersion)} · ${connector.maximumTimeoutSeconds}s maximum</p><small>Runtime package installed; register it in this company before Agent admission.</small></div>${raftStatus(connector.health === "HEALTHY" ? "Installed · unregistered" : connector.health, connector.health === "HEALTHY" ? "working" : "neutral")}</article>`)
    .join("");
  const runtimeRegistration = mode === "FORMAL" && administration && runtimeConnectors.some(({ registered }) => !registered)
    ? `<form class="admin-surface formal-work-form" data-register-connector-form><label class="family-field">Installed runtime<select class="family-control" name="connectorId">${runtimeConnectors.filter(({ registered }) => !registered).map((connector) => `<option value="${escapeHtml(connector.connectorId)}">${escapeHtml(connector.displayName)} · ${escapeHtml(connector.health)}</option>`).join("")}</select></label><label class="family-field">Execution residency<select class="family-control" name="executionResidency"><option value="CUSTOMER_ENVIRONMENT">Customer environment</option><option value="MANAGED_CLOUD">Managed cloud</option></select></label><button class="family-button family-button--primary" type="submit">Register runtime</button></form>`
    : "";
  const directConnectionState = mode === "DEMO_FIXTURE"
    ? isDemo
      ? `<div class="agent-connection-actions"><button class="family-button family-button--primary" type="button" data-leave-demo-connect-local>${copy("Open local connection setup", "打开本地接入设置")}</button></div>`
      : `<ol class="agent-connection-steps"><li><strong>${copy("Run the local preflight", "运行本地预检")}</strong><code>npm run agent:preflight</code></li><li><strong>${copy("Run a self-hosted formal control plane", "运行自托管正式控制平面")}</strong><span>${copy("The local draft cannot execute a real Agent.", "本地草稿不能执行真实 Agent。")}</span></li><li><strong>${copy("Return after the Agent Node is network-reachable", "Agent Node 网络可达后返回")}</strong><span>${copy("The runtime will appear here for company registration.", "运行环境会显示在这里，之后即可登记到公司。")}</span></li></ol>`
    : runtimeConnectors.length
      ? `<div class="family-banner family-banner--info"><strong>${copy("Runtime discovery active", "运行环境发现已生效")}</strong><span>${copy(`${runtimeConnectors.length} runtime(s) reported by the server. Review health and register the intended runtime below.`, `服务端已发现 ${runtimeConnectors.length} 个运行环境。请检查健康状态并登记需要使用的运行环境。`)}</span></div>`
      : `<ol class="agent-connection-steps"><li><strong>${copy("Install the neutral HTTP Connector", "安装统一 HTTP Connector")}</strong><code>COMPANY_OS_CONNECTOR_PACKAGES=@company-os/http-agent-node-connector</code></li><li><strong>${copy("Configure the Agent Node on the server", "在服务端配置 Agent Node")}</strong><span>${copy("Inject its HTTPS address and bearer token through deployment secrets, then restart Company OS.", "通过部署 Secret 注入 HTTPS 地址和 Bearer Token，然后重启 Company OS。")}</span></li><li><strong>${copy("Register the discovered runtime", "登记发现的运行环境")}</strong><span>${copy("This page will show health and the registration action. Credentials never enter the browser.", "本页会显示健康状态和登记操作；凭据不会进入浏览器。")}</span></li></ol>`;
  const directConnectionCenter = `<section class="admin-surface agent-connection-center" aria-labelledby="agent-connection-center-title"><div><p class="family-kicker">${copy("LOCAL AGENT DIRECT CONNECTION", "本地 AGENT 直连")}</p><h2 id="agent-connection-center-title">${copy("Connect an Agent runtime", "连接 Agent 运行环境")}</h2><p>${copy("Direct connection supports self-hosted or network-reachable Agent Nodes. A hosted Company OS deployment cannot reach localhost on your laptop; outbound laptop pairing is not available in this test release.", "直连接入支持自托管或网络可达的 Agent Node。托管版 Company OS 无法访问你电脑上的 localhost；本测试版尚未提供电脑主动出站配对。")}</p></div>${directConnectionState}</section>`;
  const federatedRows = federatedSources.map((source) => `<article class="connector-row family-list-row"><span class="connector-orb ${source.health === "HEALTHY" ? "connector-orb--green" : ""}"></span><div><p class="family-kicker">${copy("FEDERATED SOURCE", "联合运行来源")}</p><h2>${escapeHtml(source.connectorId)}</h2><p>${source.dataCapabilities.map(escapeHtml).join(" · ")} · ${source.controlCapabilities.map(escapeHtml).join(" · ")}</p><small>${source.lastSuccessfulAt ? `${copy("Last synchronized", "最近同步")} ${escapeHtml(source.lastSuccessfulAt)}` : copy("No successful synchronization recorded", "尚无成功同步记录")}</small></div>${raftStatus(source.health, source.health === "HEALTHY" ? "working" : "neutral")}</article>`).join("");
  const catalogRows = mode === "DEMO_FIXTURE"
    ? `<article class="connector-row family-list-row"><span class="connector-orb connector-orb--green"></span><div><h2>${copy("State machine fixture", "状态机演示")}</h2><p>${copy("Pause, resume, cancel, evidence and result capabilities", "演示暂停、恢复、取消、证据和结果能力")}</p></div>${raftStatus(copy("Isolated", "已隔离"), "working")}</article>
       <article class="connector-row family-list-row"><span class="connector-orb connector-orb--approval"></span><div><h2>${copy("Journal fixture", "事件记录演示")}</h2><p>${copy("Deterministic progress events with no credentials or external sessions", "仅生成确定性进度事件，不使用凭据或外部会话")}</p></div>${raftStatus(copy("Isolated", "已隔离"), "working")}</article>
       <article class="connector-row family-list-row"><span class="connector-orb"></span><div><h2>${copy("Production connector", "正式 Connector")}</h2><p>${copy("Raft Agent, Codex, DeepSeek and enterprise agents use the same contract", "Raft Agent、Codex、DeepSeek 和企业 Agent 使用同一套接入合约")}</p></div>${raftStatus(copy("Unbound", "未绑定"), "neutral")}</article>`
    : registeredRows + runtimeOnlyRows || `<article class="connector-row family-list-row"><span class="connector-orb"></span><div><h2>${copy("No Connector registered", "尚未注册 Connector")}</h2><p>${copy("Connect an enterprise execution plane through the equal Connector contract.", "请通过统一的 Connector 合约接入企业执行环境。")}</p></div>${raftStatus(copy("Empty catalog", "目录为空"), "neutral")}</article>`;
  const modelRows = mode === "FORMAL" && administration
    ? administration.governance.modelRoutingPolicies.flatMap((policy) => policy.routes.map((route) => `<article class="admin-row"><div><p class="family-kicker">${escapeHtml(policy.id)}</p><h3>${escapeHtml(route.modelReference)}</h3><p>${escapeHtml(route.providerAdapterId)} · ${route.residency} · ${route.allowedDataClassifications.join(" / ")}</p></div><div><span class="status-pill ${route.enabled ? "status-pill--demo" : "status-pill--unbound"}">${route.enabled ? copy("Enabled", "已启用") : copy("Disabled", "已停用")}</span><small>${route.credentialConfigured ? copy("Credential configured", "已配置凭据引用") : copy("Credential missing", "缺少凭据引用")}</small><button type="button" class="agent-lifecycle-action" data-model-route-id="${escapeHtml(route.id)}" data-model-route-enabled="${route.enabled ? "false" : "true"}">${route.enabled ? copy("Disable", "停用") : copy("Enable", "启用")}</button></div></article>`)).join("")
    : `<div class="admin-empty"><strong>${isDemo ? copy("Demo has no model routing", "演示环境未配置模型路由") : copy("No model route is connected", "尚未接入模型路由")}</strong><p>${copy("The local deterministic runtime never calls a model. Provider adapter, data classification, residency, and credential references are bound only in formal mode.", "本地确定性运行环境不会调用模型。供应商适配器、数据分级、执行位置和凭据引用仅在正式环境中绑定。")}</p></div>`;
  const runtimeModelProviders = administration?.runtimeModelProviders ?? [];
  const runtimeDataConnectors = administration?.runtimeDataConnectors ?? [];
  const modelRouteForm = mode === "FORMAL" && administration && runtimeModelProviders.length
    ? `<form class="admin-surface formal-work-form" data-model-route-form><div class="form-grid"><label class="family-field">Policy ID<input class="family-control" name="policyId" required pattern="[a-z0-9][a-z0-9-]{0,63}" value="default-models"></label><label class="family-field">Route ID<input class="family-control" name="routeId" required pattern="[a-z0-9][a-z0-9-]{0,63}" placeholder="local-model-primary"></label><label class="family-field">Installed model<select class="family-control" name="providerModel">${runtimeModelProviders.flatMap((provider) => provider.modelReferences.map((model) => `<option value="${escapeHtml(provider.providerAdapterId)}|${escapeHtml(model)}">${escapeHtml(provider.displayName)} · ${escapeHtml(model)} · ${escapeHtml(provider.health)}</option>`)).join("")}</select></label><label class="family-field">Credential reference ID<input class="family-control" name="credentialReference" required pattern="[a-z0-9][a-z0-9-]{0,63}" placeholder="model-provider-key"></label><label class="family-field">Data classification<select class="family-control" name="classification"><option>PUBLIC</option><option>INTERNAL</option><option>CONFIDENTIAL</option><option>RESTRICTED</option></select></label><label class="family-field">Residency<select class="family-control" name="residency"><option value="LOCAL">Local</option><option value="MANAGED_CLOUD">Managed cloud</option></select></label></div><button class="family-button family-button--primary" type="submit">Create disabled route</button></form>`
    : "";
  const dataRows = mode === "FORMAL" && administration
    ? administration.governance.dataAuthorizationContracts.map((contract) => `<article class="admin-row"><div><p class="family-kicker">${escapeHtml(contract.id)}</p><h3>${escapeHtml(contract.dataSourceId)}</h3><p>${contract.authorizedOperations.join(" / ")} · ${copy("maximum", "最高分级")} ${contract.maximumClassification} · ${contract.authorizedAgentIds.length} Agent</p></div><div><span class="status-pill ${contract.status === "ACTIVE" ? "status-pill--demo" : "status-pill--unbound"}">${contract.status}</span><small>${contract.allowedExportDestinations.length} ${copy("export destinations", "个允许的出口目标")}</small>${contract.status !== "REVOKED" ? `<div class="task-actions"><button type="button" class="agent-lifecycle-action" data-data-contract-id="${escapeHtml(contract.id)}" data-data-contract-status="${contract.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"}">${contract.status === "ACTIVE" ? copy("Pause", "暂停") : copy("Resume", "恢复")}</button><button type="button" class="agent-lifecycle-action" data-data-contract-id="${escapeHtml(contract.id)}" data-data-contract-status="REVOKED">${copy("Revoke", "撤销")}</button></div>` : ""}</div></article>`).join("")
    : `<article class="admin-row"><div><p class="family-kicker">${copy("DEMO FIXTURE", "演示数据")}</p><h3>${copy("Deterministic demo data", "确定性演示数据")}</h3><p>${copy("In-memory fixtures only; no files, enterprise systems, or production data are read.", "仅使用内存中的固定演示数据，不读取文件、企业系统或生产数据。")}</p></div><div><span class="status-pill status-pill--human">${copy("Egress denied", "禁止数据出口")}</span><small>${copy("Restored on reset", "重置后恢复初始状态")}</small></div></article>`;
  const dataAuthorizationForm = mode === "FORMAL" && administration && organization.agents.length
    ? `<form class="admin-surface formal-work-form" data-data-authorization-form><div class="form-grid"><label class="family-field">Contract ID<input class="family-control" name="id" required pattern="[a-z0-9][a-z0-9-]{0,63}" placeholder="finance-read"></label><label class="family-field">Data source ID<input class="family-control" name="dataSourceId" required pattern="[a-z0-9][a-z0-9-]{0,63}" placeholder="finance-warehouse"></label><label class="family-field">Authorized Agent<select class="family-control" name="agentId">${organization.agents.map((agent) => `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name)}</option>`).join("")}</select></label><label class="family-field">Purpose<input class="family-control" name="purpose" required maxlength="120" placeholder="monthly-close"></label><label class="family-field">Maximum classification<select class="family-control" name="maximumClassification"><option>PUBLIC</option><option>INTERNAL</option><option selected>CONFIDENTIAL</option><option>RESTRICTED</option></select></label><label class="family-field">Valid until<input class="family-control" type="datetime-local" name="validUntil" required></label><label class="family-field">Operations<select class="family-control" name="operation"><option>READ</option><option>WRITE</option><option>EXPORT</option></select></label><label class="family-field">Export destination IDs <span>(comma-separated)</span><input class="family-control" name="destinations" placeholder="approved-warehouse"></label></div><button class="family-button family-button--primary" type="submit">Create active grant</button></form>`
    : "";
  const configuredSecretReferences = administration
    ? administration.connectorCatalog.connectors.filter(({ secretConfigured }) => secretConfigured).length + administration.governance.modelRoutingPolicies.flatMap(({ routes }) => routes).filter(({ credentialConfigured }) => credentialConfigured).length
    : 0;
  const secretBroker = administration?.secretBrokerRuntime ?? null;
  const secretManagementForm = mode === "FORMAL" && secretBroker?.managementSupported
    ? `<form class="admin-surface formal-work-form" data-secret-management-form><div class="form-grid"><label class="family-field">${copy("Operation", "操作")}<select class="family-control" name="operation"><option value="CREATE">${copy("Create", "创建")}</option><option value="ROTATE">${copy("Rotate", "轮换")}</option><option value="SUSPEND">${copy("Suspend", "停用")}</option><option value="REVOKE">${copy("Revoke reference access", "撤销引用访问权")}</option></select></label><label class="family-field">${copy("Reference ID", "引用 ID")}<input class="family-control" name="referenceId" required pattern="[a-z0-9][a-z0-9-]{0,63}" placeholder="model-provider-key"></label><label class="family-field">${copy("Purpose", "用途")}<select class="family-control" name="purpose"><option>MODEL_PROVIDER</option><option>DATA_CONNECTOR</option><option>AGENT_CONNECTOR</option><option>IDENTITY_ADAPTER</option></select></label><label class="family-field">${copy("Provider adapter ID", "供应商适配器 ID")}<input class="family-control" name="providerAdapterId" required pattern="[a-z0-9][a-z0-9-]{0,63}" placeholder="model-provider"></label><label class="family-field">${copy("Current version (not used when creating)", "当前版本（创建时无需填写）")}<input class="family-control" type="number" name="expectedVersion" min="1" value="1"></label></div><button class="family-button family-button--primary" type="submit">${copy("Continue in secure Broker", "前往安全 Broker 继续")}</button><p class="form-help">${copy("Company OS sends policy metadata only. Enter the credential in the Broker page that opens next.", "Company OS 只发送策略元数据。请在随后打开的 Broker 页面中填写凭据。")}</p></form>`
    : mode === "FORMAL" ? `<div class="family-banner family-banner--warning"><strong>${copy("Reference management unavailable", "暂无法管理凭据引用")}</strong><span>${copy("Install a Broker adapter with browser-mediated management support. Existing execution leases remain fail-closed.", "请安装支持浏览器安全交接的 Broker 适配器；现有执行租约仍会保持默认拒绝。")}</span></div>` : "";
  const secretManagementStatus = secretManagement
    ? `<section class="admin-surface"><div class="admin-row"><div><p class="family-kicker">${escapeHtml(secretManagement.session.operation)}</p><h3>${escapeHtml(secretManagement.session.referenceId)}</h3><p>${secretManagement.result?.status === "COMPLETED" ? copy("Reference metadata confirmed by Broker.", "Broker 已确认引用元数据。") : secretManagement.result?.status === "FAILED" ? `${copy("Broker rejected the operation", "Broker 拒绝了本次操作")} · ${escapeHtml(secretManagement.result.code)}` : copy("Complete the operation in the Broker, then check status.", "请先在 Broker 中完成操作，再检查状态。")}</p></div><div class="task-actions"><a class="family-button family-button--secondary" href="${escapeHtml(secretManagement.session.managementUrl)}" target="_blank" rel="noopener noreferrer">${copy("Open secure Broker", "打开安全 Broker")}</a><button class="family-button family-button--primary" type="button" data-check-secret-session="${escapeHtml(secretManagement.session.id)}">${copy("Check status", "检查状态")}</button></div></div></section>`
    : "";
  const egressRows = mode === "FORMAL" && administration && administration.egressDecisions.length
    ? administration.egressDecisions.map((record) => `<article class="admin-row"><div><p class="family-kicker">${escapeHtml(record.id)}</p><h3>${escapeHtml(record.dataSourceId)} → ${escapeHtml(record.destinationId ?? copy("Internal use", "内部使用"))}</h3><p>${copy("Work", "任务")} ${escapeHtml(record.workId)} · Agent ${escapeHtml(record.agentId)} · ${escapeHtml(record.recordedAt)}</p></div><div><span class="status-pill ${record.decision.type === "GRANTED" ? "status-pill--demo" : "status-pill--unbound"}">${record.decision.type}</span><small>${record.contentDigest ? copy("Digest recorded", "已记录内容摘要") : copy("No egress digest", "无出口内容摘要")}</small></div></article>`).join("")
    : `<div class="admin-empty"><strong>${copy("No egress decision records", "暂无数据出口决策记录")}</strong><p>${mode === "DEMO_FIXTURE" ? copy("Demo never initiates data egress.", "演示环境不会发起数据出口请求。") : copy("Every granted and denied formal egress request leaves a structured record here.", "正式环境中的每次允许或拒绝都会在这里留下结构化记录。")}</p></div>`;
  const toolAccess = administration?.toolAccess ?? {
    companyId: organization.company.id, revision: 0, profiles: [], entries: [], bindings: [], policies: [],
  };
  const toolProfileRows = toolAccess.profiles.map((profile) => {
    const entries = toolAccess.entries.filter(({ profileId }) => profileId === profile.id);
    const bindings = toolAccess.bindings.filter(({ profileId }) => profileId === profile.id);
    const controls = profile.status === "archived" ? "" : `<div class="task-actions">
      ${profile.status !== "active" ? `<button type="button" class="agent-lifecycle-action" data-tool-profile-id="${escapeHtml(profile.id)}" data-tool-profile-status="active">Activate</button>` : ""}
      ${profile.status !== "disabled" ? `<button type="button" class="agent-lifecycle-action" data-tool-profile-id="${escapeHtml(profile.id)}" data-tool-profile-status="disabled">Disable</button>` : ""}
      <button type="button" class="agent-lifecycle-action" data-tool-profile-id="${escapeHtml(profile.id)}" data-tool-profile-status="archived">Archive</button></div>`;
    return `<article class="admin-row"><div><p class="family-kicker">${escapeHtml(profile.profileKey)}</p><h3>${escapeHtml(profile.name)}</h3><p>Default ${profile.defaultAction} · ${entries.length} entries · ${bindings.length} bindings</p><small>${entries.map(({ effect, selectorType, selectorValue }) => `${effect} ${selectorType}:${selectorValue}`).join(" · ") || "No selector entries"}</small></div><div><span class="status-pill ${profile.status === "active" ? "status-pill--demo" : "status-pill--unbound"}">${profile.status}</span>${controls}</div></article>`;
  }).join("");
  const toolPolicyRows = toolAccess.policies.map((policy) => `<article class="admin-row"><div><p class="family-kicker">PRIORITY ${policy.priority}</p><h3>${escapeHtml(policy.name)}</h3><p>${escapeHtml(policy.policyType)} · ${Object.entries(policy.selectors).map(([key, value]) => `${key}:${value}`).join(" · ") || "all tool requests"}</p></div><div><span class="status-pill ${policy.enabled ? "status-pill--demo" : "status-pill--unbound"}">${policy.enabled ? "enabled" : "disabled"}</span>${policy.policyType === "trust_rule" || policy.policyType === "rate_limit" ? "<small>Runtime semantics unsupported · fails closed</small>" : ""}</div></article>`).join("");
  const toolProfileForm = mode === "FORMAL" && administration
    ? `<form class="admin-surface formal-work-form" data-tool-profile-form><div class="form-grid"><label class="family-field">Profile ID<input class="family-control" name="profileId" required pattern="[a-z0-9][a-z0-9-]{0,127}" placeholder="research-tools"></label><label class="family-field">Profile key<input class="family-control" name="profileKey" required pattern="[a-z0-9][a-z0-9-]{0,127}" placeholder="research-tools"></label><label class="family-field">Name<input class="family-control" name="name" required maxlength="160" placeholder="Research tools"></label><label class="family-field">Default action<select class="family-control" name="defaultAction"><option value="deny">Deny</option><option value="allow">Allow</option></select></label><label class="family-field">Entry selector<select class="family-control" name="selectorType"><option value="application">Application</option><option value="connection">Connection</option><option value="catalog_entry">Catalog entry</option><option value="tool_name">Tool name</option><option value="risk_level">Risk level</option></select></label><label class="family-field">Selector value<input class="family-control" name="selectorValue" required pattern="[a-z0-9][a-z0-9-]{0,127}" placeholder="knowledge-search"></label><label class="family-field">Entry effect<select class="family-control" name="effect"><option value="include">Include</option><option value="exclude">Exclude</option></select></label><label class="family-field">Description<input class="family-control" name="description" maxlength="4000" placeholder="Optional operating intent"></label></div><button class="family-button family-button--primary" type="submit">Create active profile</button></form>` : "";
  const toolBindingForm = mode === "FORMAL" && administration && toolAccess.profiles.some(({ status }) => status !== "archived")
    ? `<form class="admin-surface formal-work-form" data-tool-binding-form><div class="form-grid"><label class="family-field">Profile<select class="family-control" name="profileId">${toolAccess.profiles.filter(({ status }) => status !== "archived").map(({ id, name }) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join("")}</select></label><label class="family-field">Binding ID<input class="family-control" name="bindingId" required pattern="[a-z0-9][a-z0-9-]{0,127}" placeholder="research-agent-binding"></label><label class="family-field">Target<select class="family-control" name="target">${`<option value="company|${escapeHtml(organization.company.id)}">Company · ${escapeHtml(organization.company.name)}</option>`}${organization.agents.map(({ id, name }) => `<option value="agent|${escapeHtml(id)}">Agent · ${escapeHtml(name)}</option>`).join("")}</select></label><label class="family-field">Priority<input class="family-control" type="number" name="priority" min="0" max="10000" value="100"></label></div><button class="family-button family-button--primary" type="submit">Bind profile</button></form>` : "";
  const toolPolicyForm = mode === "FORMAL" && administration
    ? `<form class="admin-surface formal-work-form" data-tool-policy-form><div class="form-grid"><label class="family-field">Policy ID<input class="family-control" name="policyId" required pattern="[a-z0-9][a-z0-9-]{0,127}" placeholder="approve-destructive"></label><label class="family-field">Name<input class="family-control" name="name" required maxlength="160" placeholder="Approve destructive tools"></label><label class="family-field">Policy type<select class="family-control" name="policyType"><option value="block">Block</option><option value="require_approval">Require approval</option><option value="allow">Allow</option></select></label><label class="family-field">Priority<input class="family-control" type="number" name="priority" min="0" max="10000" value="100"></label><label class="family-field">Selector<select class="family-control" name="selectorKey"><option value="riskLevel">Risk level</option><option value="toolName">Tool name</option><option value="applicationId">Application</option><option value="connectionId">Connection</option><option value="catalogEntryId">Catalog entry</option><option value="agentId">Agent</option><option value="projectId">Project</option></select></label><label class="family-field">Selector value<input class="family-control" name="selectorValue" required pattern="[a-z0-9][a-z0-9-]{0,127}" value="destructive"></label><label class="family-field">Description<input class="family-control" name="description" maxlength="4000" placeholder="Optional policy intent"></label></div><button class="family-button family-button--primary" type="submit">Create enabled policy</button></form>` : "";
  return `<section class="page-stage control-administration" data-section="connectors" aria-labelledby="connectors-title">
    <header class="control-page-title"><div><h1 id="connectors-title">${copy("GOVERNANCE", "接入与治理")}</h1><p>${copy("Manage Agent connections, models, data, secret boundaries, and execution permissions.", "管理 Agent 接入、模型、数据授权、Secret 边界和工具权限。")}</p></div><span class="status-pill">${mode === "DEMO_FIXTURE" ? isDemo ? copy("DEMO · NO NETWORK", "演示 · 未连接网络") : copy("LOCAL DRAFT · NOT CONNECTED", "本地草稿 · 未连接") : copy("FORMAL CONTROL PLANE", "正式控制平面")}</span></header>
    ${raftMetricStrip([
      { label: copy("Registered", "已注册"), value: connectorCount, detail: mode === "DEMO_FIXTURE" ? copy("Deterministic fixtures", "确定性演示") : copy("Production catalog", "正式目录") },
      { label: copy("Installed runtimes", "已安装运行环境"), value: mode === "DEMO_FIXTURE" ? 0 : runtimeConnectors.length + federatedSources.length, detail: copy("Execution and federated packages", "执行与联合运行组件") },
      { label: copy("Data contracts", "数据授权合同"), value: administration?.governance.dataAuthorizationContracts.length ?? 0, detail: copy("Purpose and scope bound", "已限定用途和范围") },
      { label: copy("Egress records", "数据出口记录"), value: administration?.egressDecisions.length ?? 0, detail: copy("Granted and denied audited", "允许与拒绝均有审计记录") },
    ], copy("Connector boundary summary", "Connector 边界摘要"))}
    <div class="administration-tabs" role="tablist" aria-label="${copy("Governance categories", "治理分类")}"><button type="button" role="tab" aria-selected="true" data-admin-tab="connectors">${copy("Agent Connectors", "Agent 接入")}</button><button type="button" role="tab" aria-selected="false" data-admin-tab="models">${copy("Models", "模型")}</button><button type="button" role="tab" aria-selected="false" data-admin-tab="data">${copy("Data authorization", "数据授权")}</button><button type="button" role="tab" aria-selected="false" data-admin-tab="secrets">${copy("Secrets", "Secret")}</button><button type="button" role="tab" aria-selected="false" data-admin-tab="tools">${copy("Tool access", "工具权限")}</button><button type="button" role="tab" aria-selected="false" data-admin-tab="audit">${copy("Egress audit", "数据出口审计")}</button></div>
    <div class="administration-panel" role="tabpanel" aria-label="Agent Connectors" data-admin-panel="connectors">${directConnectionCenter}${runtimeRegistration}<section class="connector-catalog family-list">${raftSectionHeader({ title: copy("Agent access", "Agent 接入"), description: copy("Capability declarations, health, and execution residency without credentials or private vendor sessions.", "查看能力声明、健康状态和执行位置；控制平面不接收凭据或厂商私有会话。") })}${catalogRows}</section>${mode === "FORMAL" ? `<section class="connector-catalog family-list">${raftSectionHeader({ title: copy("Federated sources", "联合运行来源"), description: copy("External platforms remain execution owners. Company OS shows only declared synchronization capabilities and retained health state.", "外部平台仍拥有执行权；Company OS 仅显示声明的同步能力和保留的健康状态。") })}${federatedRows || `<div class="admin-empty"><strong>${copy("No Federated Source installed", "尚未安装联合运行来源")}</strong><p>${copy("External workspaces are not synchronized until a formal source package is configured.", "配置正式来源组件前，不会同步外部 Workspace。")}</p></div>`}</section>` : ""}</div>
    <div class="administration-panel" role="tabpanel" aria-label="Models" data-admin-panel="models" hidden>${modelRouteForm}<section class="admin-surface">${raftSectionHeader({ title: copy("Model routing", "模型路由"), description: copy("Choose models by installed provider capability, active broker reference, data classification, and residency. New routes remain disabled until explicitly enabled.", "按供应商能力、有效凭据引用、数据分级和执行位置选择模型。新路由需手动启用。") })}<div class="admin-list">${modelRows || `<div class="admin-empty"><strong>${copy("No model route configured", "尚未配置模型路由")}</strong><p>${copy("Agents receive no model capability until a formal route is added.", "添加并启用正式路由前，Agent 无法调用模型。")}</p></div>`}</div></section></div>
    <div class="administration-panel" role="tabpanel" aria-label="Data authorization" data-admin-panel="data" hidden>${dataAuthorizationForm}<section class="admin-surface">${raftSectionHeader({ title: copy("Data Connector nodes", "数据连接节点"), description: copy("Customer-controlled nodes return references and digests only; enterprise records never enter the control plane.", "客户侧节点只返回引用和摘要，企业数据原文不会进入控制平面。") })}<div class="admin-list">${runtimeDataConnectors.map((connector) => `<article class="admin-row"><div><p class="family-kicker">${escapeHtml(connector.connectorId)}</p><h3>${escapeHtml(connector.displayName)}</h3><p>${connector.dataSourceIds.map(escapeHtml).join(" · ")} · ${connector.supportedOperations.join(" · ")}</p></div>${raftStatus(connector.health, connector.health === "HEALTHY" ? "working" : "neutral")}</article>`).join("") || `<div class="admin-empty"><strong>${copy("No Data Connector installed", "尚未安装数据连接节点")}</strong><p>${copy("Enterprise reads, writes, and exports remain unavailable.", "企业数据读取、写入和导出将保持不可用。")}</p></div>`}</div></section><section class="admin-surface">${raftSectionHeader({ title: copy("Data authorization contracts", "数据授权合同"), description: copy("Agent, operation, purpose, classification, expiry, and destination must all match. New grants start active; revoked grants cannot be reopened.", "Agent、操作、用途、数据分级、有效期和目标位置必须全部匹配。已撤销的授权不可恢复。") })}<div class="admin-list">${dataRows || `<div class="admin-empty"><strong>${copy("No data authorization contract", "尚未配置数据授权合同")}</strong><p>${copy("Enterprise data access is denied by default.", "企业数据默认禁止访问。")}</p></div>`}</div></section></div>
    <div class="administration-panel" role="tabpanel" aria-label="Secrets" data-admin-panel="secrets" hidden>${secretManagementForm}${secretManagementStatus}<section class="admin-surface">${raftSectionHeader({ title: copy("Secret boundary", "Secret 安全边界"), description: copy("The Web receives reference state, version, and audit metadata—never secret values.", "Web 端只接收引用状态、版本和审计元数据，不接收 Secret 原文。") })}<div class="secret-boundary-grid"><article><span>${copy("Installed broker", "已安装的 Secret Broker")}</span><strong>${secretBroker ? escapeHtml(secretBroker.displayName) : copy("Not installed", "未安装")}</strong><p>${secretBroker ? `${escapeHtml(secretBroker.health)} · ${copy("protocol", "协议")} ${escapeHtml(secretBroker.protocolVersion)} · ${copy("leases up to", "最长租期")} ${secretBroker.maximumLeaseSeconds}s` : copy("Formal Secret access remains fail-closed until one server package is installed.", "安装服务端 Secret Broker 前，正式环境会拒绝所有 Secret 访问。")}</p></article><article><span>${copy("Configured references", "已配置引用")}</span><strong>${configuredSecretReferences}</strong><p>${copy("Redacted status from Connector and model routes.", "仅显示 Connector 和模型路由中的脱敏状态。")}</p></article><article><span>${copy("Secret values in control plane", "控制平面中的 Secret 原文")}</span><strong>0</strong><p>${copy("A Secret Broker leases short-lived values at the execution edge.", "Secret Broker 仅在执行端提供短期租约。")}</p></article><article><span>${copy("Demo credentials", "演示凭据")}</span><strong>0</strong><p>${copy("Demo never generates or requests real credentials.", "演示环境不会生成或请求真实凭据。")}</p></article></div></section></div>
    <div class="administration-panel" role="tabpanel" aria-label="Tool access" data-admin-panel="tools" hidden>${toolProfileForm}${toolBindingForm}${toolPolicyForm}<section class="admin-surface">${raftSectionHeader({ title: copy("Tool profiles and bindings", "工具配置与绑定"), description: copy("Profiles select tool capabilities; bindings attach them to a company, Agent, or project. Default deny remains in force without an active match.", "工具配置用于选择能力，再绑定到公司、Agent 或项目；没有有效匹配时一律拒绝。") })}<div class="admin-list">${toolProfileRows || `<div class="admin-empty"><strong>${mode === "DEMO_FIXTURE" ? copy("Demo installs no tools", "演示环境未安装工具") : copy("No tool profile configured", "尚未配置工具")}</strong><p>${mode === "DEMO_FIXTURE" ? copy("There are no MCP, shell, file system, or enterprise application calls.", "演示环境不会调用 MCP、Shell、文件系统或企业应用。") : copy("Create a profile and bind it before any tool can be allowed.", "创建工具配置并完成绑定后，才能允许调用。")}</p></div>`}</div></section><section class="admin-surface">${raftSectionHeader({ title: copy("Tool policies", "工具策略"), description: copy("Priority-ordered block, approval, and allow policies are evaluated before profile defaults. Unsupported runtime semantics fail closed.", "系统按优先级评估阻止、审批和允许策略，再应用默认规则；运行环境不支持的策略会直接拒绝。") })}<div class="admin-list">${toolPolicyRows || `<div class="admin-empty"><strong>${copy("No tool policy configured", "尚未配置工具策略")}</strong><p>${copy("Profile matching still ends in explicit default deny unless an active profile allows the request.", "没有生效的允许规则时，工具请求会被拒绝。")}</p></div>`}</div></section></div>
    <div class="administration-panel" role="tabpanel" aria-label="Egress audit" data-admin-panel="audit" hidden><section class="admin-surface">${raftSectionHeader({ title: copy("Data egress audit", "数据出口审计"), description: copy("Every grant or denial binds work, Agent, data source, destination, and content digest.", "每次允许或拒绝都会绑定任务、Agent、数据源、目标位置和内容摘要。") })}<div class="admin-list">${egressRows}</div></section></div>
    <div class="family-banner family-banner--info boundary-note"><strong>${copy("Boundary", "安全边界")}</strong><span>${mode === "DEMO_FIXTURE" ? copy("Demo never accesses external systems; promotion copies only a sanitized organization template.", "演示环境不会访问外部系统；转入正式环境时，仅复制已清理的组织模板。") : copy("Production data access and egress are evaluated against the contract for every request.", "正式环境中的每次数据访问和出口请求都会重新校验授权合同。")}</span></div>
  </section>`;
}

function settingsView(
  mode: CompanyOSApplicationClient["mode"],
  locale: CompanyOSLocale,
  memberDirectory: CompanyHumanMemberDirectory,
  organization: OrganizationDraft,
  administration: AdministrationProjection | null,
): string {
  const formal = mode === "FORMAL";
  const memberRows = memberDirectory.members.map((member) => `<form class="settings-member-row" data-member-form data-member-id="${escapeHtml(member.userId)}"><div><strong>${escapeHtml(member.displayName)}</strong><small>${escapeHtml(member.email)}</small></div><input type="hidden" name="expectedRole" value="${escapeHtml(member.role)}"><input type="hidden" name="expectedStatus" value="${escapeHtml(member.status)}"><label>${locale === "zh-CN" ? "角色" : "Role"}<select class="family-control" name="role">${["owner", "admin", "operator", "viewer"].map((role) => `<option value="${role}"${role === member.role ? " selected" : ""}>${role}</option>`).join("")}</select></label><label>${locale === "zh-CN" ? "访问状态" : "Access"}<select class="family-control" name="status"><option value="active"${member.status === "active" ? " selected" : ""}>active</option><option value="suspended"${member.status === "suspended" ? " selected" : ""}>suspended</option></select></label><button class="family-button family-button--secondary" type="submit">${locale === "zh-CN" ? "保存访问设置" : "Save access"}</button></form>`).join("");
  return `<section class="page-stage control-settings" data-section="settings" aria-labelledby="settings-title">
    <header class="control-page-title"><div><h1 id="settings-title">${locale === "zh-CN" ? "设置" : "SETTINGS"}</h1><p>${locale === "zh-CN" ? "管理语言、登录与权限、部署、安全和数据。" : "Manage product language, identity boundaries, deployment, security, audit, and profile."}</p></div><span class="status-pill">${formal ? (locale === "zh-CN" ? "正式环境" : "FORMAL CONTROL PLANE") : (locale === "zh-CN" ? "本地工作区" : "LOCAL WORKSPACE")}</span></header>
    <div class="settings-layout">
      <nav class="settings-navigation" aria-label="${locale === "zh-CN" ? "设置分类" : "Settings categories"}" role="tablist" aria-orientation="vertical">
        <button type="button" role="tab" aria-selected="true" data-settings-tab="general">${locale === "zh-CN" ? "常规" : "General"}</button>
        <button type="button" role="tab" aria-selected="false" data-settings-tab="language">${locale === "zh-CN" ? "语言" : "Language"}</button>
        <button type="button" role="tab" aria-selected="false" data-settings-tab="identity">${locale === "zh-CN" ? "身份与访问" : "Identity & access"}</button>
        <button type="button" role="tab" aria-selected="false" data-settings-tab="deployment">${locale === "zh-CN" ? "部署" : "Deployment"}</button>
        <button type="button" role="tab" aria-selected="false" data-settings-tab="security">${locale === "zh-CN" ? "安全与审批" : "Security & approvals"}</button>
        <button type="button" role="tab" aria-selected="false" data-settings-tab="audit">${locale === "zh-CN" ? "审计与数据保留" : "Audit & retention"}</button>
        <button type="button" role="tab" aria-selected="false" data-settings-tab="portability">${locale === "zh-CN" ? "数据迁移" : "Data portability"}</button>
        <button type="button" role="tab" aria-selected="false" data-settings-tab="profile">${locale === "zh-CN" ? "个人资料" : "Profile"}</button>
      </nav>
      <div class="settings-content">
        <section role="tabpanel" data-settings-panel="general" class="admin-surface">${raftSectionHeader({ title: locale === "zh-CN" ? "公司设置" : "Company settings", description: locale === "zh-CN" ? "Company OS 独立管理这些设置，不受任何 Agent 厂商限制。" : "Product settings belong to Company OS and remain independent from any Agent vendor." })}<form class="formal-work-form" data-company-profile-form><label class="family-field">${locale === "zh-CN" ? "公司名称" : "Company name"}<input class="family-control" name="name" required maxlength="120" value="${escapeHtml(organization.company.name)}"></label><label class="family-field">${locale === "zh-CN" ? "公司语言" : "Company locale"}<input class="family-control" name="locale" required pattern="[a-z]{2,3}(-[A-Z]{2})?" maxlength="8" value="${escapeHtml(organization.company.locale)}"></label><label class="family-field">${locale === "zh-CN" ? "公司使命" : "Company purpose"}<textarea class="family-control" name="purpose" maxlength="2000" rows="3">${escapeHtml(organization.company.purpose)}</textarea></label><button class="family-button family-button--primary" type="submit">${locale === "zh-CN" ? "保存公司设置" : "Save company settings"}</button></form><dl class="settings-list"><div><dt>${locale === "zh-CN" ? "工作区模式" : "Workspace mode"}</dt><dd>${formal ? (locale === "zh-CN" ? "正式数据来自 Company OS 服务" : "Formal data projected by the service") : (locale === "zh-CN" ? "使用隔离演示数据，未连接外部系统" : "Local fixture data with no external connections")}</dd><span class="status-pill">${formal ? (locale === "zh-CN" ? "已连接" : "Connected") : (locale === "zh-CN" ? "已隔离" : "Isolated")}</span></div><div><dt>${locale === "zh-CN" ? "任务执行条件" : "Default execution policy"}</dt><dd>${locale === "zh-CN" ? "真人负责人、Agent 能力、权限、数据授权和运行环境全部校验通过后，系统才会执行任务。" : "Execution is denied unless responsibility, capability, permission, data, and runtime bindings all pass."}</dd><span class="status-pill status-pill--human">${locale === "zh-CN" ? "校验未通过即拒绝" : "Fail closed"}</span></div></dl></section>
        <section role="tabpanel" data-settings-panel="language" class="admin-surface" hidden>${raftSectionHeader({ title: locale === "zh-CN" ? "语言" : "Language", description: locale === "zh-CN" ? "界面语言可以切换；用户输入、Agent 输出、证据和日志始终保留原文。" : "Only product chrome is translated. User input, Agent output, evidence, and logs preserve their original text." })}<div class="locale-options" role="radiogroup" aria-label="${locale === "zh-CN" ? "界面语言" : "Product language"}"><button type="button" role="radio" aria-checked="${locale === "en"}" data-locale="en"><span><strong>English</strong><small>English product interface</small></span><span aria-hidden="true">${locale === "en" ? "●" : "○"}</span></button><button type="button" role="radio" aria-checked="${locale === "zh-CN"}" data-locale="zh-CN"><span><strong>简体中文</strong><small>使用简体中文界面</small></span><span aria-hidden="true">${locale === "zh-CN" ? "●" : "○"}</span></button></div></section>
        <section role="tabpanel" data-settings-panel="identity" class="admin-surface" hidden>${raftSectionHeader({ title: locale === "zh-CN" ? "身份与访问" : "Identity & access", description: locale === "zh-CN" ? "同一账号不会自动获得所有产品的权限。每个产品都会单独校验 token audience 与角色，并保留独立审计记录。" : "One account does not mean shared permissions. Product token audiences, roles, and audits stay separate." })}<div class="settings-state"><strong>${formal ? (locale === "zh-CN" ? "已接入身份服务" : "Identity adapter bound") : (locale === "zh-CN" ? "尚未接入身份服务" : "No identity provider configured")}</strong><p>${locale === "zh-CN" ? "正式环境可通过 IdentityPort 接入 Raft Identity、企业 OIDC、SAML 或 LDAP。" : "Formal mode can bind Raft Identity, enterprise OIDC, SAML, or LDAP adapters through IdentityPort."}</p>${formal ? "" : `<button type="button" data-open-formal-access>${locale === "zh-CN" ? "查看配置要求" : "Review configuration requirements"}</button>`}</div>${formal ? `<h3>${locale === "zh-CN" ? "公司成员" : "Company members"}</h3><dl class="settings-list">${memberRows || `<div><dt>${locale === "zh-CN" ? "暂无成员" : "No members"}</dt><dd>${locale === "zh-CN" ? "成员接受企业邀请后会显示在这里。" : "Members appear after accepting an enterprise invite."}</dd></div>`}</dl>` : ""}</section>
        <section role="tabpanel" data-settings-panel="deployment" class="admin-surface" hidden>${raftSectionHeader({ title: locale === "zh-CN" ? "部署" : "Deployment", description: locale === "zh-CN" ? "托管云（managed-cloud）和私有化部署（self-hosted）使用同一套代码，通过部署 Profile 区分运行配置。" : "Managed cloud and self-hosted are deployment profiles of one codebase." })}<dl class="settings-list"><div><dt>${locale === "zh-CN" ? "当前部署方式" : "Current profile"}</dt><dd>${formal ? (locale === "zh-CN" ? "由服务端配置" : "Selected by service configuration") : (locale === "zh-CN" ? "本地开发" : "Local development")}</dd><span class="status-pill">${formal ? (locale === "zh-CN" ? "运行中" : "Active") : (locale === "zh-CN" ? "未部署" : "Not deployed")}</span></div><div><dt>${locale === "zh-CN" ? "数据边界" : "Data boundary"}</dt><dd>${locale === "zh-CN" ? "Company OS 的数据库 Schema、配置和数据生命周期独立于 Raft 及所有 Connector。" : "Database schema, configuration, and lifecycle remain independent from Raft and every Connector."}</dd><span class="status-pill status-pill--human">${locale === "zh-CN" ? "边界独立" : "Independent"}</span></div></dl></section>
        <section role="tabpanel" data-settings-panel="security" class="admin-surface" hidden>${raftSectionHeader({ title: locale === "zh-CN" ? "安全与审批" : "Security & approvals", description: locale === "zh-CN" ? "高风险操作会自动暂停，并交由对应的真人负责人审批。" : "High-risk actions pause and require a decision from the matching accountable human." })}<div class="settings-state"><strong>${locale === "zh-CN" ? "审批仅对当前操作有效" : "Exact-action binding enabled"}</strong><p>${locale === "zh-CN" ? "审批会绑定 action、digest、work、contract、Agent、真人负责人、证据和结果；任一信息发生变化，都必须重新审批。" : "Approvals bind action, digest, work, contract, Agent, human, evidence, and result; any change invalidates the prior approval."}</p></div></section>
        <section role="tabpanel" data-settings-panel="audit" class="admin-surface" hidden>${raftSectionHeader({ title: locale === "zh-CN" ? "审计与数据保留" : "Audit & retention", description: locale === "zh-CN" ? "审计记录保留稳定代码、结构化参数、来源和责任关系。" : "Audit records preserve stable codes, structured parameters, provenance, and responsibility links." })}<div class="settings-state"><strong>${locale === "zh-CN" ? "数据保留策略由服务端统一管理" : "Retention is managed server-side"}</strong><p>${locale === "zh-CN" ? "为满足合规、诉讼保全和企业政策要求，Web 端不提供本地删除入口。" : "The Web does not expose a local delete control that could bypass regulation, legal hold, or enterprise policy."}</p><code>${escapeHtml(administration?.retentionPolicyId ?? "not-configured")}</code><small>${locale === "zh-CN" ? "这是运维方管理的合同引用，不代表自动删除期限。" : "This operator-managed contract reference is not an automatic deletion period."}</small></div></section>
        <section role="tabpanel" data-settings-panel="portability" class="admin-surface" hidden>${raftSectionHeader({ title: locale === "zh-CN" ? "数据迁移" : "Data portability", description: locale === "zh-CN" ? "数据导入导出会保留版本、完整性摘要和租户边界。" : "Exports and imports preserve versioning, integrity digests, and tenant boundaries." })}<div class="settings-action-grid"><button type="button" data-export-company${formal ? "" : " disabled"}><strong>${locale === "zh-CN" ? "导出公司数据" : "Export company data"}</strong><small>${formal ? (locale === "zh-CN" ? "下载带完整性摘要的 JSON" : "Download a digest-protected JSON backup") : (locale === "zh-CN" ? "正式模式可用" : "Available in formal mode")}</small></button><button type="button" data-export-accountability${formal ? "" : " disabled"}><strong>${locale === "zh-CN" ? "导出责任审计包" : "Export accountability package"}</strong><small>${locale === "zh-CN" ? "仅包含审批、摘要证据、责任链和策略引用" : "Approvals, digest evidence, responsibility chains, and policy references only"}</small></button><button type="button" data-import-company${formal ? "" : " disabled"}><strong>${locale === "zh-CN" ? "验证并恢复公司" : "Validate and restore company"}</strong><small>${locale === "zh-CN" ? "先进行只读预检，确认摘要、责任身份和恢复范围后再执行" : "Runs a read-only preflight before you confirm the atomic restore"}</small></button><input type="file" accept="application/json,.json" data-import-company-file hidden></div>${formal ? `<div class="danger-zone"><div><p class="family-kicker">${locale === "zh-CN" ? "不可逆操作" : "IRREVERSIBLE ACTION"}</p><h3>${locale === "zh-CN" ? "关闭并归档公司" : "Close and archive company"}</h3><p>${locale === "zh-CN" ? "请先导出最新备份。系统会校验摘要，并在没有待审批、未完成工作或待投递消息时撤销所有成员访问。证据与审计记录按保留策略继续保存。" : "Export a fresh backup first. The service verifies its digest, then revokes member access only when no approval, work, or delivery remains unresolved. Evidence and audit records stay retained."}</p></div><form class="formal-work-form" data-archive-company-form><label class="family-field">${locale === "zh-CN" ? "最新备份文件" : "Fresh backup file"}<input class="family-control" type="file" name="backup" accept="application/json,.json" required></label><label class="family-field">${locale === "zh-CN" ? `输入“${escapeHtml(organization.company.name)}”确认` : `Type “${escapeHtml(organization.company.name)}” to confirm`}<input class="family-control" name="confirmation" required autocomplete="off"></label><label class="family-field">${locale === "zh-CN" ? "关闭原因" : "Closure reason"}<textarea class="family-control" name="reason" maxlength="1000" rows="3" required></textarea></label><button class="family-button family-button--danger" type="submit">${locale === "zh-CN" ? "验证备份并关闭公司" : "Verify backup and close company"}</button></form></div>` : ""}</section>
        <section role="tabpanel" data-settings-panel="profile" class="admin-surface" hidden>${raftSectionHeader({ title: locale === "zh-CN" ? "个人资料" : "Profile", description: locale === "zh-CN" ? "登录账号与公司岗位、责任分开管理。" : "Signed-in identity and company position/responsibility are separate objects." })}<div class="settings-state"><strong>${formal ? (locale === "zh-CN" ? "个人资料由身份服务提供" : "Profile supplied by identity provider") : (locale === "zh-CN" ? "本地工作区没有已验证身份" : "No verified identity in local workspace")}</strong><p>${locale === "zh-CN" ? "修改登录资料不会自动调整公司岗位、权限或负责范围。" : "Changing an identity profile never automatically changes company position, permissions, or accountability."}</p>${formal ? `<button class="family-button family-button--secondary" type="button" data-sign-out>${locale === "zh-CN" ? "退出登录" : "Sign out"}</button>` : ""}</div></section>
      </div>
    </div>
  </section>`;
}

function navigation(section: CompanyOSSection): string {
  let currentGroup: "WORK" | "COMPANY" | "CONTROL" | "ADMIN" | null = null;
  return sections().map((item) => {
    const groupLabel = getActiveLocale() === "zh-CN"
      ? ({ WORK: "工作", COMPANY: "公司", CONTROL: "治理", ADMIN: "管理" } as const)[item.group]
      : item.group;
    const group = item.group !== currentGroup
      ? `<p class="sidebar-section-label">${groupLabel}</p>`
      : "";
    currentGroup = item.group;
    return `${group}<button class="family-nav-item" type="button" data-section-target="${item.id}"${section === item.id ? ' aria-current="page"' : ""}>${sectionIcon(item.id)}<span>${item.label}</span></button>`;
  }).join("");
}

function commandPalette(section: CompanyOSSection): string {
  return `<dialog class="command-palette" data-command-palette aria-labelledby="command-title">
    <div class="command-palette-header">
      <div><p class="family-kicker">${copy("COMMAND MENU", "命令菜单")}</p><h2 id="command-title">${copy("Go to Company OS", "前往 Company OS 页面")}</h2></div>
      <button class="command-close" type="button" data-command-close aria-label="${copy("Close command menu", "关闭命令菜单")}">${iconSvg(X)}</button>
    </div>
    <label class="command-search"><span aria-hidden="true">${iconSvg(Search)}</span><input type="search" data-command-input placeholder="${copy("Search pages and settings", "搜索页面和设置")}" autocomplete="off"></label>
    <div class="command-results" role="listbox" aria-label="${copy("Company OS pages", "Company OS 页面")}">
      ${sections().map((item) => `<button type="button" class="command-result" role="option" data-command-target="${item.id}"${item.id === section ? ' aria-selected="true"' : ""}><span>${sectionIcon(item.id)}</span><span><strong>${item.label}</strong><small>${item.group}</small></span><kbd>↵</kbd></button>`).join("")}
      <p class="command-empty" data-command-empty hidden>${copy("No matching page.", "没有匹配页面。")}</p>
    </div>
    <p class="command-hint"><kbd>↑</kbd><kbd>↓</kbd> ${copy("Select", "选择")} · <kbd>Enter</kbd> ${copy("Open", "打开")} · <kbd>Esc</kbd> ${copy("Close", "关闭")}</p>
  </dialog>`;
}

function frontDoor(): string {
  return `<main class="company-front-door" aria-labelledby="front-door-title">
    <header><span class="front-door-mark" aria-hidden="true">C</span><strong>Company OS</strong></header>
    <section class="front-door-content">
      <div class="front-door-copy"><p class="family-kicker">COMPANY OS · AGENT NETWORK CONTROL (ANC)</p><h1 id="front-door-title">${copy("Enterprise management and governance for every AI agent.", "统一管理与治理企业中的每一个 AI Agent。")}</h1><p>${copy("Company OS provides ANC, a unified control layer for Agent identity, ownership, access, cost, risk, and lifecycle across teams, runtimes, and external platforms.", "Company OS 提供 ANC，作为统一控制层，跨团队、Runtime 与外部平台管理 Agent 的身份、归属、权限、成本、风险和生命周期。")}</p></div>
      <div class="front-door-actions">
        <button class="front-door-primary" type="button" data-enter-local><span>${copy("Set up Company OS", "配置 Company OS")}</span><small>${copy("Create your ANC control plane", "建立企业 ANC 控制平面")}</small></button>
        <button class="front-door-secondary" type="button" data-enter-existing><span>${copy("Sign in to Company OS", "登录 Company OS")}</span><small>${copy("Open your organization's ANC workspace", "进入企业 ANC 工作区")}</small></button>
        <button class="front-door-secondary" type="button" data-connect-local-agent><span>${copy("Connect local Agent", "连接本地 Agent")}</span><small>${copy("Check direct-connection requirements", "检查直连接入条件")}</small></button>
      </div>
      <button class="front-door-demo" type="button" data-enter-demo>${copy("Explore the Company OS demo", "体验 Company OS 公开 Demo")}</button>
      <p class="front-door-boundary">${copy("No sign-in. Isolated demo data. No credentials, model calls, or enterprise-system access.", "无需登录，使用隔离演示数据；不会创建凭据、调用模型或访问企业系统。")}</p>
    </section>
    <footer>${copy("ANC by Company OS · Inventory · Governance · Accountability", "Company OS 提供 ANC · 资产 · 治理 · 责任")}</footer>
  </main>`;
}

function restrictedFormalShell(status: FormalAccessStatus): string {
  const configured = status.identityProvider.configured;
  const feishu = status.identityProvider.providerId === "feishu";
  const identityLabel = feishu ? "Feishu OAuth" : "Enterprise OIDC";
  const identityChecklist = feishu
    ? ["Public base URL", "Feishu App ID", "Feishu App secret", "Feishu tenant key", "Redirect URI", "Session signing key", "Database URL"]
    : ["Public base URL", "Issuer URL", "Discovery URL", "Client ID", "Client secret", "Redirect URI", "Session signing key", "Database URL"];
  const blockerCode = status.blockers[0]?.code ?? "FORMAL_IDENTITY_REQUIRED";
  const lockedItems = ["Organization", "Tasks", "Approvals", "Governance"];
  return `<aside class="company-rail restricted-rail">
      <button class="sidebar-brand" type="button" data-formal-back><div class="brand-mark" aria-hidden="true">C</div><div><strong>Company OS</strong><span>${copy("Formal setup", "正式环境设置")}</span></div></button>
      <nav aria-label="${copy("Restricted formal navigation", "受限正式环境导航")}">
        <p class="sidebar-section-label">${copy("AVAILABLE", "可用")}</p>
        <button class="family-nav-item" type="button" data-gate-panel="identity" aria-current="page">${iconSvg(ShieldCheck)}<span>${copy("Identity settings", "身份设置")}</span></button>
        <button class="family-nav-item" type="button" data-gate-panel="agent-connection">${iconSvg(Network)}<span>${copy("Agent connection", "Agent 接入")}</span></button>
        <button class="family-nav-item" type="button" data-gate-panel="diagnostics">${iconSvg(ChartNoAxesColumnIncreasing)}<span>${copy("Diagnostics", "诊断")}</span></button>
        <p class="sidebar-section-label">${copy("LOCKED UNTIL SIGN-IN", "登录后开放")}</p>
        ${lockedItems.map((label) => `<button class="family-nav-item" type="button" disabled>${label}</button>`).join("")}
      </nav>
      <div class="sidebar-utilities"><div class="environment-row environment-row--blocked"><span aria-hidden="true"></span><div><strong>${copy("Formal access blocked", "正式访问已阻止")}</strong><small>${blockerCode}</small></div></div></div>
    </aside>
    <div class="app-main restricted-main">
      <header class="topbar family-header"><button type="button" class="gate-back" data-formal-back>${copy("Back", "返回")}</button><span class="topbar-company">${copy("NO COMPANY DATA LOADED", "未加载公司数据")}</span></header>
      <main class="workspace restricted-workspace">
        <section class="formal-gate-panel" data-gate-content="identity" aria-labelledby="formal-gate-title">
          <p class="family-kicker">${copy("ENTERPRISE IDENTITY REQUIRED", "需要企业身份")}</p>
          <h1 id="formal-gate-title">${configured ? copy("Sign in with enterprise identity", "使用企业身份登录") : copy("Connect enterprise identity", "连接企业身份")}</h1>
          <p>${configured ? copy(`${identityLabel} is configured. A valid formal session is still required before any company projection or command is available.`, `${identityLabel} 已配置。有效会话建立前，系统不会加载公司数据，也不会开放任何操作。`) : copy(`Company OS requires ${identityLabel} before a formal company can be created or opened. The service is running, but company capabilities remain fail-closed.`, `Company OS 必须先接入 ${identityLabel}，才能创建或打开正式公司。服务虽已启动，但系统仍会拒绝所有公司操作。`)}</p>
          <div class="formal-gate-code"><span>${copy("Blocking code", "状态代码")}</span><code>${blockerCode}</code></div>
          <div class="formal-gate-checklist" aria-label="${copy("Required server configuration", "必需的服务端配置")}">
            ${identityChecklist.map((item) => `<div><span aria-hidden="true">${iconSvg(configured ? CircleCheckBig : X)}</span><strong>${item}</strong><small>${configured ? copy("Configured", "已配置") : copy("Missing", "缺失")}</small></div>`).join("")}
          </div>
          <div class="family-banner family-banner--warning"><strong>${configured ? copy("Formal sign-in required", "需要正式登录") : copy("Server administrator action required", "需要服务端管理员配置")}</strong><span>${configured ? copy("Continue to your enterprise identity provider. Company data remains locked until the verified callback establishes a formal session.", "请继续前往企业身份服务登录。回调验证并建立正式会话前，公司数据与操作仍保持锁定。") : copy(`Configure ${identityLabel} on the server, restart the service, then return here. Credentials and signing material are never entered in this browser.`, `请在服务端配置 ${identityLabel} 并重启服务，然后返回此页面。浏览器不会要求输入客户端密钥或会话签名材料。`)}</span></div>
          ${configured ? `<button class="formal-sign-in" type="button" data-formal-sign-in>${copy("Continue with enterprise SSO", "使用企业 SSO 继续")}</button>` : ""}
        </section>
        <section class="formal-gate-panel" data-gate-content="agent-connection" aria-labelledby="formal-agent-connection-title" hidden>
          <p class="family-kicker">${copy("LOCAL AGENT DIRECT CONNECTION", "本地 AGENT 直连")}</p>
          <h1 id="formal-agent-connection-title">${copy("Sign in before registering an Agent runtime", "登录后才能登记 Agent 运行环境")}</h1>
          <p>${copy("Company OS can directly connect only to a self-hosted or network-reachable Agent Node. A hosted control plane cannot reach localhost on your laptop.", "Company OS 只能直连自托管或网络可达的 Agent Node；托管控制平面无法访问你电脑上的 localhost。")}</p>
          <div class="formal-gate-code"><span>${copy("Next step", "下一步")}</span><code>${configured ? copy("SIGN_IN_THEN_OPEN_AGENT_ACCESS", "登录后打开_AGENT_接入") : copy("CONFIGURE_IDENTITY_FIRST", "先配置企业身份")}</code></div>
          <div class="formal-gate-actions">${configured ? `<button class="family-button family-button--primary" type="button" data-formal-sign-in>${copy("Sign in and continue", "登录并继续")}</button>` : `<button class="family-button family-button--secondary" type="button" data-gate-panel="identity">${copy("Review identity requirements", "查看身份配置要求")}</button>`}</div>
        </section>
        <section class="formal-gate-panel" data-gate-content="diagnostics" hidden aria-labelledby="formal-diagnostics-title">
          <p class="family-kicker">${copy("SAFE DIAGNOSTICS", "安全诊断")}</p><h1 id="formal-diagnostics-title">${copy("Formal entry diagnostics", "正式环境诊断")}</h1>
          <dl class="formal-diagnostics"><div><dt>${copy("Service", "服务")}</dt><dd>${copy("Available", "可用")}</dd></div><div><dt>${copy("Identity protocol", "身份协议")}</dt><dd>${status.identityProvider.protocol}</dd></div><div><dt>${copy("Provider", "身份服务")}</dt><dd>${identityLabel}</dd></div><div><dt>${copy("Provider configuration", "身份服务配置")}</dt><dd>${configured ? copy("Complete", "已完成") : copy("Incomplete", "未完成")}</dd></div><div><dt>${copy("Formal session", "正式会话")}</dt><dd>${copy("Not established", "尚未建立")}</dd></div><div><dt>${copy("Company projection", "公司数据")}</dt><dd>${copy("Not requested", "尚未加载")}</dd></div></dl>
        </section>
      </main>
    </div>`;
}

function formalCompanyBootstrap(
  directory: CompanyDirectoryProjection,
  deploymentProfile: FormalAccessStatus["deploymentProfile"],
): string {
  const canCreate = directory.isInstanceAdmin;
  const managedProvisioning = !canCreate && deploymentProfile === "managed-cloud";
  return `<aside class="company-rail restricted-rail">
      <div class="sidebar-brand"><div class="brand-mark" aria-hidden="true">C</div><div><strong>Company OS</strong><span>${copy("Company setup", "公司设置")}</span></div></div>
      <nav aria-label="${copy("Company setup navigation", "公司设置导航")}">
        <p class="sidebar-section-label">${copy("SETUP", "设置")}</p>
        <div class="family-nav-item" aria-current="page">${iconSvg(UsersRound)}<span>${copy("Create company", "创建公司")}</span></div>
        <button class="family-nav-item" type="button" disabled>${copy("Organization", "组织架构")}</button>
        <button class="family-nav-item" type="button" disabled>${copy("Agent colleagues", "Agent 同事")}</button>
      </nav>
      <div class="sidebar-utilities"><div class="environment-row"><span aria-hidden="true"></span><div><strong>${copy("Identity verified", "身份已验证")}</strong><small>${copy("No company membership yet", "尚无公司成员关系")}</small></div></div></div>
    </aside>
    <div class="app-main restricted-main">
      <header class="topbar family-header"><span class="topbar-company">${copy("NO COMPANY SELECTED", "未选择公司")}</span></header>
      <main class="workspace restricted-workspace">
        <section class="formal-gate-panel" aria-labelledby="company-bootstrap-title">
          <p class="family-kicker">${copy("AUTHENTICATED SETUP", "已验证身份设置")}</p>
          <h1 id="company-bootstrap-title">${canCreate ? copy("Create your first company", "创建第一家公司") : managedProvisioning ? copy("Managed account provisioning", "托管账户配置中") : copy("Claim this private instance", "设置首任管理员")}</h1>
          <p>${canCreate ? copy("The company and your owner membership are committed together. Organization, Agent and responsibility setup follows next.", "公司与公司所有者身份会同时创建。接下来再设置组织架构、Agent 和责任关系。") : managedProvisioning ? copy("Your enterprise identity is verified. A platform administrator must bind it to the first managed account before company creation is enabled.", "企业身份已经验证。平台管理员需要先将该身份绑定为托管账户管理员，之后才能创建公司。") : copy("A private self-hosted instance needs one explicit first administrator before a company can be created. Public deployments do not expose this action.", "私有化部署（self-hosted）必须先设置首任管理员，之后才能创建公司；公网部署不会开放此操作。")}</p>
          ${canCreate ? `<form class="formal-company-form" data-formal-company-form>
            <label><span>${copy("Company name", "公司名称")}</span><input name="name" maxlength="120" required autocomplete="organization"></label>
            <label><span>${copy("Company purpose", "公司目标")}</span><textarea name="purpose" maxlength="2000" required></textarea></label>
            <label><span>${copy("Default locale", "默认语言")}</span><select name="locale"><option value="en-US">English</option><option value="zh-CN">简体中文</option></select></label>
            <button class="formal-sign-in" type="submit">${copy("Create company", "创建公司")}</button>
          </form><div class="formal-bootstrap-divider"><span>${copy("or", "或")}</span></div><form class="formal-company-form" data-formal-company-restore-form><label><span>${copy("Portable company backup", "公司迁移备份")}</span><input name="backup" type="file" accept="application/json,.json" required></label><p>${copy("Restore creates the company, your owner membership, and the verified control-plane state atomically. The signed-in human ID must already be the accountable human recorded in the backup; identity rebinding is never inferred.", "恢复操作会原子创建公司、你的所有者成员关系及已验证的控制平面状态。当前登录的真人 ID 必须已经是备份中记录的责任人；系统不会自行重绑身份。")}</p><button class="formal-sign-in" type="submit">${copy("Restore company", "恢复公司")}</button></form>` : managedProvisioning ? `<div class="family-banner family-banner--warning"><strong>${copy("Platform administrator action required", "需要平台管理员操作")}</strong><span>${copy("Refresh after provisioning is complete. No credential or bootstrap secret is entered in this browser.", "配置完成后刷新页面。浏览器不会要求输入凭据或初始化密钥。")}</span></div>` : `<div class="family-banner family-banner--warning"><strong>${copy("Explicit claim required", "需要设置首任管理员")}</strong><span>${copy("This never grants access to existing companies. Every company still requires an active membership.", "设置首任管理员不会授予任何已有公司的访问权；访问每家公司仍需有效的成员身份。")}</span></div><button class="formal-sign-in" type="button" data-claim-first-admin>${copy("Claim first administrator", "设置首任管理员")}</button>`}
        </section>
      </main>
    </div>`;
}

function formalOrganizationBootstrap(companyName: string): string {
  return `<aside class="company-rail restricted-rail">
      <div class="sidebar-brand"><div class="brand-mark" aria-hidden="true">C</div><div><strong>${escapeHtml(companyName)}</strong><span>${copy("Organization setup", "组织设置")}</span></div></div>
      <nav aria-label="${copy("Organization setup navigation", "组织设置导航")}">
        <p class="sidebar-section-label">${copy("SETUP", "设置")}</p>
        <div class="family-nav-item" aria-current="page">${iconSvg(UsersRound)}<span>${copy("Accountable human", "真人负责人")}</span></div>
        <button class="family-nav-item" type="button" disabled>${copy("Agent colleagues", "Agent 同事")}</button>
        <button class="family-nav-item" type="button" disabled>${copy("Responsibility contracts", "责任合同")}</button>
      </nav>
    </aside>
    <div class="app-main restricted-main">
      <header class="topbar family-header"><span class="topbar-company">${escapeHtml(companyName)}</span></header>
      <main class="workspace restricted-workspace">
        <section class="formal-gate-panel" aria-labelledby="organization-bootstrap-title">
          <p class="family-kicker">${copy("HUMAN ACCOUNTABILITY FIRST", "先明确真人责任")}</p>
          <h1 id="organization-bootstrap-title">${copy("Set up the accountable owner", "设置公司真人负责人")}</h1>
          <p>${copy("Your verified enterprise identity becomes the first human principal. No fixture Agent is created; add real Connector-bound Agents only after this step.", "当前已验证的企业身份会成为第一位真人成员。系统不会创建演示 Agent；完成后再通过 Connector 接入真实 Agent。")}</p>
          <form class="formal-company-form" data-formal-organization-form>
            <label><span>${copy("Department name", "部门名称")}</span><input name="departmentName" maxlength="120" required value="Operations"></label>
            <label><span>${copy("Your company title", "你的公司岗位")}</span><input name="ownerTitle" maxlength="120" required value="Founder"></label>
            <button class="formal-sign-in" type="submit">${copy("Create organization", "创建组织")}</button>
          </form>
        </section>
      </main>
    </div>`;
}

function mobileNavigation(section: CompanyOSSection): string {
  const items: readonly { readonly id: CompanyOSSection; readonly label: string }[] = [
    { id: "office", label: t("nav.office") },
    { id: "work", label: t("nav.workApprovals") },
    { id: "organization", label: t("nav.organization") },
    { id: "connectors", label: t("nav.connectors") },
    { id: "settings", label: t("nav.settings") },
  ];
  return `<nav class="mobile-bottom-nav" aria-label="Company OS mobile navigation">
    ${items.slice(0, 2).map((item) => `<button type="button" data-section-target="${item.id}"${section === item.id ? ' aria-current="page"' : ""}>${sectionIcon(item.id)}<span>${item.label}</span></button>`).join("")}
    <button type="button" class="mobile-create" data-open-new-task aria-label="${copy("New task", "新建任务")}"><span aria-hidden="true">${iconSvg(Plus)}</span><small>${copy("New", "新建")}</small></button>
    ${items.slice(2).map((item) => `<button type="button" data-section-target="${item.id}"${section === item.id ? ' aria-current="page"' : ""}>${sectionIcon(item.id)}<span>${item.label}</span></button>`).join("")}
  </nav>`;
}

function storedViewChoice<const T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value && allowed.includes(value as T) ? value as T : fallback;
  } catch {
    return fallback;
  }
}

function storeViewChoice(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch { /* browser storage may be unavailable */ }
}

export function mountCompanyOS(
  host: CompanyOSHostContract,
  application: CompanyOSApplicationClient = createDemoApplicationClient(),
): MountedCompanyOS {
  const initialLocale = readStoredLocale(
    typeof window === "undefined" ? undefined : window.localStorage,
    typeof navigator === "undefined" ? undefined : navigator.language,
  );
  setActiveLocale(initialLocale);
  let section: CompanyOSSection = host.initialSection ?? "office";
  let disposed = false;
  let onboardingVisible = true;
  let frontDoorVisible = application.mode === "DEMO_FIXTURE";
  let formalGateVisible = false;
  let formalGateReturn: "front-door" | "local-workspace" = "front-door";
  let formalAccessStatus: FormalAccessStatus | null = null;
  let formalSignInAttempted = false;
  let formalDirectory: CompanyDirectoryProjection | null = null;
  let selectedFormalCompanyId: string | null = null;
  let formalOrganizationMissing = false;
  let explicitDemo = false;
  const publicDemoClient = createPublicDemoClient(host.publicDemoBaseUrl ?? "");
  let publicDemoSnapshot: PublicDemoPortfolioSnapshot | null = null;
  let openSetupAfterRender = false;
  let localSetupRequired = false;
  let selectedWorkId: string | null = null;
  let activeInboxFilter: InboxFilter = "needs-me";
  let activeWorkView = storedViewChoice("company-os.work-view", ["list", "board"] as const, "list");
  let activeWorkFilter = storedViewChoice("company-os.work-filter", ["all", "active", "resolved"] as const, "all");
  let activeWorkSort = storedViewChoice("company-os.work-sort", ["newest", "oldest"] as const, "newest");
  let latestHumanInvite: HumanInviteProjection | null = null;
  let latestSecretManagement: {
    session: SecretReferenceManagementSession;
    result: SecretReferenceManagementResult | null;
  } | null = null;
  let actionQueue: Promise<void> = Promise.resolve();
  let activeAdministrationTab = "connectors";
  let unmountWorkforceGraph: (() => void) | undefined;
  const root = document.createElement("div");
  root.className = "company-os family-ui";
  root.lang = initialLocale;
  host.mountElement.replaceChildren(root);
  const handleGlobalKeydown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    const isTyping = target?.matches("input, textarea, select, [contenteditable=true]") ?? false;
    if (((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") || (event.key === "/" && !isTyping)) {
      event.preventDefault();
      const palette = root.querySelector<HTMLDialogElement>("[data-command-palette]");
      if (palette && !palette.open) palette.showModal();
      requestAnimationFrame(() => palette?.querySelector<HTMLInputElement>("[data-command-input]")?.focus());
    }
  };
  document.addEventListener("keydown", handleGlobalKeydown);

  const failureCopy = (failure: ReturnType<typeof formalWebFailure>): string => ({
    UNAUTHORIZED: copy("Sign in with your enterprise identity to continue.", "请先使用企业身份登录。"),
    FORBIDDEN: copy("Your current role cannot access this company or operation.", "当前身份无权访问这家公司或执行此操作。"),
    OFFLINE: copy("Company OS is unreachable. Your current page and input have been preserved.", "暂时无法连接 Company OS；当前页面和输入已保留。"),
    EMPTY: copy("The requested formal record is not available yet.", "当前还没有可显示的正式记录。"),
    LIMIT: copy("An applicable budget has reached its hard limit. New work is blocked.", "适用预算已达到上限，暂时无法创建新的工作。"),
    FAILURE: copy("Company OS could not complete this operation.", "Company OS 暂时无法完成此操作。"),
  })[failure.kind];

  function renderFailure(error: unknown): void {
    const failure = formalWebFailure(error);
    root.removeAttribute("aria-busy");
    root.innerHTML = `<section class="system-state" role="alert" data-state="${failure.kind}">
      <p class="family-kicker">${failure.kind}</p><h1>${escapeHtml(failureCopy(failure))}</h1>
      <p>${copy("Error code", "错误代码")}: <code>${escapeHtml(failure.code)}</code></p>
      <button class="family-button family-button--secondary cos-button cos-button--secondary" type="button" data-retry>${copy("Try again", "重试")}</button>
    </section>`;
    root.querySelector<HTMLButtonElement>("[data-retry]")?.addEventListener("click", () => void render());
  }

  function renderTenantRouteUnavailable(): void {
    root.removeAttribute("aria-busy");
    root.innerHTML = `<section class="system-state" role="alert" data-state="FORBIDDEN">
      <p class="family-kicker">${copy("COMPANY NOT AVAILABLE", "公司空间不可用")}</p>
      <h1>${copy("This company path is unknown or unavailable to your identity.", "该公司路径不存在，或当前身份无权访问。")}</h1>
      <a class="family-button family-button--secondary cos-button cos-button--secondary" href="/">${copy("Return to Company OS", "返回 Company OS 首页")}</a>
    </section>`;
  }

  function renderActionFailure(error: unknown): void {
    const failure = formalWebFailure(error);
    root.removeAttribute("aria-busy");
    root.querySelector("[data-action-failure]")?.remove();
    const alert = document.createElement("section");
    alert.className = "action-failure-banner";
    alert.dataset.actionFailure = failure.kind;
    alert.setAttribute("role", "alert");
    alert.innerHTML = `<div><strong>${escapeHtml(failureCopy(failure))}</strong><span>${copy("Error code", "错误代码")}: <code>${escapeHtml(failure.code)}</code></span></div><div><button type="button" data-action-refresh>${copy("Reload authoritative state", "重新加载正式状态")}</button><button type="button" data-action-dismiss>${copy("Dismiss", "关闭")}</button></div>`;
    (root.querySelector(".workspace") ?? root).prepend(alert);
    alert.querySelector<HTMLButtonElement>("[data-action-refresh]")?.addEventListener("click", () => void render());
    alert.querySelector<HTMLButtonElement>("[data-action-dismiss]")?.addEventListener("click", () => alert.remove());
  }

  function runAction(action: () => Promise<unknown>): Promise<void> {
    const operation = actionQueue.then(async () => {
      root.setAttribute("aria-busy", "true");
      root.inert = true;
      try {
        await action();
        await render();
      } catch (error) {
        renderActionFailure(error);
      } finally {
        root.inert = false;
      }
    });
    actionQueue = operation.catch(() => undefined);
    return operation;
  }

  function confirmCompanyRestore(inspection: CompanyBackupInspection): Promise<boolean> {
    const dialog = document.createElement("dialog");
    dialog.className = "company-restore-dialog";
    dialog.dataset.companyRestoreConfirmation = "";
    dialog.setAttribute("aria-labelledby", "company-restore-confirmation-title");
    dialog.innerHTML = `<form method="dialog"><p class="family-kicker">${copy("VERIFIED RESTORE PLAN", "已验证恢复计划")}</p><h2 id="company-restore-confirmation-title">${copy("Restore", "恢复")} ${escapeHtml(inspection.name)}?</h2><p>${copy("The server verified the backup, exact signed-in human binding, and a clean target company ID. Confirming creates the company and control-plane state in one transaction.", "服务端已验证备份、当前登录真人的精确身份绑定，以及未被占用的公司 ID。确认后，公司和控制平面状态将在同一事务中创建。")}</p><dl><div><dt>${copy("Company ID", "公司 ID")}</dt><dd><code>${escapeHtml(inspection.companyId)}</code></dd></div><div><dt>${copy("Identity binding", "身份绑定")}</dt><dd>${copy("Exact human match", "真人身份精确匹配")}</dd></div><div><dt>${copy("Organization", "组织")}</dt><dd>${inspection.humanCount} ${copy("humans", "位真人")} · ${inspection.agentCount} Agent</dd></div><div><dt>${copy("Control-plane state", "控制平面状态")}</dt><dd>${inspection.eventCount} ${copy("events", "条事件")} · ${inspection.deliveredPublicationCount} ${copy("delivered publications", "条已投递消息")} · ${inspection.checkpointCount} ${copy("checkpoints", "个检查点")}</dd></div></dl><div class="company-restore-dialog-actions"><button class="family-button family-button--secondary" type="submit" value="cancel">${copy("Cancel", "取消")}</button><button class="family-button family-button--primary" type="submit" value="confirm">${copy("Restore company", "恢复公司")}</button></div></form>`;
    document.body.append(dialog);
    return new Promise((resolve) => {
      dialog.addEventListener("close", () => {
        const confirmed = dialog.returnValue === "confirm";
        dialog.remove();
        resolve(confirmed);
      }, { once: true });
      dialog.showModal();
    });
  }

  async function restoreCompanySource(source: string): Promise<void> {
    const inspection = await application.inspectCompanyBackup(source);
    if (!await confirmCompanyRestore(inspection)) return;
    const companyId = await application.importCompany(source);
    application.selectCompany(companyId);
    selectedFormalCompanyId = companyId;
    window.localStorage.setItem("company-os.selected-company", companyId);
    formalDirectory = await application.companies();
  }

  function bindFrontDoor(): void {
    root.querySelector<HTMLButtonElement>("[data-enter-demo]")?.addEventListener("click", () => {
      void runAction(async () => {
        publicDemoSnapshot = await publicDemoClient.create();
        explicitDemo = true;
        frontDoorVisible = false;
        onboardingVisible = false;
      });
    });
    root.querySelector<HTMLButtonElement>("[data-enter-local]")?.addEventListener("click", () => {
      window.location.assign("/start");
    });
    root.querySelector<HTMLButtonElement>("[data-enter-existing]")?.addEventListener("click", () => {
      frontDoorVisible = false;
      formalGateReturn = "front-door";
      root.setAttribute("aria-busy", "true");
      void application.formalAccess().then(async (status) => {
        formalAccessStatus = status;
        if (status.entryState === "AUTHENTICATION_REQUIRED" && status.identityProvider.configured) {
          const authorizationUrl = await application.beginFormalSignIn(window.location.pathname);
          window.location.assign(authorizationUrl);
          return;
        }
        formalGateVisible = status.entryState !== "READY";
        await render();
      }).catch((error) => renderFailure(error));
    });
    root.querySelector<HTMLButtonElement>("[data-connect-local-agent]")?.addEventListener("click", () => {
      explicitDemo = false;
      onboardingVisible = false;
      frontDoorVisible = false;
      section = "connectors";
      void render();
    });
  }

  function bindFormalGate(): void {
    root.querySelectorAll<HTMLButtonElement>("[data-formal-sign-in]").forEach((button) => {
      button.addEventListener("click", () => {
        void application.beginFormalSignIn()
          .then((authorizationUrl) => window.location.assign(authorizationUrl))
          .catch((error) => renderFailure(error));
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-formal-back]").forEach((button) => {
      button.addEventListener("click", () => {
        formalGateVisible = false;
        frontDoorVisible = formalGateReturn === "front-door";
        void render();
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-gate-panel]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = button.dataset.gatePanel;
        root.querySelectorAll<HTMLButtonElement>("[data-gate-panel]").forEach((candidate) => {
          candidate.toggleAttribute("aria-current", candidate === button);
        });
        root.querySelectorAll<HTMLElement>("[data-gate-content]").forEach((panel) => {
          panel.hidden = panel.dataset.gateContent !== target;
        });
      });
    });
  }

  function bindFormalCompanyBootstrap(): void {
    root.querySelector<HTMLButtonElement>("[data-claim-first-admin]")?.addEventListener("click", () => {
      void runAction(async () => {
        await application.claimFirstAdmin();
        formalDirectory = await application.companies();
      });
    });
    root.querySelector<HTMLFormElement>("[data-formal-company-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget as HTMLFormElement);
      void runAction(async () => {
        const companyId = await application.createCompany({
          name: String(form.get("name") ?? ""),
          purpose: String(form.get("purpose") ?? ""),
          locale: String(form.get("locale") ?? "en-US"),
        });
        application.selectCompany(companyId);
        window.localStorage.setItem("company-os.selected-company", companyId);
        formalDirectory = await application.companies();
      });
    });
    root.querySelector<HTMLFormElement>("[data-formal-company-restore-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const file = new FormData(event.currentTarget as HTMLFormElement).get("backup");
      void runAction(async () => {
        if (!(file instanceof File)) throw new Error("DURABLE_BACKUP_INVALID");
        await restoreCompanySource(await file.text());
      });
    });
  }

  function bindFormalOrganizationBootstrap(): void {
    root.querySelector<HTMLFormElement>("[data-formal-organization-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget as HTMLFormElement);
      void runAction(async () => {
        await application.setupOrganization({
          departmentName: String(form.get("departmentName") ?? ""),
          ownerTitle: String(form.get("ownerTitle") ?? ""),
        });
        formalOrganizationMissing = false;
      });
    });
  }

  async function render(): Promise<void> {
    if (disposed) return;
    if (frontDoorVisible) {
      root.innerHTML = frontDoor();
      root.removeAttribute("aria-busy");
      bindFrontDoor();
      return;
    }
    if (application.mode === "FORMAL" && !formalAccessStatus) {
      try {
        formalAccessStatus = await application.formalAccess();
        if (
          formalAccessStatus.entryState === "AUTHENTICATION_REQUIRED" &&
          formalAccessStatus.identityProvider.configured &&
          !formalSignInAttempted
        ) {
          formalSignInAttempted = true;
          const callbackPath = `${window.location.pathname}${window.location.search}`;
          const authorizationUrl = await application.beginFormalSignIn(callbackPath);
          window.location.assign(authorizationUrl);
          return;
        }
      } catch (error) {
        renderFailure(error);
        return;
      }
      formalGateVisible = formalAccessStatus.entryState !== "READY";
    }
    if (formalGateVisible && formalAccessStatus) {
      root.innerHTML = restrictedFormalShell(formalAccessStatus);
      root.removeAttribute("aria-busy");
      bindFormalGate();
      return;
    }
    if (application.mode === "FORMAL") {
      if (!formalAccessStatus) {
        renderFailure(new Error("FORMAL_ACCESS_STATUS_UNAVAILABLE"));
        return;
      }
      try {
        formalDirectory ??= await application.companies();
      } catch (error) {
        renderFailure(error);
        return;
      }
      if (host.requestedTenantSlug &&
          !formalDirectory.companies.some(({ slug }) => slug === host.requestedTenantSlug)) {
        renderTenantRouteUnavailable();
        return;
      }
      if (!formalDirectory.companies.length) {
        root.innerHTML = formalCompanyBootstrap(formalDirectory, formalAccessStatus.deploymentProfile);
        root.removeAttribute("aria-busy");
        bindFormalCompanyBootstrap();
        return;
      }
      selectedFormalCompanyId = resolveFormalCompanySelection(
        formalDirectory,
        selectedFormalCompanyId,
        window.localStorage.getItem("company-os.selected-company"),
        host.requestedTenantSlug,
      );
      if (!selectedFormalCompanyId) {
        renderFailure(new Error("COMPANY_SELECTION_UNAVAILABLE"));
        return;
      }
      application.selectCompany(selectedFormalCompanyId);
      window.localStorage.setItem("company-os.selected-company", selectedFormalCompanyId);
      if (formalOrganizationMissing) {
        const selectedCompany = formalDirectory.companies.find(({ id }) => id === selectedFormalCompanyId);
        root.innerHTML = formalOrganizationBootstrap(selectedCompany?.name ?? copy("Selected company", "当前公司"));
        root.removeAttribute("aria-busy");
        bindFormalOrganizationBootstrap();
        return;
      }
    }
    root.setAttribute("aria-busy", "true");
    if (!root.childElementCount) {
      root.innerHTML = `<section class="system-state" data-state="LOADING"><p class="family-kicker">${copy("LOADING", "加载中")}</p><h1>${copy("Loading the company control plane…", "正在加载公司控制平面…")}</h1></section>`;
    }
    let state: CompanyWorkState;
    let organization: OrganizationDraft;
    let assignmentOptions: Awaited<ReturnType<CompanyOSApplicationClient["assignmentOptions"]>>;
    let administration: AdministrationProjection | null;
    let planning: PlanningCatalog;
    let memberDirectory: CompanyHumanMemberDirectory;
    let workCatalog: FormalWorkCatalog | null;
    let formalActivity: Awaited<ReturnType<CompanyOSApplicationClient["activity"]>> | null;
    let accountabilityLedger: Awaited<ReturnType<CompanyOSApplicationClient["accountabilityLedger"]>>;
    try {
      [state, organization, assignmentOptions, administration, planning, memberDirectory, workCatalog, formalActivity, accountabilityLedger] = await Promise.all([
        application.snapshot(),
        application.organization(),
        application.assignmentOptions(),
        application.administration(),
        application.planning(),
        application.humanMembers(),
        application.mode === "FORMAL" ? application.workCatalog() : Promise.resolve(null),
        application.mode === "FORMAL" ? application.activity() : Promise.resolve(null),
        application.accountabilityLedger(),
      ]);
    } catch (error) {
      if (application.mode === "FORMAL" && error instanceof Error && error.message === "ORGANIZATION_NOT_FOUND" && formalDirectory?.companies.length) {
        formalOrganizationMissing = true;
        const selectedCompany = formalDirectory.companies.find(({ id }) => id === selectedFormalCompanyId);
        root.innerHTML = formalOrganizationBootstrap(selectedCompany?.name ?? copy("Selected company", "当前公司"));
        root.removeAttribute("aria-busy");
        bindFormalOrganizationBootstrap();
        return;
      }
      renderFailure(error);
      return;
    }
    if (disposed) return;

    const isFixtureRuntime = application.mode === "DEMO_FIXTURE";
    const isDemo = isFixtureRuntime && explicitDemo;
    const activeSectionLabel = sections().find((item) => item.id === section)?.label ?? t("app.name");
    const locale = getActiveLocale();
    const selectedCatalogItem = selectedWorkId && workCatalog
      ? workCatalog.items.find(({ work }) => work.id === selectedWorkId)
      : null;
    const activeWorkTitle = workCatalog?.items.find(({ work }) =>
      work.id === state.responsibility.workId)?.work.title;
    const pageState: CompanyWorkState = formalActivity ? {
      ...state,
      events: formalActivity.items.map((item) => ({
        id: item.id, type: item.type, occurredAt: item.occurredAt,
        summary: item.summary, isFixture: false,
      })),
    } : state;
    let runTimeline: WorkRunTimelinePage | null = null;
    const selectedAttempt = selectedCatalogItem?.attempts.at(-1);
    if (application.mode === "FORMAL" && section === "work" && selectedCatalogItem && selectedAttempt) {
      try {
        runTimeline = await application.workRunTimeline(selectedCatalogItem.work.id, selectedAttempt.id);
      } catch (error) {
        renderFailure(error);
        return;
      }
    }
    if (disposed) return;
    const visibleWorkState = selectedCatalogItem
      ? workStateForCatalogItem(state, selectedCatalogItem, runTimeline)
      : state;
    let main: string;
    const portfolioSection = (["office", "agents", "work", "approvals", "connectors", "usage"] as const)
      .find((candidate) => candidate === section);
    if (isDemo && publicDemoSnapshot && portfolioSection) {
      main = agentPortfolioPage(portfolioSection, publicDemoSnapshot, locale);
    } else switch (section) {
      case "office": main = officeView(pageState, organization, activeWorkTitle); break;
      case "inbox": main = inboxPage(pageState, organization, locale, activeInboxFilter, workCatalog, accountabilityLedger, activeWorkTitle); break;
      case "work": main = workView(visibleWorkState, organization, selectedWorkId !== null, workCatalog, {
        view: activeWorkView, filter: activeWorkFilter, sort: activeWorkSort,
      }); break;
      case "goals": main = goalsPage(pageState, organization, locale, planning, application.mode === "FORMAL" || (isFixtureRuntime && !isDemo), activeWorkTitle); break;
      case "projects": main = projectsPage(organization, locale, planning, application.mode === "FORMAL" || (isFixtureRuntime && !isDemo)); break;
      case "organization": main = organizationView(
        organization, true, isDemo, application.mode === "FORMAL", latestHumanInvite,
        administration,
      ); break;
      case "humans": main = humansPage(organization, locale); break;
      case "agents": main = agentsPage(pageState, organization, locale, assignmentOptions, application.mode === "FORMAL"); break;
      case "approvals": main = approvalsPage(pageState, organization, locale, activeWorkTitle, accountabilityLedger); break;
      case "evidence": main = evidencePage(pageState, locale, accountabilityLedger); break;
      case "activity": main = activityPage(pageState, locale, formalActivity); break;
      case "responsibility": main = responsibilityView(pageState, organization, activeWorkTitle); break;
      case "connectors": main = connectorsView(application.mode, administration, isDemo, organization, latestSecretManagement); break;
      case "usage": main = usagePage(administration, locale); break;
      case "settings": main = settingsView(application.mode, locale, memberDirectory, organization, administration); break;
    }

    unmountWorkforceGraph?.();
    unmountWorkforceGraph = undefined;
    const companySwitcher = application.mode === "FORMAL" && formalDirectory
      ? `<div class="sidebar-company-switcher"><button class="sidebar-brand" type="button" data-company-menu-trigger aria-expanded="false" aria-haspopup="menu"><div class="brand-mark" aria-hidden="true">C</div><div><strong>${escapeHtml(organization.company.name)}</strong><span>${t("app.name")}</span></div><span class="brand-switch" aria-hidden="true">⌄</span></button><div class="sidebar-company-menu" data-company-menu role="menu" hidden><p>${copy("COMPANIES", "公司")}</p>${formalDirectory.companies.map((company) => `<button type="button" role="menuitemradio" aria-checked="${company.id === selectedFormalCompanyId}" data-select-company="${escapeHtml(company.id)}"><span class="company-menu-mark" aria-hidden="true">${escapeHtml(company.name.slice(0, 1).toLocaleUpperCase())}</span><span><strong>${escapeHtml(company.name)}</strong><small>${escapeHtml(company.membershipRole)}</small></span>${company.id === selectedFormalCompanyId ? `<span aria-hidden="true">${iconSvg(CircleCheckBig)}</span>` : ""}</button>`).join("")}<button type="button" role="menuitem" data-open-company-settings><span class="company-menu-mark" aria-hidden="true">${iconSvg(Settings)}</span><span><strong>${copy("Company settings", "公司设置")}</strong><small>${copy("Identity, deployment, and access", "身份、部署与访问")}</small></span></button></div></div>`
      : `<button class="sidebar-brand" type="button" data-section-target="office" aria-label="${escapeHtml(organization.company.name)}, ${copy("return to Dashboard", "返回仪表盘")}"><div class="brand-mark" aria-hidden="true">C</div><div><strong>${escapeHtml(organization.company.name)}</strong><span>${t("app.name")}</span></div><span class="brand-switch" aria-hidden="true">⌄</span></button>`;
    const productShell = `<aside class="company-rail" aria-label="${copy("Company navigation", "公司导航")}">
        ${companySwitcher}
        <div class="sidebar-quick-actions">
          <button type="button" data-open-new-task><span aria-hidden="true">${iconSvg(Plus)}</span><span>${copy("New Task", "新建任务")}</span><kbd>C</kbd></button>
          <button type="button" data-open-command><span aria-hidden="true">${iconSvg(Search)}</span><span>${copy("Search", "搜索")}</span><kbd>⌘K</kbd></button>
          ${isFixtureRuntime && onboardingVisible ? `<button type="button" data-open-setup><span aria-hidden="true">${iconSvg(UsersRound)}</span><span>${copy("Set up company", "设置公司")}</span><kbd></kbd></button>` : ""}
        </div>
        <nav aria-label="${copy("Company OS sections", "Company OS 页面")}">${navigation(section)}</nav>
        <div class="sidebar-utilities">
          <div class="environment-row"><span aria-hidden="true"></span><div><strong>${isDemo ? copy("Demo environment", "演示环境") : isFixtureRuntime ? copy("Local workspace", "本地工作区") : copy("Production", "生产环境")}</strong><small>${isDemo ? copy("Isolated fixture data", "隔离演示数据") : isFixtureRuntime ? copy("Not connected", "未连接") : copy("Identity verified", "身份已验证")}</small></div></div>
          ${isDemo ? `<button type="button" class="utility-button" data-global-reset><span aria-hidden="true">${iconSvg(RotateCcw)}</span>${t("action.reset")}</button>` : ""}
        </div>
      </aside>
      <div class="app-main">
        <header class="topbar family-header"><nav class="topbar-breadcrumb" aria-label="${copy("Breadcrumb", "面包屑导航")}"><span>${escapeHtml(organization.company.name)}</span><span aria-hidden="true">/</span><strong>${activeSectionLabel}</strong></nav><span class="topbar-company">${isDemo ? t("demo.badge") : isFixtureRuntime ? copy("LOCAL WORKSPACE", "本地工作区") : escapeHtml(organization.company.name)}</span></header>
        <main class="workspace">${isFixtureRuntime && !isDemo ? `<section class="local-draft-banner" aria-label="${copy("Local workspace capability status", "本地工作区能力状态")}"><div><strong>${copy("Local draft — formal capabilities are not connected", "本地草稿 · 尚未接入正式能力")}</strong><p>${copy("Organization and planning changes stay in this browser session. Real Agent execution, enterprise data, Secrets, and production approvals remain unavailable.", "组织与规划变更仅保留在当前浏览器会话中。真实 Agent 执行、企业数据、Secret 和正式审批仍不可用。")}</p></div><button type="button" data-open-formal-access>${copy("Configure formal access", "配置正式访问")}</button></section>` : ""}${main}</main>
      </div>
      ${mobileNavigation(section)}
      ${isFixtureRuntime ? setupDialog() : ""}
      ${newTaskDialog(state, assignmentOptions, isFixtureRuntime && !isDemo, application.mode === "FORMAL", administration)}
      ${commandPalette(section)}`;
    root.innerHTML = productShell;
    root.removeAttribute("aria-busy");

    const navigateTo = (nextSection: CompanyOSSection): void => {
      section = nextSection;
      selectedWorkId = null;
      host.onNavigate?.(`${host.basePath ?? ""}/${section}`.replace(/\/+/g, "/"));
      void render();
    };
    root.querySelectorAll<HTMLButtonElement>("[data-section-target]").forEach((button) => {
      button.addEventListener("click", () => {
        navigateTo(button.dataset.sectionTarget as CompanyOSSection);
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-open-agent-detail]").forEach((button) => {
      button.addEventListener("click", () => {
        const agentId = button.dataset.openAgentDetail;
        if (!agentId) return;
        section = "organization";
        selectedWorkId = null;
        host.onNavigate?.(`${host.basePath ?? ""}/organization`.replace(/\/+/g, "/"));
        void render().then(() => {
          root.querySelector<HTMLButtonElement>('[data-org-tab="agents"]')?.click();
          const dialog = root.querySelector<HTMLDialogElement>(`[data-detail-dialog="agent-${CSS.escape(agentId)}"]`);
          if (dialog && !dialog.open) dialog.showModal();
        });
      });
    });
    root.querySelector<HTMLButtonElement>("[data-demo-trigger-governed]")?.addEventListener("click", () => {
      void runAction(async () => {
        publicDemoSnapshot = await publicDemoClient.action({ action: "TRIGGER_GOVERNED" });
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-demo-decision]").forEach((button) => {
      button.addEventListener("click", () => {
        void runAction(async () => {
          publicDemoSnapshot = await publicDemoClient.action({
            action: "DECIDE",
            decision: button.dataset.demoDecision as "APPROVED" | "REJECTED",
          });
        });
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-demo-renewal-target]").forEach((button) => {
      button.addEventListener("click", () => {
        void runAction(async () => {
          publicDemoSnapshot = await publicDemoClient.action({
            action: "REQUEST_RENEWAL",
            targetType: button.dataset.demoRenewalType as "CREDENTIAL",
            targetId: button.dataset.demoRenewalTarget ?? "",
            reason: locale === "zh-CN" ? "展会演示前完成续期。" : "Renew before the exhibition demo.",
          });
        });
      });
    });
    const companyMenu = root.querySelector<HTMLElement>("[data-company-menu]");
    const companyMenuTrigger = root.querySelector<HTMLButtonElement>("[data-company-menu-trigger]");
    companyMenuTrigger?.addEventListener("click", () => {
      const nextOpen = companyMenu?.hidden ?? false;
      if (companyMenu) companyMenu.hidden = !nextOpen;
      companyMenuTrigger.setAttribute("aria-expanded", String(nextOpen));
      if (nextOpen) companyMenu?.querySelector<HTMLButtonElement>("button")?.focus();
    });
    companyMenu?.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      companyMenu.hidden = true;
      companyMenuTrigger?.setAttribute("aria-expanded", "false");
      companyMenuTrigger?.focus();
    });
    root.querySelectorAll<HTMLButtonElement>("[data-select-company]").forEach((button) => {
      button.addEventListener("click", () => {
        const companyId = button.dataset.selectCompany;
        if (!companyId || companyId === selectedFormalCompanyId) return;
        const nextPath = formalDirectory ? companyWorkspacePath(formalDirectory, companyId) : null;
        if (nextPath) {
          window.location.assign(nextPath);
          return;
        }
        if (host.requestedTenantSlug) {
          renderTenantRouteUnavailable();
          return;
        }
        selectedFormalCompanyId = companyId;
        formalOrganizationMissing = false;
        latestHumanInvite = null;
        latestSecretManagement = null;
        activeAdministrationTab = "connectors";
        selectedWorkId = null;
        section = "office";
        application.selectCompany(companyId);
        window.localStorage.setItem("company-os.selected-company", companyId);
        void render();
      });
    });
    root.querySelector<HTMLButtonElement>("[data-open-company-settings]")?.addEventListener("click", () => navigateTo("settings"));
    root.querySelectorAll<HTMLButtonElement>("[data-open-formal-access]").forEach((button) => {
      button.addEventListener("click", () => {
        formalGateReturn = "local-workspace";
        formalGateVisible = true;
        void application.formalAccess().then((status) => {
          formalAccessStatus = status;
          void render();
        }).catch((error) => renderFailure(error));
      });
    });
    root.querySelector<HTMLButtonElement>("[data-leave-demo-connect-local]")?.addEventListener("click", () => {
      explicitDemo = false;
      publicDemoSnapshot = null;
      onboardingVisible = false;
      section = "connectors";
      void render();
    });
    root.querySelectorAll<HTMLButtonElement>("[data-open-work-detail]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedWorkId = button.dataset.openWorkDetail || state.responsibility.workId;
        void render();
      });
    });
    root.querySelector<HTMLButtonElement>("[data-close-work-detail]")?.addEventListener("click", () => {
      selectedWorkId = null;
      void render();
    });
    root.querySelectorAll<HTMLButtonElement>("[data-inbox-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        const filter = button.dataset.inboxFilter;
        if (filter !== "needs-me" && filter !== "assigned" && filter !== "resolved") return;
        activeInboxFilter = filter;
        void render();
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-work-view]").forEach((button) => {
      button.addEventListener("click", () => {
        activeWorkView = button.dataset.workView === "board" ? "board" : "list";
        storeViewChoice("company-os.work-view", activeWorkView);
        void render();
      });
    });
    root.querySelector<HTMLButtonElement>("[data-work-filter]")?.addEventListener("click", () => {
      activeWorkFilter = activeWorkFilter === "all" ? "active" : activeWorkFilter === "active" ? "resolved" : "all";
      storeViewChoice("company-os.work-filter", activeWorkFilter);
      void render();
    });
    root.querySelector<HTMLButtonElement>("[data-work-sort]")?.addEventListener("click", () => {
      activeWorkSort = activeWorkSort === "newest" ? "oldest" : "newest";
      storeViewChoice("company-os.work-sort", activeWorkSort);
      void render();
    });
    root.querySelector<HTMLInputElement>("[data-work-list-search]")?.addEventListener("input", (event) => {
      const query = (event.currentTarget as HTMLInputElement).value.trim().toLocaleLowerCase("en-US");
      const task = root.querySelector<HTMLElement>("[data-work-search-value]");
      const matches = !query || (task?.dataset.workSearchValue ?? "").includes(query);
      if (task) task.hidden = !matches;
      const empty = root.querySelector<HTMLElement>("[data-work-list-empty]");
      if (empty) empty.hidden = matches;
    });
    const palette = root.querySelector<HTMLDialogElement>("[data-command-palette]");
    const openPalette = (): void => {
      if (palette && !palette.open) palette.showModal();
      requestAnimationFrame(() => palette?.querySelector<HTMLInputElement>("[data-command-input]")?.focus());
    };
    root.querySelector<HTMLButtonElement>("[data-open-command]")?.addEventListener("click", openPalette);
    palette?.querySelector<HTMLButtonElement>("[data-command-close]")?.addEventListener("click", () => palette.close());
    palette?.querySelectorAll<HTMLButtonElement>("[data-command-target]").forEach((button) => {
      button.addEventListener("click", () => navigateTo(button.dataset.commandTarget as CompanyOSSection));
    });
    palette?.querySelector<HTMLInputElement>("[data-command-input]")?.addEventListener("input", (event) => {
      const query = (event.currentTarget as HTMLInputElement).value.trim().toLocaleLowerCase("zh-CN");
      let visible = 0;
      palette.querySelectorAll<HTMLButtonElement>("[data-command-target]").forEach((button) => {
        const matches = !query || (button.textContent ?? "").toLocaleLowerCase("zh-CN").includes(query);
        button.hidden = !matches;
        if (matches) visible += 1;
      });
      const empty = palette.querySelector<HTMLElement>("[data-command-empty]");
      if (empty) empty.hidden = visible !== 0;
    });
    palette?.addEventListener("keydown", (event) => {
      const options = Array.from(palette.querySelectorAll<HTMLButtonElement>("[data-command-target]")).filter((button) => !button.hidden);
      if (!options.length) return;
      if (event.key === "Enter" && (event.target as HTMLElement).matches("[data-command-input]")) {
        event.preventDefault();
        options[0]?.click();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const current = options.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "ArrowDown"
        ? (current + 1) % options.length
        : (current <= 0 ? options.length : current) - 1;
      options[next]?.focus();
    });
    root.querySelector<HTMLButtonElement>("[data-global-reset]")?.addEventListener("click", () => {
      void runAction(async () => {
        if (isDemo && publicDemoSnapshot) {
          publicDemoSnapshot = await publicDemoClient.action({ action: "RESET" });
          return;
        }
        await application.resetFixture();
      });
    });

    root.querySelector<HTMLButtonElement>("[data-onboarding-dismiss]")?.addEventListener("click", () => {
      onboardingVisible = false;
      void render();
    });
    const openDialog = (selector: string): void => {
      const dialog = root.querySelector<HTMLDialogElement>(selector);
      if (dialog && !dialog.open) dialog.showModal();
      requestAnimationFrame(() => dialog?.querySelector<HTMLElement>("input, textarea, select, button")?.focus());
    };
    root.querySelectorAll<HTMLButtonElement>("[data-open-new-task]").forEach((button) => {
      button.addEventListener("click", () => openDialog("[data-new-task-dialog]"));
    });
    const setup = root.querySelector<HTMLDialogElement>("[data-setup-dialog]");
    const setupForm = setup?.querySelector<HTMLFormElement>("[data-setup-form]");
    let setupStep = 1;
    const showSetupStep = (nextStep: number): void => {
      setupStep = Math.min(5, Math.max(1, nextStep));
      setupForm?.setAttribute("data-setup-step", String(setupStep));
      setup?.querySelectorAll<HTMLElement>("[data-setup-step-panel]").forEach((panel) => {
        panel.hidden = Number(panel.dataset.setupStepPanel) !== setupStep;
      });
      setup?.querySelectorAll<HTMLElement>("[data-setup-progress]").forEach((segment) => {
        segment.toggleAttribute("data-complete", Number(segment.dataset.setupProgress) <= setupStep);
      });
      setup?.querySelector<HTMLButtonElement>("[data-setup-back]")?.toggleAttribute("hidden", setupStep === 1);
      setup?.querySelector<HTMLButtonElement>("[data-setup-next]")?.toggleAttribute("hidden", setupStep === 5);
      setup?.querySelector<HTMLButtonElement>("[data-setup-submit]")?.toggleAttribute("hidden", setupStep !== 5);
      if (setupStep === 5 && setupForm && setup) {
        const data = new FormData(setupForm);
        setup.querySelectorAll<HTMLElement>("[data-review]").forEach((value) => {
          value.textContent = String(data.get(value.dataset.review ?? "") ?? "—") || "—";
        });
      }
      setup?.querySelector<HTMLElement>("[data-setup-step-panel]:not([hidden]) input, [data-setup-step-panel]:not([hidden]) textarea")?.focus();
    };
    root.querySelector<HTMLButtonElement>("[data-open-setup]")?.addEventListener("click", () => {
      showSetupStep(1);
      if (setup && !setup.open) setup.showModal();
    });
    setup?.querySelector<HTMLButtonElement>("[data-setup-close]")?.addEventListener("click", () => {
      setup.close();
      if (localSetupRequired) {
        localSetupRequired = false;
        frontDoorVisible = true;
        void render();
      }
    });
    setup?.querySelector<HTMLButtonElement>("[data-setup-back]")?.addEventListener("click", () => showSetupStep(setupStep - 1));
    setup?.querySelector<HTMLButtonElement>("[data-setup-next]")?.addEventListener("click", () => {
      const current = setup?.querySelector<HTMLElement>(`[data-setup-step-panel="${setupStep}"]`);
      const fields = Array.from(current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea") ?? []);
      const valid = fields.every((field) => field.reportValidity());
      if (valid) showSetupStep(setupStep + 1);
    });
    setupForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget as HTMLFormElement);
      const nextOrganization = createOrganizationSetupDraft({
        companyName: String(data.get("companyName") ?? ""),
        companyPurpose: String(data.get("companyPurpose") ?? ""),
        departmentName: String(data.get("departmentName") ?? ""),
        humanName: String(data.get("humanName") ?? ""),
        humanTitle: String(data.get("humanTitle") ?? ""),
        agentName: String(data.get("agentName") ?? ""),
        agentRole: String(data.get("agentRole") ?? ""),
      });
      onboardingVisible = false;
      localSetupRequired = false;
      frontDoorVisible = false;
      explicitDemo = false;
      section = "organization";
      void runAction(() => application.replaceOrganization(nextOrganization));
    });
    if (openSetupAfterRender && setup) {
      openSetupAfterRender = false;
      showSetupStep(1);
      setup.showModal();
    }
    root.querySelector<HTMLButtonElement>("[data-add-human]")?.addEventListener("click", () => openDialog("[data-human-dialog]"));
    root.querySelector<HTMLButtonElement>("[data-add-agent]")?.addEventListener("click", () => openDialog("[data-agent-dialog]"));
    root.querySelector<HTMLButtonElement>("[data-add-department]")?.addEventListener("click", () => {
      const form = root.querySelector<HTMLFormElement>("[data-department-form]");
      form?.reset();
      form?.querySelector<HTMLElement>("[data-department-archive-controls]")?.setAttribute("hidden", "");
      openDialog("[data-department-dialog]");
    });
    root.querySelectorAll<HTMLButtonElement>("[data-edit-department]").forEach((button) => {
      button.addEventListener("click", () => {
        const department = organization.departments.find(({ id }) => id === button.dataset.editDepartment);
        const form = root.querySelector<HTMLFormElement>("[data-department-form]");
        if (!department || !form) return;
        (form.elements.namedItem("departmentId") as HTMLInputElement).value = department.id;
        (form.elements.namedItem("name") as HTMLInputElement).value = department.name;
        (form.elements.namedItem("mandate") as HTMLTextAreaElement).value = department.mandate;
        const destination = form.elements.namedItem("destinationDepartmentId") as HTMLSelectElement | null;
        if (destination) {
          Array.from(destination.options).forEach((option) => { option.disabled = option.value === department.id; });
          destination.value = Array.from(destination.options).find((option) => !option.disabled)?.value ?? "";
        }
        form.querySelector<HTMLElement>("[data-department-archive-controls]")?.removeAttribute("hidden");
        openDialog("[data-department-dialog]");
      });
    });
    root.querySelector<HTMLButtonElement>("[data-archive-department]")?.addEventListener("click", () => {
      const form = root.querySelector<HTMLFormElement>("[data-department-form]");
      if (!form || application.mode !== "FORMAL") return;
      const data = new FormData(form);
      const departmentId = String(data.get("departmentId") ?? "");
      const reason = form.elements.namedItem("archiveReason") as HTMLInputElement | null;
      if (!reason) return;
      reason.setCustomValidity(reason.value.trim() ? "" : copy("Provide a reason before archiving.", "请填写归档原因。"));
      if (!reason.reportValidity()) return;
      void runAction(() => application.archiveDepartment(departmentId, {
        destinationDepartmentId: String(data.get("destinationDepartmentId") ?? ""),
        expectedResponsibilityRevision: assignmentOptions.responsibilities.revision,
        reason: reason.value,
      }));
    });
    root.querySelectorAll<HTMLButtonElement>("[data-org-tab]").forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.orgTab;
        root.querySelectorAll<HTMLButtonElement>("[data-org-tab]").forEach((candidate) => {
          candidate.setAttribute("aria-selected", String(candidate === tab));
        });
        root.querySelectorAll<HTMLElement>("[data-org-panel]").forEach((panel) => {
          panel.hidden = panel.dataset.orgPanel !== target;
        });
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-task-tab]").forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.taskTab;
        root.querySelectorAll<HTMLButtonElement>("[data-task-tab]").forEach((candidate) => {
          candidate.setAttribute("aria-selected", String(candidate === tab));
        });
        root.querySelectorAll<HTMLElement>("[data-task-panel]").forEach((panel) => {
          panel.hidden = panel.dataset.taskPanel !== target;
        });
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-admin-tab]").forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab.dataset.adminTab === activeAdministrationTab));
      tab.addEventListener("click", () => {
        const target = tab.dataset.adminTab;
        if (target) activeAdministrationTab = target;
        root.querySelectorAll<HTMLButtonElement>("[data-admin-tab]").forEach((candidate) => {
          candidate.setAttribute("aria-selected", String(candidate === tab));
        });
        root.querySelectorAll<HTMLElement>("[data-admin-panel]").forEach((panel) => {
          panel.hidden = panel.dataset.adminPanel !== target;
        });
      });
    });
    root.querySelectorAll<HTMLElement>("[data-admin-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.adminPanel !== activeAdministrationTab;
    });
    root.querySelector<HTMLFormElement>("[data-register-connector-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (application.mode !== "FORMAL" || !administration) return;
      const data = new FormData(event.currentTarget as HTMLFormElement);
      void runAction(() => application.registerConnectorRuntime({
        connectorId: String(data.get("connectorId") ?? ""),
        executionResidency: String(data.get("executionResidency")) as "MANAGED_CLOUD" | "CUSTOMER_ENVIRONMENT",
        expectedRevision: administration.connectorCatalog.revision,
      }));
    });
    root.querySelectorAll<HTMLButtonElement>("[data-connector-status]").forEach((button) => {
      button.addEventListener("click", () => {
        if (application.mode !== "FORMAL" || !administration || !button.dataset.connectorId) return;
        void runAction(() => application.setConnectorStatus(button.dataset.connectorId as string, {
          status: button.dataset.connectorStatus as "ENABLED" | "DISABLED",
          expectedRevision: administration.connectorCatalog.revision,
        }));
      });
    });
    root.querySelector<HTMLFormElement>("[data-data-authorization-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (application.mode !== "FORMAL" || !administration) return;
      const data = new FormData(event.currentTarget as HTMLFormElement);
      const destinations = String(data.get("destinations") ?? "").split(",")
        .map((value) => value.trim()).filter(Boolean);
      const date = new Date(String(data.get("validUntil") ?? ""));
      void runAction(() => application.createDataAuthorizationContract({
        id: String(data.get("id") ?? ""),
        dataSourceId: String(data.get("dataSourceId") ?? ""),
        authorizedAgentIds: [String(data.get("agentId") ?? "")],
        authorizedOperations: [String(data.get("operation")) as "READ" | "WRITE" | "EXPORT"],
        allowedPurposes: [String(data.get("purpose") ?? "")],
        maximumClassification: String(data.get("maximumClassification")) as "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED",
        allowedExportDestinations: destinations,
        validUntil: date.toISOString(),
        expectedRevision: administration.governance.revision,
      }));
    });
    root.querySelectorAll<HTMLButtonElement>("[data-data-contract-status]").forEach((button) => {
      button.addEventListener("click", () => {
        if (application.mode !== "FORMAL" || !administration || !button.dataset.dataContractId) return;
        void runAction(() => application.setDataAuthorizationStatus(button.dataset.dataContractId as string, {
          status: button.dataset.dataContractStatus as "ACTIVE" | "SUSPENDED" | "REVOKED",
          expectedRevision: administration.governance.revision,
        }));
      });
    });
    root.querySelector<HTMLFormElement>("[data-model-route-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (application.mode !== "FORMAL" || !administration) return;
      const data = new FormData(event.currentTarget as HTMLFormElement);
      const [providerAdapterId = "", modelReference = ""] = String(data.get("providerModel") ?? "").split("|");
      void runAction(() => application.createModelRoute({
        policyId: String(data.get("policyId") ?? ""), routeId: String(data.get("routeId") ?? ""),
        providerAdapterId, modelReference,
        credentialReference: String(data.get("credentialReference") ?? ""),
        allowedDataClassifications: [String(data.get("classification")) as "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED"],
        residency: String(data.get("residency")) as "MANAGED_CLOUD" | "LOCAL",
        expectedRevision: administration.governance.revision,
      }));
    });
    root.querySelectorAll<HTMLButtonElement>("[data-model-route-enabled]").forEach((button) => {
      button.addEventListener("click", () => {
        if (application.mode !== "FORMAL" || !administration || !button.dataset.modelRouteId) return;
        void runAction(() => application.setModelRouteEnabled(button.dataset.modelRouteId as string, {
          enabled: button.dataset.modelRouteEnabled === "true",
          expectedRevision: administration.governance.revision,
        }));
      });
    });
    root.querySelector<HTMLFormElement>("[data-secret-management-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (application.mode !== "FORMAL") return;
      const data = new FormData(event.currentTarget as HTMLFormElement);
      const operation = String(data.get("operation")) as "CREATE" | "ROTATE" | "SUSPEND" | "REVOKE";
      void runAction(async () => {
        const session = await application.beginSecretReferenceManagement({
          referenceId: String(data.get("referenceId") ?? ""), operation,
          purpose: String(data.get("purpose")) as "MODEL_PROVIDER" | "DATA_CONNECTOR" | "AGENT_CONNECTOR" | "IDENTITY_ADAPTER",
          providerAdapterId: String(data.get("providerAdapterId") ?? ""),
          expectedVersion: operation === "CREATE" ? null : Number(data.get("expectedVersion")),
        });
        latestSecretManagement = { session, result: null };
      });
    });
    root.querySelector<HTMLButtonElement>("[data-check-secret-session]")?.addEventListener("click", (event) => {
      const sessionId = (event.currentTarget as HTMLButtonElement).dataset.checkSecretSession;
      if (!sessionId || !latestSecretManagement) return;
      void runAction(async () => {
        latestSecretManagement = { ...latestSecretManagement!,
          result: await application.confirmSecretReferenceManagement(sessionId) };
      });
    });
    root.querySelector<HTMLFormElement>("[data-tool-profile-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (application.mode !== "FORMAL" || !administration) return;
      const data = new FormData(event.currentTarget as HTMLFormElement);
      const profileId = String(data.get("profileId") ?? "");
      const description = String(data.get("description") ?? "").trim();
      void runAction(() => application.createToolProfile({
        profileId, profileKey: String(data.get("profileKey") ?? ""),
        name: String(data.get("name") ?? ""), description: description || null,
        defaultAction: String(data.get("defaultAction")) as "deny" | "allow",
        entries: [{
          id: `${profileId}-entry-1`,
          selectorType: String(data.get("selectorType")) as "application" | "connection" | "catalog_entry" | "tool_name" | "risk_level",
          selectorValue: String(data.get("selectorValue") ?? ""),
          effect: String(data.get("effect")) as "include" | "exclude",
        }],
        expectedRevision: administration.toolAccess.revision,
      }));
    });
    root.querySelector<HTMLFormElement>("[data-tool-binding-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (application.mode !== "FORMAL" || !administration) return;
      const data = new FormData(event.currentTarget as HTMLFormElement);
      const [targetType = "", targetId = ""] = String(data.get("target") ?? "").split("|");
      void runAction(() => application.bindToolProfile(String(data.get("profileId") ?? ""), {
        bindingId: String(data.get("bindingId") ?? ""),
        targetType: targetType as "company" | "agent" | "project", targetId,
        priority: Number(data.get("priority")), expectedRevision: administration.toolAccess.revision,
      }));
    });
    root.querySelector<HTMLFormElement>("[data-tool-policy-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (application.mode !== "FORMAL" || !administration) return;
      const data = new FormData(event.currentTarget as HTMLFormElement);
      const selectorKey = String(data.get("selectorKey") ?? "") as "agentId" | "projectId" | "applicationId" | "connectionId" | "catalogEntryId" | "toolName" | "riskLevel";
      const description = String(data.get("description") ?? "").trim();
      void runAction(() => application.createToolPolicy({
        policy: {
          id: String(data.get("policyId") ?? ""), name: String(data.get("name") ?? ""),
          description: description || null,
          policyType: String(data.get("policyType")) as "allow" | "block" | "require_approval",
          priority: Number(data.get("priority")), selectors: { [selectorKey]: String(data.get("selectorValue") ?? "") },
        }, expectedRevision: administration.toolAccess.revision,
      }));
    });
    root.querySelectorAll<HTMLButtonElement>("[data-tool-profile-status]").forEach((button) => {
      button.addEventListener("click", () => {
        if (application.mode !== "FORMAL" || !administration || !button.dataset.toolProfileId) return;
        void runAction(() => application.setToolProfileStatus(button.dataset.toolProfileId as string, {
          status: button.dataset.toolProfileStatus as "draft" | "active" | "disabled" | "archived",
          expectedRevision: administration.toolAccess.revision,
        }));
      });
    });
    root.querySelector<HTMLFormElement>("[data-budget-policy-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (application.mode !== "FORMAL" || !administration?.usageBudget) return;
      const data = new FormData(event.currentTarget as HTMLFormElement);
      const [scopeType = "", scopeId = ""] = String(data.get("scope") ?? "").split("|");
      const dollars = Number(data.get("amount"));
      void runAction(() => application.upsertBudgetPolicy({
        policyId: String(data.get("policyId") ?? ""), scopeType: scopeType as "company" | "agent" | "project",
        scopeId, metric: "billed_cents",
        windowKind: String(data.get("windowKind")) as "calendar_month_utc" | "lifetime",
        amount: Math.round(dollars * 100), warnPercent: Number(data.get("warnPercent")),
        hardStopEnabled: data.get("hardStopEnabled") === "on", notifyEnabled: true, isActive: true,
        expectedRevision: administration.usageBudget.ledger.revision,
      }));
    });
    root.querySelector<HTMLFormElement>("[data-company-profile-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget as HTMLFormElement);
      void runAction(async () => {
        await application.updateCompanyProfile({
          expected: { name: organization.company.name, purpose: organization.company.purpose,
            locale: organization.company.locale },
          next: { name: String(data.get("name") ?? ""), purpose: String(data.get("purpose") ?? ""),
            locale: String(data.get("locale") ?? "") },
        });
        if (application.mode === "FORMAL") formalDirectory = null;
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-settings-tab]").forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.settingsTab;
        root.querySelectorAll<HTMLButtonElement>("[data-settings-tab]").forEach((candidate) => {
          candidate.setAttribute("aria-selected", String(candidate === tab));
          candidate.tabIndex = candidate === tab ? 0 : -1;
        });
        root.querySelectorAll<HTMLElement>("[data-settings-panel]").forEach((panel) => {
          panel.hidden = panel.dataset.settingsPanel !== target;
        });
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-locale]").forEach((button) => {
      button.addEventListener("click", () => {
        const locale = button.dataset.locale as CompanyOSLocale;
        if (locale !== "en" && locale !== "zh-CN") return;
        setActiveLocale(locale, window.localStorage);
        root.lang = locale;
        void render();
      });
    });
    root.querySelector<HTMLButtonElement>("[data-sign-out]")?.addEventListener("click", () => {
      if (application.mode !== "FORMAL") return;
      void runAction(async () => {
        await application.signOut();
        formalAccessStatus = null;
        formalDirectory = null;
        selectedFormalCompanyId = null;
        formalGateVisible = false;
        formalSignInAttempted = true;
        window.localStorage.removeItem("company-os.selected-company");
      });
    });
    root.querySelectorAll<HTMLFormElement>("[data-member-form]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (application.mode !== "FORMAL" || !form.dataset.memberId) return;
        const data = new FormData(form);
        void runAction(() => application.updateHumanMember(form.dataset.memberId as string, {
          expectedRole: String(data.get("expectedRole")) as "owner" | "admin" | "operator" | "viewer",
          expectedStatus: String(data.get("expectedStatus")) as "pending" | "active" | "suspended" | "archived",
          role: String(data.get("role")) as "owner" | "admin" | "operator" | "viewer",
          status: String(data.get("status")) as "active" | "suspended",
        }));
      });
    });
    root.querySelector<HTMLButtonElement>("[data-export-company]")?.addEventListener("click", () => {
      if (application.mode !== "FORMAL" && (application.mode !== "DEMO_FIXTURE" || explicitDemo)) return;
      void runAction(async () => {
        const source = await application.exportCompany();
        const url = URL.createObjectURL(new Blob([source], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `company-os-backup-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
      });
    });
    root.querySelector<HTMLButtonElement>("[data-export-accountability]")?.addEventListener("click", () => {
      if (application.mode !== "FORMAL") return;
      void runAction(async () => {
        const source = await application.exportAccountability({
          requestId: `audit-${crypto.randomUUID()}`,
          purposeCode: "AUDIT_REVIEW",
        });
        const url = URL.createObjectURL(new Blob([source], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `company-os-accountability-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
      });
    });
    const importFile = root.querySelector<HTMLInputElement>("[data-import-company-file]");
    root.querySelector<HTMLButtonElement>("[data-import-company]")?.addEventListener("click", () => {
      if (application.mode === "FORMAL") importFile?.click();
    });
    importFile?.addEventListener("change", () => {
      const file = importFile.files?.[0];
      if (!file || application.mode !== "FORMAL") return;
      void runAction(async () => {
        await restoreCompanySource(await file.text());
      });
    });
    root.querySelector<HTMLFormElement>("[data-archive-company-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (application.mode !== "FORMAL") return;
      const form = event.currentTarget as HTMLFormElement;
      const data = new FormData(form);
      const file = data.get("backup");
      const confirmation = String(data.get("confirmation") ?? "");
      const reason = String(data.get("reason") ?? "").trim();
      void runAction(async () => {
        if (!(file instanceof File) || confirmation !== organization.company.name || !reason) {
          throw new Error("COMPANY_ARCHIVE_CONFIRMATION_INVALID");
        }
        let backup: unknown;
        try { backup = JSON.parse(await file.text()); } catch { throw new Error("DURABLE_BACKUP_INVALID"); }
        const digest = backup && typeof backup === "object" && !Array.isArray(backup)
          ? (backup as { digest?: unknown }).digest : null;
        if (typeof digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(digest)) {
          throw new Error("DURABLE_BACKUP_INVALID");
        }
        const retentionPolicyId = administration?.retentionPolicyId;
        if (!retentionPolicyId) throw new Error("RETENTION_POLICY_NOT_CONFIGURED");
        await application.archiveCompany({ exportDigest: digest,
          retentionPolicyId, reason });
        selectedFormalCompanyId = null;
        formalDirectory = await application.companies();
        window.localStorage.removeItem("company-os.selected-company");
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-account-tab]").forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.accountTab;
        root.querySelectorAll<HTMLButtonElement>("[data-account-tab]").forEach((candidate) => {
          candidate.setAttribute("aria-selected", String(candidate === tab));
        });
        root.querySelectorAll<HTMLElement>("[data-account-panel]").forEach((panel) => {
          panel.hidden = panel.dataset.accountPanel !== target;
        });
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-colleague-detail]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.colleagueDetail;
        const dialog = root.querySelector<HTMLDialogElement>(`[data-detail-dialog="${id}"]`);
        if (dialog && !dialog.open) dialog.showModal();
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-detail-close]").forEach((button) => {
      button.addEventListener("click", () => button.closest<HTMLDialogElement>("dialog")?.close());
    });
    root.querySelectorAll<HTMLButtonElement>("[data-editor-close]").forEach((button) => {
      button.addEventListener("click", () => button.closest<HTMLDialogElement>("dialog")?.close());
    });
    root.querySelectorAll<HTMLButtonElement>("[data-agent-lifecycle-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const agentId = button.dataset.agentId;
        const operation = button.dataset.agentLifecycleAction as
          | "APPROVE" | "PAUSE" | "RESUME" | "CLEAR_ERROR" | "TERMINATE" | undefined;
        if (!agentId || !operation || application.mode !== "FORMAL") return;
        void runAction(async () => {
          const latest = await application.assignmentOptions();
          await application.transitionAgentLifecycle(agentId, {
            operation,
            expectedRevision: latest.lifecycle.revision,
            ...(operation === "PAUSE" ? { pauseReason: "manual" as const } : {}),
          });
        });
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-responsibility-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const agentId = button.dataset.agentId;
        if (!agentId || application.mode !== "FORMAL") return;
        void runAction(async () => {
          const latest = await application.assignmentOptions();
          const contracts = latest.responsibilities.contracts.map((contract) =>
            contract.agentId === agentId && contract.status === "DRAFT"
              ? { ...contract, status: "ACTIVE" as const }
              : contract);
          await application.replaceResponsibilityContracts({
            expectedRevision: latest.responsibilities.revision,
            contracts,
          });
        });
      });
    });
    root.querySelectorAll<HTMLFormElement>("[data-responsibility-policy-form]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const agentId = form.dataset.agentId;
        if (!agentId || application.mode !== "FORMAL") return;
        const data = new FormData(form);
        const allowedActions: ActionId[] = [];
        const approvalRequiredActions: ActionId[] = [];
        for (const action of ACTION_CATALOG) {
          const mode = String(data.get(`action:${action.id}`) ?? "blocked");
          if (mode !== "blocked" && mode !== "allowed" && mode !== "approval") return;
          if (mode !== "blocked") allowedActions.push(action.id);
          if (mode === "approval") approvalRequiredActions.push(action.id);
        }
        void runAction(async () => {
          const latest = await application.assignmentOptions();
          const contracts = latest.responsibilities.contracts.map((contract) =>
            contract.agentId === agentId ? { ...contract, allowedActions, approvalRequiredActions } : contract);
          await application.replaceResponsibilityContracts({
            expectedRevision: latest.responsibilities.revision,
            contracts,
          });
        });
      });
    });
    root.querySelectorAll<HTMLFormElement>("[data-responsibility-transfer-form]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const agentId = form.dataset.agentId;
        if (!agentId || application.mode !== "FORMAL") return;
        const data = new FormData(form);
        const backup = String(data.get("newBackupHumanId") ?? "");
        void runAction(() => application.transferResponsibility(agentId, {
          newAccountableHumanId: String(data.get("newAccountableHumanId") ?? ""),
          newBackupHumanId: backup || null,
          expectedResponsibilityRevision: assignmentOptions.responsibilities.revision,
          reason: String(data.get("reason") ?? ""),
        }));
      });
    });
    root.querySelector<HTMLFormElement>("[data-goal-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (application.mode !== "FORMAL" && (application.mode !== "DEMO_FIXTURE" || explicitDemo)) return;
      const data = new FormData(event.currentTarget as HTMLFormElement);
      void runAction(() => application.createGoal({
        title: String(data.get("title") ?? ""), description: null,
        level: String(data.get("level") ?? "task") as "company" | "team" | "agent" | "task",
        parentId: null, ownerAgentId: null,
        accountableHumanId: String(data.get("accountableHumanId") ?? ""),
        expectedRevision: planning.revision,
      }));
    });
    root.querySelector<HTMLFormElement>("[data-project-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (application.mode !== "FORMAL" && (application.mode !== "DEMO_FIXTURE" || explicitDemo)) return;
      const data = new FormData(event.currentTarget as HTMLFormElement);
      void runAction(() => application.createProject({
        goalIds: [], name: String(data.get("name") ?? ""), description: null,
        leadAgentId: null, accountableHumanId: String(data.get("accountableHumanId") ?? ""),
        departmentIds: [String(data.get("departmentId") ?? "")], targetDate: null,
        expectedRevision: planning.revision,
      }));
    });
    root.querySelectorAll<HTMLButtonElement>("[data-goal-status]").forEach((button) => {
      button.addEventListener("click", () => {
        const goal = planning.goals.find(({ id }) => id === button.dataset.goalId);
        if (!goal || !button.dataset.goalStatus) return;
        void runAction(() => application.updateGoal(goal.id, {
          title: goal.title, description: goal.description, level: goal.level,
          status: button.dataset.goalStatus as "planned" | "active" | "achieved" | "cancelled",
          parentId: goal.parentId, ownerAgentId: goal.ownerAgentId,
          accountableHumanId: goal.accountableHumanId, expectedRevision: planning.revision,
        }));
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-project-status]").forEach((button) => {
      button.addEventListener("click", () => {
        const project = planning.projects.find(({ id }) => id === button.dataset.projectId);
        if (!project || !button.dataset.projectStatus) return;
        void runAction(() => application.updateProject(project.id, {
          goalIds: project.goalIds, name: project.name, description: project.description,
          status: button.dataset.projectStatus as "backlog" | "planned" | "in_progress" | "completed" | "cancelled",
          leadAgentId: project.leadAgentId, accountableHumanId: project.accountableHumanId,
          departmentIds: project.departmentIds, targetDate: project.targetDate,
          expectedRevision: planning.revision,
        }));
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-project-archive]").forEach((button) => {
      button.addEventListener("click", () => {
        const projectId = button.dataset.projectArchive;
        if (!projectId) return;
        void runAction(() => application.archiveProject(projectId, planning.revision));
      });
    });
    root.querySelector<HTMLFormElement>("[data-department-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget as HTMLFormElement);
      const departmentId = String(data.get("departmentId") ?? "");
      void runAction(() => application.replaceOrganization(upsertDepartment(organization, {
        ...(departmentId ? { departmentId } : {}),
        name: String(data.get("name") ?? ""),
        mandate: String(data.get("mandate") ?? ""),
      })));
    });
    root.querySelectorAll<HTMLFormElement>("[data-human-profile-form]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        void runAction(() => application.replaceOrganization(updateHumanProfile(organization, {
          humanId: String(data.get("humanId") ?? ""),
          name: String(data.get("name") ?? ""),
          title: String(data.get("title") ?? ""),
          departmentId: String(data.get("departmentId") ?? ""),
        })));
      });
    });
    root.querySelectorAll<HTMLFormElement>("[data-agent-profile-form]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        void runAction(() => application.replaceOrganization(updateAgentProfile(organization, {
          agentId: String(data.get("agentId") ?? ""),
          name: String(data.get("name") ?? ""),
          role: String(data.get("role") ?? ""),
          departmentId: String(data.get("departmentId") ?? ""),
        })));
      });
    });
    root.querySelectorAll<HTMLFormElement>("[data-agent-runtime-binding-form]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (application.mode !== "FORMAL") return;
        const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
        const operation = submitter?.value === "UNBIND" ? "UNBIND" as const : "BIND" as const;
        const data = new FormData(form);
        const agentId = form.dataset.agentId;
        if (!agentId) return;
        void runAction(() => application.changeAgentRuntimeBinding(agentId, {
          operation,
          connectorId: operation === "BIND" ? String(data.get("connectorId") ?? "") : null,
          expectedRevision: Number(data.get("expectedRevision") ?? 0),
          reason: String(data.get("reason") ?? ""),
        }));
      });
    });
    root.querySelector<HTMLFormElement>("[data-human-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget as HTMLFormElement);
      if (application.mode === "FORMAL") {
        void runAction(async () => {
          latestHumanInvite = await application.inviteHuman({
            email: String(data.get("email") ?? ""),
            title: String(data.get("title") ?? ""),
            departmentId: String(data.get("departmentId") ?? ""),
            role: String(data.get("role") ?? "operator") as "owner" | "admin" | "operator" | "viewer",
          });
        });
        return;
      }
      void runAction(() => application.replaceOrganization(addHumanColleague(organization, {
        name: String(data.get("name") ?? ""),
        title: String(data.get("title") ?? ""),
        departmentId: String(data.get("departmentId") ?? ""),
      })));
    });
    root.querySelector<HTMLFormElement>("[data-agent-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget as HTMLFormElement);
      void runAction(() => application.replaceOrganization(addAgentColleague(organization, {
        name: String(data.get("name") ?? ""),
        role: String(data.get("role") ?? ""),
        departmentId: String(data.get("departmentId") ?? ""),
        accountableHumanId: String(data.get("accountableHumanId") ?? ""),
        runtimeConnectorId: String(data.get("runtimeConnectorId") ?? "connector-unbound"),
        autonomyLevel: Number(data.get("autonomyLevel") ?? 2),
      })));
    });
    root.querySelector<HTMLFormElement>("[data-new-task-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget as HTMLFormElement);
      const modelRoutingValue = String(data.get("modelRouting") ?? "");
      const [modelCompanyId, modelPolicyId, modelClassification, modelResidency] = modelRoutingValue.split("|");
      const assignment = createFormalAssignment(assignmentOptions, {
        title: String(data.get("title") ?? ""),
        goal: String(data.get("goal") ?? ""),
        agentId: String(data.get("agentId") ?? ""),
        ...(String(data.get("dataContractId") ?? "") ? { dataAccess: {
          contractId: String(data.get("dataContractId") ?? ""),
          operation: String(data.get("dataOperation") ?? "READ") as "READ" | "WRITE" | "EXPORT",
          purpose: String(data.get("dataPurpose") ?? ""),
          classification: String(data.get("dataClassification") ?? "PUBLIC") as "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED",
          destinationId: String(data.get("dataDestinationId") ?? ""),
          contentDigest: String(data.get("dataContentDigest") ?? ""),
        } } : {}),
        ...(modelRoutingValue ? { modelRouting: {
          companyId: modelCompanyId ?? "", policyId: modelPolicyId ?? "",
          classification: modelClassification as "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED",
          requiredResidency: modelResidency as "MANAGED_CLOUD" | "LOCAL",
        } } : {}),
      }, administration?.governance.dataAuthorizationContracts ?? [],
      administration?.governance.modelRoutingPolicies ?? []);
      section = "work";
      selectedWorkId = null;
      void runAction(() => application.assignWork(assignment));
    });

    const workforceGraph = root.querySelector<HTMLElement>("[data-workforce-graph]");
    if (workforceGraph) {
      const { mountWorkforceGraph } = await import("./workforce-graph/mount-workforce-graph.tsx");
      if (disposed || !workforceGraph.isConnected) return;
      unmountWorkforceGraph = mountWorkforceGraph(workforceGraph, organization, state);
    }

    const actions = root.querySelector<HTMLElement>("[data-task-actions]");
    if (actions && application.mode === "DEMO_FIXTURE") {
      if (state.phase === "READY") {
        actions.append(createButton({ label: t("action.assign"), tone: "primary", onClick: () => void runAction(() => application.assignWork()) }));
      } else if (["PLANNING", "SIMULATING_TOOL_ACTIVITY"].includes(state.phase)) {
        actions.append(createButton({ label: t("action.advance"), tone: "primary", onClick: () => void runAction(() => application.advanceWork()) }));
      } else if (state.phase === "AWAITING_APPROVAL") {
        actions.append(
          createButton({ label: t("action.approve"), tone: "primary", onClick: () => void runAction(() => application.decideApproval("APPROVED")) }),
          createButton({ label: t("action.reject"), tone: "danger", onClick: () => void runAction(() => application.decideApproval("REJECTED")) }),
        );
      }
    } else if (actions && state.phase === "READY") {
      if (!assignmentOptions.agents.length) {
        actions.innerHTML = `<p class="empty-copy" role="status">No Agent has both an active responsibility contract and executable capabilities.</p>`;
      } else {
        const quickModelChoices = new Map<string, string>();
        for (const policy of administration?.governance.modelRoutingPolicies ?? []) {
          for (const route of policy.routes) {
            if (!route.enabled || !route.credentialConfigured) continue;
            for (const classification of route.allowedDataClassifications) {
              const value = [policy.companyId, policy.id, classification, route.residency].join("|");
              if (!quickModelChoices.has(value)) quickModelChoices.set(value,
                `${route.modelReference} · ${classification} · ${route.residency}`);
            }
          }
        }
        const quickModelOptions = [...quickModelChoices].map(([value, label]) =>
          `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
        actions.innerHTML = `<form class="formal-work-form" data-formal-work-form>
          <label class="family-field">Task title<input class="family-control" name="title" required maxlength="120" autocomplete="off"></label>
          <label class="family-field">Goal<textarea class="family-control" name="goal" required maxlength="1000" rows="2"></textarea></label>
          <label class="family-field">Executing Agent<select class="family-control" name="agentId">${assignmentOptions.agents.map((agent) => `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name)}</option>`).join("")}</select></label>
          ${quickModelOptions ? `<label class="family-field">Model route<select class="family-control" name="modelRouting"><option value="">Connector-managed / no Company OS model grant</option>${quickModelOptions}</select></label>` : ""}
          <button class="family-button family-button--primary cos-button cos-button--primary" type="submit">Assign formal task</button>
        </form>`;
        actions.querySelector<HTMLFormElement>("[data-formal-work-form]")?.addEventListener("submit", (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget as HTMLFormElement);
          const modelRoutingValue = String(data.get("modelRouting") ?? "");
          const [modelCompanyId, modelPolicyId, modelClassification, modelResidency] = modelRoutingValue.split("|");
          void runAction(() => application.assignWork(createFormalAssignment(assignmentOptions, {
            title: String(data.get("title") ?? ""),
            goal: String(data.get("goal") ?? ""),
            agentId: String(data.get("agentId") ?? ""),
            ...(modelRoutingValue ? { modelRouting: {
              companyId: modelCompanyId ?? "", policyId: modelPolicyId ?? "",
              classification: modelClassification as "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED",
              requiredResidency: modelResidency as "MANAGED_CLOUD" | "LOCAL",
            } } : {}),
          }, [], administration?.governance.modelRoutingPolicies ?? [])));
        });
      }
    } else if (actions && state.phase === "AWAITING_APPROVAL") {
      actions.append(
        createButton({ label: t("action.approve"), tone: "primary", onClick: () => void runAction(() => application.decideApproval("APPROVED")) }),
        createButton({ label: t("action.reject"), tone: "danger", onClick: () => void runAction(() => application.decideApproval("REJECTED")) }),
      );
    }
    if (actions && application.mode === "FORMAL" && selectedCatalogItem) {
      const attempt = selectedCatalogItem.attempts.at(-1);
      if (attempt?.status === "QUEUED" && attempt.preparationStatus === "PENDING") {
        actions.insertAdjacentHTML("beforeend", `<p class="empty-copy" role="status">${copy(
          "Execution preparation was interrupted before the Connector received this task. The original initiator must reauthorize data and Broker access.",
          "执行准备在任务提交给 Connector 前中断。需要由原任务发起人重新授权数据与 Broker 访问。",
        )}</p>`);
        actions.append(createButton({ label: copy("Resume execution preparation", "恢复执行准备"), tone: "primary",
          onClick: () => void runAction(() => application.retryWorkExecutionPreparation(
            selectedCatalogItem.work.id, attempt.id,
          )) }));
      }
      if (attempt && ["QUEUED", "LEASED", "RUNNING"].includes(attempt.status)) {
        actions.append(createButton({
          label: copy("Request cancellation", "请求取消"),
          tone: "danger",
          onClick: () => void runAction(() => application.requestWorkCancellation(
            selectedCatalogItem.work.id, attempt.id,
          )),
        }));
      } else if (attempt?.status === "CANCELLATION_REQUESTED") {
        actions.insertAdjacentHTML("beforeend", `<p class="empty-copy" role="status">${copy(
          "Cancellation sent; waiting for Connector confirmation.",
          "取消请求已发送，正在等待 Connector 确认。",
        )}</p>`);
      } else if (attempt?.status === "OUTCOME_UNKNOWN") {
        actions.insertAdjacentHTML("beforeend", `<form class="formal-work-form" data-reconciliation-form>
          <p class="empty-copy" role="status">${copy("The external outcome is unknown. Resolve it only with admitted evidence.", "外部执行结果未知。请仅使用已接纳的证据进行核对。")}</p>
          <label class="family-field">${copy("Resolution", "核对结论")}<select class="family-control" name="resolution"><option value="CONFIRMED_SUCCEEDED">${copy("Confirmed succeeded", "确认成功")}</option><option value="CONFIRMED_FAILED">${copy("Confirmed failed", "确认失败")}</option><option value="SAFE_TO_RETRY">${copy("Evidence proves safe to retry", "证据确认可安全重试")}</option></select></label>
          <label class="family-field">${copy("Admitted evidence ID", "已接纳证据 ID")}<input class="family-control" name="evidenceId" required pattern="[a-z0-9][a-z0-9-]{0,63}"></label>
          <button class="family-button family-button--primary" type="submit">${copy("Record reconciliation", "记录核对结论")}</button>
        </form>`);
        actions.querySelector<HTMLFormElement>("[data-reconciliation-form]")?.addEventListener("submit", (event) => {
          event.preventDefault(); const data = new FormData(event.currentTarget as HTMLFormElement);
          void runAction(() => application.reconcileWorkAttempt(selectedCatalogItem.work.id, attempt.id, {
            resolution: String(data.get("resolution")) as "CONFIRMED_SUCCEEDED" | "CONFIRMED_FAILED" | "SAFE_TO_RETRY",
            evidenceId: String(data.get("evidenceId") ?? ""),
          }));
        });
      } else if (attempt?.status === "FAILED" && attempt.reconciliation?.resolution === "SAFE_TO_RETRY") {
        actions.append(createButton({ label: copy("Retry with current authority", "按当前授权重试"), tone: "primary",
          onClick: () => void runAction(() => application.retryWorkAttempt(selectedCatalogItem.work.id, attempt.id)) }));
      }
    }
  }

  void render();
  return {
    unmount() {
      disposed = true;
      unmountWorkforceGraph?.();
      document.removeEventListener("keydown", handleGlobalKeydown);
      host.mountElement.replaceChildren();
    },
  };
}
