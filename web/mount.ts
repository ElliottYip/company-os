import { createDemoRuntime, type DemoState } from "../application/demo-runtime.ts";
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

const demoOrganization = {
  company: { id: "demo-company", name: "珊瑚实验室", purpose: "安全演示", locale: "zh-CN" },
  departments: [{ id: "operations", name: "运营部", mandate: "安全交付" }],
  humans: [{
    id: "demo-boss",
    name: "林澄",
    title: "Agent Boss（演示）",
    departmentId: "operations",
    avatarId: "clay-human-placeholder",
  }],
  agents: [
    {
      id: "demo-researcher",
      name: "市场研究员",
      role: "形成带证据的市场简报",
      departmentId: "operations",
      accountableHumanId: "demo-boss",
      runtimeConnectorId: "fixture-codex",
      avatarId: "fish-bumble",
      autonomyLevel: 2,
    },
    {
      id: "demo-operator",
      name: "运营协作者",
      role: "模拟运营进度",
      departmentId: "operations",
      accountableHumanId: "demo-boss",
      runtimeConnectorId: "fixture-enterprise",
      avatarId: "fish-fizz",
      autonomyLevel: 1,
    },
  ],
} as const;

function statusCopy(state: DemoState): string {
  const copy: Record<DemoState["phase"], string> = {
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
  const runtime = createDemoRuntime();
  const root = document.createElement("main");
  root.className = "company-os";
  host.mountElement.replaceChildren(root);

  async function render(): Promise<void> {
    const state = runtime.snapshot();
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
    await new OfficeDomRenderer(canvas).render(compileOfficeScene(demoOrganization));

    if (state.phase === "READY") {
      actions.append(createButton({ label: "分配模拟任务", tone: "primary", onClick: () => {
        runtime.assignTask(); void render();
      } }));
    } else if (["PLANNING", "SIMULATING_TOOL_ACTIVITY"].includes(state.phase)) {
      actions.append(createButton({ label: "推进下一事件", tone: "primary", onClick: () => {
        runtime.advance(); void render();
      } }));
    } else if (state.phase === "AWAITING_APPROVAL") {
      actions.append(
        createButton({ label: "批准模拟动作", tone: "primary", onClick: () => {
          runtime.decide("APPROVED"); void render();
        } }),
        createButton({ label: "拒绝", tone: "danger", onClick: () => {
          runtime.decide("REJECTED"); void render();
        } }),
      );
    }
    actions.append(createButton({ label: "一键重置", tone: "quiet", onClick: () => {
      runtime.reset(); void render();
    } }));
  }

  void render();
  return {
    unmount() {
      host.mountElement.replaceChildren();
    },
  };
}

