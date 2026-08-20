import type { CompanyWorkState } from "../application/company-operations.ts";
import type { AdministrationProjection } from "../application/get-administration-projection.ts";
import { compileOfficeScene } from "../core/office.ts";
import type { OrganizationDraft } from "../core/organization.ts";
import {
  createDemoApplicationClient,
  type CompanyOSApplicationClient,
} from "./application-client.ts";
import { createButton } from "./components/button.ts";
import { createFormalAssignment, formalWebFailure } from "./formal-work-state.ts";
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

function principalName(organization: OrganizationDraft, id: string): string {
  return organization.humans.find((human) => human.id === id)?.name ??
    organization.agents.find((agent) => agent.id === id)?.name ?? id;
}

function fixtureAgentSuffix(name: string, state: CompanyWorkState): string {
  return state.mode === "DEMO_FIXTURE" && !/[（(](?:演示|模拟)/.test(name) ? "（模拟）" : "";
}

function responsibilityChain(state: CompanyWorkState, organization: OrganizationDraft): string {
  return `<ol class="chain-list" data-testid="responsibility-chain">
    <li><span>${t("responsibility.initiator")}</span><strong>${escapeHtml(principalName(organization, state.responsibility.goalInitiatorId))}</strong></li>
    <li><span>${t("responsibility.executor")}</span><strong>${escapeHtml(principalName(organization, state.responsibility.executingAgentId))}${fixtureAgentSuffix(principalName(organization, state.responsibility.executingAgentId), state)}</strong></li>
    <li><span>${t("responsibility.permissionsData")}</span><strong>${state.responsibility.permissionIds.length} 项权限 · ${state.responsibility.dataAuthorizationIds.length} 份数据合同</strong></li>
    <li><span>${t("responsibility.approval")}</span><strong>${state.responsibility.approvalIds.length ? "林澄 · 已精确绑定" : "尚未触发"}</strong></li>
    <li><span>${t("responsibility.evidenceResult")}</span><strong>${state.responsibility.evidenceIds.length} 份证据 · ${state.responsibility.resultId ? "结果已记录" : "结果待形成"}</strong></li>
  </ol>`;
}

function eventFeed(state: CompanyWorkState, expanded = false): string {
  const events = state.events.length ? state.events.map((event) => `<article class="event-row" data-event-code="${escapeHtml(event.type)}">
    <time>${event.occurredAt.slice(11, 19)}</time><div><strong>${escapeHtml(eventKind(event.type))}</strong><p>${escapeHtml(event.summary)}</p></div><span>${event.isFixture ? "FIXTURE" : "FORMAL"}</span>
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
    <div class="task-actions" data-task-actions></div></section>` : `<section class="work-focus"><p class="eyebrow">ACTIVE WORK</p><h3>${t("work.goal")}</h3><p>状态：${statusCopy(state)}。${state.mode === "DEMO_FIXTURE" ? "所有活动均来自确定性模拟事件，不调用真实模型或工具。" : "正式命令将由服务端重新校验身份、租户、责任合同和动作权限。"}</p><div class="task-actions" data-task-actions></div></section>`;
  return `<section class="projection-stage" data-section="work" aria-labelledby="work-title">
    <div class="stage-heading"><div><p class="eyebrow">AGENT BOSS WORKBENCH</p><h2 id="work-title">工作与审批</h2></div><span class="phase phase--${state.phase.toLowerCase()}">${statusCopy(state)}</span></div>${focus}${eventFeed(state, true)}
  </section>`;
}

function responsibilityView(state: CompanyWorkState, organization: OrganizationDraft): string {
  return `<section class="projection-stage" data-section="responsibility" aria-labelledby="responsibility-title">
    <div class="stage-heading"><div><p class="eyebrow">ACCOUNTABILITY IS A PRODUCT OBJECT</p><h2 id="responsibility-title">完整责任记录</h2></div></div>
    <div class="responsibility-ledger">${responsibilityChain(state, organization)}<dl class="contract-facts">
      <div><dt>工作 ID</dt><dd>${escapeHtml(state.responsibility.workId)}</dd></div><div><dt>记录来源</dt><dd>${state.mode === "DEMO_FIXTURE" ? "确定性 fixture" : "正式控制面投影"}</dd></div>
      <div><dt>真人负责人</dt><dd>${escapeHtml(state.responsibility.accountableHumanId)}</dd></div><div><dt>执行主体</dt><dd>${escapeHtml(state.responsibility.executingAgentId)}</dd></div>
      <div><dt>数据授权</dt><dd>${state.responsibility.dataAuthorizationIds.length} 项 · 仅演示引用</dd></div><div><dt>结果</dt><dd>${state.responsibility.resultId ? escapeHtml(state.responsibility.resultId) : "尚未形成"}</dd></div>
    </dl></div>${eventFeed(state, true)}
  </section>`;
}

function connectorsView(mode: CompanyOSApplicationClient["mode"], administration: AdministrationProjection | null): string {
  const catalogRows = mode === "DEMO_FIXTURE" ? `
      <article><span class="connector-orb connector-orb--green"></span><div><h3>State machine fixture</h3><p>声明暂停、恢复、取消、证据与结果能力</p></div><strong>隔离运行</strong></article>
      <article><span class="connector-orb connector-orb--amber"></span><div><h3>Journal fixture</h3><p>输出确定性进度事件，不持有凭据或外部 session</p></div><strong>隔离运行</strong></article>` : `
      ${administration?.connectorCatalog.connectors.map((connector) => `<article><span class="connector-orb ${connector.status === "ENABLED" ? "connector-orb--green" : ""}"></span><div><h3>${escapeHtml(connector.displayName)}</h3><p>${connector.operations.join(" · ")} · ${escapeHtml(connector.executionResidency)}</p></div><strong>${connector.secretConfigured ? "Secret 已配置" : "无需 Secret"}</strong></article>`).join("") || `<article class="connector-placeholder"><span class="connector-orb"></span><div><h3>尚未注册 Connector</h3><p>通过同等 Connector 契约接入企业执行面。</p></div><strong>空目录</strong></article>`}`;
  const governance = mode === "FORMAL" && administration ? `<section class="admin-grid" aria-label="模型与数据治理">
    <article><span>模型策略</span><strong>${administration.governance.modelRoutingPolicies.length}</strong><p>凭据仅显示是否配置，不返回引用值。</p></article>
    <article><span>数据授权合同</span><strong>${administration.governance.dataAuthorizationContracts.length}</strong><p>按 Agent、用途、分类和出口目的地约束。</p></article>
    <article><span>出口判定记录</span><strong>${administration.egressDecisions.length}</strong><p>允许与拒绝都持久化为可审计决定。</p></article>
  </section>` : "";
  return `<section class="projection-stage" data-section="connectors" aria-labelledby="connectors-title">
    <div class="stage-heading"><div><p class="eyebrow">EQUAL CONNECTOR CONTRACT</p><h2 id="connectors-title">连接器与数据边界</h2></div><span class="fixture-seal">${mode === "DEMO_FIXTURE" ? "DEMO · NO NETWORK" : "FORMAL CONTROL PLANE"}</span></div>
    <div class="connector-list">
      ${catalogRows}
      ${mode === "DEMO_FIXTURE" ? `<article class="connector-placeholder"><span class="connector-orb"></span><div><h3>正式 Connector</h3><p>Raft Agent、Codex、DeepSeek 与企业 Agent 将通过同一契约接入</p></div><strong>未绑定</strong></article>` : ""}
    </div>
    ${governance}
    <section class="boundary-band"><div><span>Secret material</span><strong>0</strong></div><div><span>私有 session</span><strong>0</strong></div><div><span>未授权出口</span><strong>0</strong></div><p>${mode === "DEMO_FIXTURE" ? "Demo 不访问外部系统；转正式只复制清理后的组织模板。" : "控制面只保存 Secret 引用与租约证明；正式数据访问和出口按合同逐次判定。"}</p></section>
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

  function renderFailure(error: unknown): void {
    const failure = formalWebFailure(error);
    root.removeAttribute("aria-busy");
    root.innerHTML = `<section class="system-state" role="alert" data-state="${failure.kind}">
      <p class="eyebrow">${failure.kind}</p><h1>${escapeHtml(failure.copy)}</h1>
      <p>错误代码：<code>${escapeHtml(failure.code)}</code></p>
      <button class="cos-button cos-button--secondary" type="button" data-retry>重试</button>
    </section>`;
    root.querySelector<HTMLButtonElement>("[data-retry]")?.addEventListener("click", () => void render());
  }

  async function runAction(action: () => Promise<unknown>): Promise<void> {
    root.setAttribute("aria-busy", "true");
    try {
      await action();
      await render();
    } catch (error) {
      renderFailure(error);
    }
  }

  async function render(): Promise<void> {
    if (disposed) return;
    root.setAttribute("aria-busy", "true");
    if (!root.childElementCount) root.innerHTML = `<section class="system-state" data-state="LOADING"><p class="eyebrow">LOADING</p><h1>正在读取公司控制面…</h1></section>`;
    let state: CompanyWorkState;
    let organization: OrganizationDraft;
    let assignmentOptions: Awaited<ReturnType<CompanyOSApplicationClient["assignmentOptions"]>>;
    let administration: AdministrationProjection | null;
    try {
      [state, organization, assignmentOptions, administration] = await Promise.all([
        application.snapshot(), application.organization(), application.assignmentOptions(), application.administration(),
      ]);
    } catch (error) {
      renderFailure(error);
      return;
    }
    if (disposed) return;
    const isDemo = application.mode === "DEMO_FIXTURE";
    const main = section === "office" ? officeView(state) : section === "work" ? workView(state) : section === "responsibility" ? responsibilityView(state, organization) : connectorsView(application.mode, administration);
    root.innerHTML = `<header class="topbar"><div class="brand-mark" aria-hidden="true">C</div><div><strong>${t("app.name")}</strong><span>${t("app.subtitle")}</span></div><span class="demo-badge">${isDemo ? t("demo.badge") : "正式模式 · 身份已门禁"}</span></header>
      <div class="workspace"><aside class="company-rail" aria-label="${t("demo.companyAria")}">
        <p class="eyebrow">${isDemo ? t("demo.runningCompany") : "FORMAL COMPANY"}</p><h1>${escapeHtml(organization.company.name)}</h1><p>${isDemo ? t("demo.accountability") : "真人、Agent、责任合同、审批和证据处于同一个正式公司边界。"}</p>
        <dl><div><dt>真人负责人</dt><dd>${organization.humans.length}</dd></div><div><dt>Agent 同事</dt><dd>${organization.agents.length}</dd></div><div><dt>数据模式</dt><dd>${isDemo ? t("demo.externalCalls") : "正式投影"}</dd></div></dl>
        <nav aria-label="Company OS sections">${SECTIONS.map(({ id, label }) => `<button type="button" data-section-target="${id}"${section === id ? ' aria-current="page"' : ""}>${label}</button>`).join("")}</nav></aside>
        ${main}<aside class="responsibility-rail" aria-label="${t("responsibility.aria")}"><div class="rail-heading"><p class="eyebrow">RESPONSIBILITY CHAIN</p><h2>${t("responsibility.title")}</h2></div>${responsibilityChain(state, organization)}${eventFeed(state)}</aside>
      </div><footer>${isDemo ? t("demo.safetyFooter") : "正式模式 · 身份、租户、责任合同和数据授权均在服务端校验"}</footer>`;
    root.removeAttribute("aria-busy");

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
    if (actions && application.mode === "DEMO_FIXTURE") {
      if (state.phase === "READY") actions.append(createButton({ label: t("action.assign"), tone: "primary", onClick: () => void runAction(() => application.assignWork()) }));
      else if (["PLANNING", "SIMULATING_TOOL_ACTIVITY"].includes(state.phase)) actions.append(createButton({ label: t("action.advance"), tone: "primary", onClick: () => void runAction(() => application.advanceWork()) }));
      else if (state.phase === "AWAITING_APPROVAL") actions.append(createButton({ label: t("action.approve"), tone: "primary", onClick: () => void runAction(() => application.decideApproval("APPROVED")) }), createButton({ label: t("action.reject"), tone: "danger", onClick: () => void runAction(() => application.decideApproval("REJECTED")) }));
      actions.append(createButton({ label: t("action.reset"), tone: "quiet", onClick: () => void runAction(() => application.resetFixture()) }));
    } else if (actions && state.phase === "READY") {
      if (!assignmentOptions.agents.length) {
        actions.innerHTML = `<p class="empty-copy" role="status">没有已绑定责任合同且可执行动作的 Agent。</p>`;
      } else {
        actions.innerHTML = `<form class="formal-work-form" data-formal-work-form>
          <label>工作标题<input name="title" required maxlength="120" autocomplete="off"></label>
          <label>目标<textarea name="goal" required maxlength="1000" rows="2"></textarea></label>
          <label>执行 Agent<select name="agentId">${assignmentOptions.agents.map((agent) => `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name)}</option>`).join("")}</select></label>
          <button class="cos-button cos-button--primary" type="submit">分配正式工作</button>
        </form>`;
        actions.querySelector<HTMLFormElement>("[data-formal-work-form]")?.addEventListener("submit", (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget as HTMLFormElement);
          void runAction(() => application.assignWork(createFormalAssignment(assignmentOptions, {
            title: String(data.get("title") ?? ""), goal: String(data.get("goal") ?? ""), agentId: String(data.get("agentId") ?? ""),
          })));
        });
      }
    } else if (actions && state.phase === "AWAITING_APPROVAL") {
      actions.append(
        createButton({ label: t("action.approve"), tone: "primary", onClick: () => void runAction(() => application.decideApproval("APPROVED")) }),
        createButton({ label: t("action.reject"), tone: "danger", onClick: () => void runAction(() => application.decideApproval("REJECTED")) }),
      );
    }
  }

  void render();
  return { unmount() { disposed = true; host.mountElement.replaceChildren(); } };
}
