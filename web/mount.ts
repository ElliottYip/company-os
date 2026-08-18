import type { CompanyWorkState } from "../application/company-operations.ts";
import { compileOfficeScene } from "../core/office.ts";
import {
  createDemoApplicationClient,
  type CompanyOSApplicationClient,
} from "./application-client.ts";
import { createButton } from "./components/button.ts";
import { t } from "./i18n/zh-CN.ts";
import { OfficeDomRenderer } from "./office-dom-renderer.ts";

export type CompanyOSSection = "office" | "work" | "responsibility" | "connectors";

export interface CompanyOSHostContract {
  readonly mountElement: HTMLElement;
  readonly basePath?: string;
  readonly initialSection?: CompanyOSSection;
  readonly onNavigate?: (path: string) => void;
}

export interface MountedCompanyOS { unmount(): void; }

const SECTIONS: readonly { readonly id: CompanyOSSection; readonly label: string }[] = [
  { id: "office", label: t("nav.office") },
  { id: "work", label: t("nav.workApprovals") },
  { id: "responsibility", label: t("nav.responsibility") },
  { id: "connectors", label: t("nav.connectors") },
];

function statusCopy(state: CompanyWorkState): string {
  const copy: Record<CompanyWorkState["phase"], string> = {
    READY: "等待分配", PLANNING: "正在规划", SIMULATING_TOOL_ACTIVITY: "模拟执行",
    AWAITING_APPROVAL: "等待真人审批", COMPLETED: "已完成", REJECTED: "已拒绝",
  };
  return copy[state.phase];
}

function eventKind(type: string): string {
  const kinds: Readonly<Record<string, string>> = {
    "work.assigned": "目标与责任已绑定", "plan.recorded": "计划证据",
    "tool.activity.recorded": "模拟工具活动", "approval.requested": "高风险动作暂停",
    "approval.decided": "真人决定", "evidence.recorded": "结果证据", "work.completed": "结果已记录",
  };
  return kinds[type] ?? type;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ?? character);
}

function responsibilityChain(state: CompanyWorkState): string {
  return `<ol class="chain-list" data-testid="responsibility-chain">
    <li><span>${t("responsibility.initiator")}</span><strong>林澄 · Agent Boss</strong></li>
    <li><span>${t("responsibility.executor")}</span><strong>市场研究员（模拟）</strong></li>
    <li><span>${t("responsibility.permissionsData")}</span><strong>${state.responsibility.permissionIds.length} 项权限 · ${state.responsibility.dataAuthorizationIds.length} 份数据合同</strong></li>
    <li><span>${t("responsibility.approval")}</span><strong>${state.responsibility.approvalIds.length ? "林澄 · 已精确绑定" : "尚未触发"}</strong></li>
    <li><span>${t("responsibility.evidenceResult")}</span><strong>${state.responsibility.evidenceIds.length} 份证据 · ${state.responsibility.resultId ? "结果已记录" : "结果待形成"}</strong></li>
  </ol>`;
}

function eventFeed(state: CompanyWorkState, expanded = false): string {
  const events = state.events.length ? state.events.map((event) => `<article class="event-row" data-event-code="${escapeHtml(event.type)}">
    <time>${event.occurredAt.slice(11, 19)}</time><div><strong>${escapeHtml(eventKind(event.type))}</strong><p>${escapeHtml(event.summary)}</p></div><span>FIXTURE</span>
  </article>`).join("") : `<p class="empty-copy">${t("events.empty")}</p>`;
  return `<section class="event-feed${expanded ? " event-feed--expanded" : ""}" aria-live="polite"><h3>${t("events.title")}</h3>${events}</section>`;
}

function officeView(state: CompanyWorkState): string {
  return `<section class="office-stage" aria-labelledby="office-title" data-section="office">
    <div class="stage-heading"><div><p class="eyebrow">OFFICE PULSE</p><h2 id="office-title">${t("office.title")}</h2></div><span class="phase phase--${state.phase.toLowerCase()}" data-phase="${state.phase}">${statusCopy(state)}</span></div>
    <div class="office-canvas" data-office-canvas></div>
    <div class="task-strip"><div><span>${t("work.currentGoal")}</span><strong>${t("work.goal")}</strong></div><div class="task-actions" data-task-actions></div></div>
  </section>`;
}

function workView(state: CompanyWorkState): string {
  const focus = state.phase === "AWAITING_APPROVAL" ? `<section class="approval-focus" data-testid="approval-focus">
    <div><p class="eyebrow">HUMAN GATE</p><h3>模拟发布动作需要真人决定</h3></div>
    <p>批准仅绑定当前 work、责任合同、执行 Agent、证据摘要和动作 digest；任何字段变化都必须重新审批。</p>
    <dl><div><dt>负责真人</dt><dd>林澄</dd></div><div><dt>风险</dt><dd>高风险 · 已暂停</dd></div><div><dt>证据</dt><dd>${state.responsibility.evidenceIds.length} 份</dd></div></dl>
    <div class="task-actions" data-task-actions></div></section>` : `<section class="work-focus"><p class="eyebrow">ACTIVE WORK</p><h3>${t("work.goal")}</h3><p>状态：${statusCopy(state)}。所有活动均来自确定性模拟事件，不调用真实模型或工具。</p><div class="task-actions" data-task-actions></div></section>`;
  return `<section class="projection-stage" data-section="work" aria-labelledby="work-title">
    <div class="stage-heading"><div><p class="eyebrow">AGENT BOSS WORKBENCH</p><h2 id="work-title">工作与审批</h2></div><span class="phase phase--${state.phase.toLowerCase()}">${statusCopy(state)}</span></div>${focus}${eventFeed(state, true)}
  </section>`;
}

function responsibilityView(state: CompanyWorkState): string {
  return `<section class="projection-stage" data-section="responsibility" aria-labelledby="responsibility-title">
    <div class="stage-heading"><div><p class="eyebrow">ACCOUNTABILITY IS A PRODUCT OBJECT</p><h2 id="responsibility-title">完整责任记录</h2></div></div>
    <div class="responsibility-ledger">${responsibilityChain(state)}<dl class="contract-facts">
      <div><dt>工作 ID</dt><dd>${escapeHtml(state.responsibility.workId)}</dd></div><div><dt>责任合同</dt><dd>demo-responsibility-contract · fixture</dd></div>
      <div><dt>真人负责人</dt><dd>${escapeHtml(state.responsibility.accountableHumanId)}</dd></div><div><dt>执行主体</dt><dd>${escapeHtml(state.responsibility.executingAgentId)}</dd></div>
      <div><dt>数据授权</dt><dd>${state.responsibility.dataAuthorizationIds.length} 项 · 仅演示引用</dd></div><div><dt>结果</dt><dd>${state.responsibility.resultId ? escapeHtml(state.responsibility.resultId) : "尚未形成"}</dd></div>
    </dl></div>${eventFeed(state, true)}
  </section>`;
}

function connectorsView(): string {
  return `<section class="projection-stage" data-section="connectors" aria-labelledby="connectors-title">
    <div class="stage-heading"><div><p class="eyebrow">EQUAL CONNECTOR CONTRACT</p><h2 id="connectors-title">连接器与数据边界</h2></div><span class="fixture-seal">DEMO · NO NETWORK</span></div>
    <div class="connector-list">
      <article><span class="connector-orb connector-orb--green"></span><div><h3>State machine fixture</h3><p>声明暂停、恢复、取消、证据与结果能力</p></div><strong>隔离运行</strong></article>
      <article><span class="connector-orb connector-orb--amber"></span><div><h3>Journal fixture</h3><p>输出确定性进度事件，不持有凭据或外部 session</p></div><strong>隔离运行</strong></article>
      <article class="connector-placeholder"><span class="connector-orb"></span><div><h3>正式 Connector</h3><p>Raft Agent、Codex、DeepSeek 与企业 Agent 将通过同一契约接入</p></div><strong>未绑定</strong></article>
    </div>
    <section class="boundary-band"><div><span>模型调用</span><strong>0</strong></div><div><span>企业数据读取</span><strong>0</strong></div><div><span>外部网络请求</span><strong>0</strong></div><p>Demo 不保存密钥、私有推理或厂商 session。正式模式需重新绑定身份、数据合同和出口策略。</p></section>
  </section>`;
}

export function mountCompanyOS(
  host: CompanyOSHostContract,
  application: CompanyOSApplicationClient = createDemoApplicationClient(),
): MountedCompanyOS {
  let section: CompanyOSSection = host.initialSection ?? "office";
  let disposed = false;
  const root = document.createElement("main");
  root.className = "company-os";
  host.mountElement.replaceChildren(root);

  async function render(): Promise<void> {
    if (disposed) return;
    const [state, organization] = await Promise.all([
      application.snapshot(),
      application.organization(),
    ]);
    const main = section === "office" ? officeView(state) : section === "work" ? workView(state) : section === "responsibility" ? responsibilityView(state) : connectorsView();
    root.innerHTML = `<header class="topbar"><div class="brand-mark" aria-hidden="true">C</div><div><strong>${t("app.name")}</strong><span>${t("app.subtitle")}</span></div><span class="demo-badge">${t("demo.badge")}</span></header>
      <div class="workspace"><aside class="company-rail" aria-label="${t("demo.companyAria")}">
        <p class="eyebrow">${t("demo.runningCompany")}</p><h1>${t("demo.companyName")}</h1><p>${t("demo.accountability")}</p>
        <dl><div><dt>Agent Boss</dt><dd>${t("demo.boss")}</dd></div><div><dt>执行同事</dt><dd>${t("demo.executors")}</dd></div><div><dt>外部调用</dt><dd>${t("demo.externalCalls")}</dd></div></dl>
        <nav aria-label="Company OS sections">${SECTIONS.map(({ id, label }) => `<button type="button" data-section-target="${id}"${section === id ? ' aria-current="page"' : ""}>${label}</button>`).join("")}</nav></aside>
        ${main}<aside class="responsibility-rail" aria-label="${t("responsibility.aria")}"><div class="rail-heading"><p class="eyebrow">RESPONSIBILITY CHAIN</p><h2>${t("responsibility.title")}</h2></div>${responsibilityChain(state)}${eventFeed(state)}</aside>
      </div><footer>${t("demo.safetyFooter")}</footer>`;

    root.querySelectorAll<HTMLButtonElement>("[data-section-target]").forEach((button) => button.addEventListener("click", () => {
      section = button.dataset.sectionTarget as CompanyOSSection;
      host.onNavigate?.(`${host.basePath ?? ""}/${section}`.replace(/\/+/g, "/"));
      void render();
    }));

    const canvas = root.querySelector<HTMLElement>("[data-office-canvas]");
    if (canvas) await new OfficeDomRenderer(canvas).render(compileOfficeScene(organization, { entityStates: {
      "demo-researcher": state.phase === "AWAITING_APPROVAL" ? "BLOCKED" : state.phase === "COMPLETED" ? "COMPLETED" : state.phase === "READY" ? "WAITING" : "WORKING",
    } }));
    const actions = root.querySelector<HTMLElement>("[data-task-actions]");
    if (actions) {
      if (state.phase === "READY") actions.append(createButton({ label: t("action.assign"), tone: "primary", onClick: () => void application.assignWork().then(render) }));
      else if (["PLANNING", "SIMULATING_TOOL_ACTIVITY"].includes(state.phase)) actions.append(createButton({ label: t("action.advance"), tone: "primary", onClick: () => void application.advanceWork().then(render) }));
      else if (state.phase === "AWAITING_APPROVAL") actions.append(createButton({ label: t("action.approve"), tone: "primary", onClick: () => void application.decideApproval("APPROVED").then(render) }), createButton({ label: t("action.reject"), tone: "danger", onClick: () => void application.decideApproval("REJECTED").then(render) }));
      if (application.mode === "DEMO_FIXTURE") actions.append(createButton({ label: t("action.reset"), tone: "quiet", onClick: () => void application.resetFixture().then(render) }));
    }
  }

  void render();
  return { unmount() { disposed = true; host.mountElement.replaceChildren(); } };
}
