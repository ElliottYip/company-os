import { createDemoComposition } from "../adapters/demo/create-demo-composition.ts";
import { DEMO_COMPANY } from "../adapters/demo/demo-company.ts";
import type { CompanyWorkState } from "../application/company-operations.ts";
import { compileOfficeScene } from "../core/office.ts";
import { createButton } from "./components/button.ts";
import { t } from "./i18n/zh-CN.ts";
import { OfficeDomRenderer } from "./office-dom-renderer.ts";

export interface CompanyOSHostContract {
  readonly mountElement: HTMLElement;
  readonly basePath?: string;
  readonly onNavigate?: (path: string) => void;
}

export interface MountedCompanyOS {
  unmount(): void;
}

function statusCopy(state: CompanyWorkState): string {
  const copy: Record<CompanyWorkState["phase"], string> = {
    READY: "等待分配",
    PLANNING: "正在规划",
    SIMULATING_TOOL_ACTIVITY: "模拟执行",
    AWAITING_APPROVAL: "等待真人审批",
    COMPLETED: "已完成",
    REJECTED: "已拒绝",
  };
  return copy[state.phase];
}

export function mountCompanyOS(host: CompanyOSHostContract): MountedCompanyOS {
  const { runtime } = createDemoComposition();
  const root = document.createElement("main");
  root.className = "company-os";
  host.mountElement.replaceChildren(root);

  async function render(): Promise<void> {
    const state = await runtime.snapshot();
    root.innerHTML = `
      <header class="topbar">
        <div class="brand-mark" aria-hidden="true">C</div>
        <div><strong>${t("app.name")}</strong><span>${t("app.subtitle")}</span></div>
        <span class="demo-badge">${t("demo.badge")}</span>
      </header>
      <div class="workspace">
        <aside class="company-rail" aria-label="${t("demo.companyAria")}">
          <p class="eyebrow">${t("demo.runningCompany")}</p>
          <h1>${t("demo.companyName")}</h1>
          <p>${t("demo.accountability")}</p>
          <dl>
            <div><dt>Agent Boss</dt><dd>${t("demo.boss")}</dd></div>
            <div><dt>执行同事</dt><dd>${t("demo.executors")}</dd></div>
            <div><dt>外部调用</dt><dd>${t("demo.externalCalls")}</dd></div>
          </dl>
          <nav aria-label="Company OS sections">
            <button type="button" aria-current="page">${t("nav.office")}</button>
            <button type="button">${t("nav.workApprovals")}</button>
            <button type="button">${t("nav.responsibility")}</button>
            <button type="button">${t("nav.connectors")}</button>
          </nav>
        </aside>
        <section class="office-stage" aria-labelledby="office-title">
          <div class="stage-heading">
            <div><p class="eyebrow">OFFICE PULSE</p><h2 id="office-title">${t("office.title")}</h2></div>
            <span class="phase phase--${state.phase.toLowerCase()}">${statusCopy(state)}</span>
          </div>
          <div class="office-canvas" data-office-canvas></div>
          <div class="task-strip">
            <div><span>${t("work.currentGoal")}</span><strong>${t("work.goal")}</strong></div>
            <div class="task-actions" data-task-actions></div>
          </div>
        </section>
        <aside class="responsibility-rail" aria-label="${t("responsibility.aria")}">
          <div class="rail-heading"><p class="eyebrow">RESPONSIBILITY CHAIN</p><h2>${t("responsibility.title")}</h2></div>
          <ol class="chain-list">
            <li><span>${t("responsibility.initiator")}</span><strong>林澄 · Agent Boss</strong></li>
            <li><span>${t("responsibility.executor")}</span><strong>市场研究员（模拟）</strong></li>
            <li><span>${t("responsibility.permissionsData")}</span><strong>2 项权限 · 1 份数据合同</strong></li>
            <li><span>${t("responsibility.approval")}</span><strong>${state.responsibility.approvalIds.length ? "林澄 · 待决定" : "尚未触发"}</strong></li>
            <li><span>${t("responsibility.evidenceResult")}</span><strong>${state.responsibility.evidenceIds.length} 份证据 · ${state.responsibility.resultId ? "结果已记录" : "结果待形成"}</strong></li>
          </ol>
          <section class="event-feed" aria-live="polite">
            <h3>${t("events.title")}</h3>
            ${state.events.length ? state.events.map((event) => `<p><time>${event.occurredAt.slice(11, 19)}</time>${event.summary}</p>`).join("") : `<p class='empty-copy'>${t("events.empty")}</p>`}
          </section>
        </aside>
      </div>
      <footer>${t("demo.safetyFooter")}</footer>
    `;

    const canvas = root.querySelector<HTMLElement>("[data-office-canvas]");
    const actions = root.querySelector<HTMLElement>("[data-task-actions]");
    if (!canvas || !actions) throw new Error("Company OS Web shell failed to mount.");
    await new OfficeDomRenderer(canvas).render(compileOfficeScene(DEMO_COMPANY));

    if (state.phase === "READY") {
      actions.append(createButton({ label: t("action.assign"), tone: "primary", onClick: () => {
        void runtime.assignTask().then(render);
      } }));
    } else if (["PLANNING", "SIMULATING_TOOL_ACTIVITY"].includes(state.phase)) {
      actions.append(createButton({ label: t("action.advance"), tone: "primary", onClick: () => {
        void runtime.advance().then(render);
      } }));
    } else if (state.phase === "AWAITING_APPROVAL") {
      actions.append(
        createButton({ label: t("action.approve"), tone: "primary", onClick: () => {
          void runtime.decide("APPROVED").then(render);
        } }),
        createButton({ label: t("action.reject"), tone: "danger", onClick: () => {
          void runtime.decide("REJECTED").then(render);
        } }),
      );
    }
    actions.append(createButton({ label: t("action.reset"), tone: "quiet", onClick: () => {
      void runtime.reset().then(render);
    } }));
  }

  void render();
  return {
    unmount() {
      host.mountElement.replaceChildren();
    },
  };
}
