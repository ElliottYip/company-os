import { createDemoComposition } from "../adapters/demo/create-demo-composition.ts";
import { DEMO_COMPANY } from "../adapters/demo/demo-company.ts";
import type { CompanyWorkState } from "../application/company-operations.ts";
import { compileOfficeScene } from "../core/office.ts";
import { createButton } from "./components/button.ts";
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
        <div><strong>Company OS</strong><span>珊瑚实验室 · 确定性演示</span></div>
        <span class="demo-badge">DEMO FIXTURE · 非真实 Agent</span>
      </header>
      <div class="workspace">
        <aside class="company-rail" aria-label="演示公司结构">
          <p class="eyebrow">正在运行的公司</p>
          <h1>珊瑚实验室</h1>
          <p>真人对目标、权限与高风险动作负责。</p>
          <dl>
            <div><dt>Agent Boss</dt><dd>林澄（真人演示身份）</dd></div>
            <div><dt>执行同事</dt><dd>2 个模拟 Agent</dd></div>
            <div><dt>外部调用</dt><dd>0 · 完全隔离</dd></div>
          </dl>
          <nav aria-label="Company OS sections">
            <button type="button" aria-current="page">办公室</button>
            <button type="button">工作与审批</button>
            <button type="button">责任记录</button>
            <button type="button">连接器</button>
          </nav>
        </aside>
        <section class="office-stage" aria-labelledby="office-title">
          <div class="stage-heading">
            <div><p class="eyebrow">OFFICE PULSE</p><h2 id="office-title">公司正在运转</h2></div>
            <span class="phase phase--${state.phase.toLowerCase()}">${statusCopy(state)}</span>
          </div>
          <div class="office-canvas" data-office-canvas></div>
          <div class="task-strip">
            <div><span>当前目标</span><strong>形成带证据的市场简报并模拟发布</strong></div>
            <div class="task-actions" data-task-actions></div>
          </div>
        </section>
        <aside class="responsibility-rail" aria-label="责任链">
          <div class="rail-heading"><p class="eyebrow">RESPONSIBILITY CHAIN</p><h2>谁对什么负责</h2></div>
          <ol class="chain-list">
            <li><span>目标发起</span><strong>林澄 · Agent Boss</strong></li>
            <li><span>执行 Agent</span><strong>市场研究员（模拟）</strong></li>
            <li><span>权限与数据</span><strong>2 项权限 · 1 份数据合同</strong></li>
            <li><span>真人审批</span><strong>${state.responsibility.approvalIds.length ? "林澄 · 待决定" : "尚未触发"}</strong></li>
            <li><span>证据与结果</span><strong>${state.responsibility.evidenceIds.length} 份证据 · ${state.responsibility.resultId ? "结果已记录" : "结果待形成"}</strong></li>
          </ol>
          <section class="event-feed" aria-live="polite">
            <h3>确定性事件流</h3>
            ${state.events.length ? state.events.map((event) => `<p><time>${event.occurredAt.slice(11, 19)}</time>${event.summary}</p>`).join("") : "<p class='empty-copy'>分配模拟任务后，事件会按固定顺序出现。</p>"}
          </section>
        </aside>
      </div>
      <footer>Demo 不连接模型、Relay、MCP、Shell、文件系统或企业数据。正式模式需重新绑定身份、权限与责任合同。</footer>
    `;

    const canvas = root.querySelector<HTMLElement>("[data-office-canvas]");
    const actions = root.querySelector<HTMLElement>("[data-task-actions]");
    if (!canvas || !actions) throw new Error("Company OS Web shell failed to mount.");
    await new OfficeDomRenderer(canvas).render(compileOfficeScene(DEMO_COMPANY));

    if (state.phase === "READY") {
      actions.append(createButton({ label: "分配模拟任务", tone: "primary", onClick: () => {
        void runtime.assignTask().then(render);
      } }));
    } else if (["PLANNING", "SIMULATING_TOOL_ACTIVITY"].includes(state.phase)) {
      actions.append(createButton({ label: "推进下一事件", tone: "primary", onClick: () => {
        void runtime.advance().then(render);
      } }));
    } else if (state.phase === "AWAITING_APPROVAL") {
      actions.append(
        createButton({ label: "批准模拟动作", tone: "primary", onClick: () => {
          void runtime.decide("APPROVED").then(render);
        } }),
        createButton({ label: "拒绝", tone: "danger", onClick: () => {
          void runtime.decide("REJECTED").then(render);
        } }),
      );
    }
    actions.append(createButton({ label: "一键重置", tone: "quiet", onClick: () => {
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
