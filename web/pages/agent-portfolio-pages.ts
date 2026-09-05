import type { PublicDemoPortfolioSnapshot } from "../public-demo-client.ts";

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
})[character]!);

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;
const badge = (value: string, tone = "") =>
  `<span class="portfolio-badge ${tone}">${escapeHtml(value)}</span>`;

export function agentPortfolioPage(
  section: "office" | "agents" | "work" | "approvals" | "connectors" | "usage",
  snapshot: PublicDemoPortfolioSnapshot,
  locale: "en" | "zh-CN",
): string {
  const zh = locale === "zh-CN";
  const c = (en: string, cn: string) => zh ? cn : en;
  const totalCost = snapshot.work.reduce((sum, work) => sum + work.costCents, 0) +
    snapshot.governed.costCents +
    snapshot.commercial.usage.reduce((sum, usage) => sum + usage.costCents, 0);
  const personalCount = snapshot.agents.filter(({ agentClass }) => agentClass === "PERSONAL").length;
  const sharedCount = snapshot.agents.filter(({ agentClass }) => agentClass === "SHARED").length;
  const federatedCount = snapshot.agents.filter(({ agentClass }) =>
    agentClass === "FEDERATED_RUNTIME").length;
  const expiring = snapshot.commercial.credentials.filter(({ status }) =>
    status === "EXPIRING" || status === "EXPIRED").length;
  const heading = (title: string, description: string) => `
    <header class="control-page-title portfolio-title">
      <div><p class="family-kicker">${c("AGENT PORTFOLIO · DETERMINISTIC DEMO", "AGENT 资产组合 · 确定性演示")}</p>
      <h1>${title}</h1><p>${description}</p></div>
      ${badge(c("DEMO FIXTURE · NO EXTERNAL CALLS", "演示数据 · 无外部调用"), "demo")}
    </header>`;
  const page = (content: string) => `<section class="page-stage portfolio-page" data-section="${section}">${content}</section>`;

  if (section === "agents") {
    return page(`${heading(c("Agents", "Agents"), c(
      "One inventory across Personal, Shared, and Federated Agents—with the actual management boundary visible.",
      "统一管理个人、共享与联邦 Agent，并明确展示 ANC 的实际管理边界。",
    ))}
    <section class="portfolio-agent-grid">${snapshot.agents.map((agent) => `
      <article class="portfolio-agent-card">
        <div><p class="family-kicker">${escapeHtml(agent.agentClass.replaceAll("_", " "))}</p>
        <h3>${escapeHtml(agent.displayName)}</h3>
        <p>${c("Accountable human", "真人负责人")}: <strong>${escapeHtml(agent.accountableHumanId ?? c("Gap", "缺口"))}</strong></p></div>
        <div class="portfolio-badge-row">${badge(agent.managementDepth, "depth")}
        ${badge(agent.executionOwner)}${badge(agent.connectorHealth, agent.connectorHealth === "HEALTHY" ? "healthy" : "")}</div>
        <dl><div><dt>${c("Work visibility", "任务可见性")}</dt><dd>${escapeHtml(agent.workVisibility)}</dd></div>
        <div><dt>${c("Privacy", "隐私边界")}</dt><dd>${escapeHtml(agent.privacyBoundary)}</dd></div>
        <div><dt>${c("Runtime", "运行环境")}</dt><dd>${escapeHtml(agent.runtimeReference ?? "—")}</dd></div>
        <div><dt>${c("Lifecycle", "生命周期")}</dt><dd>${escapeHtml(agent.lifecycleStatus)}</dd></div></dl>
      </article>`).join("")}</section>`);
  }

  if (section === "work") {
    return page(`${heading(c("Work across sources", "跨来源任务"), c(
      "Observed and Federated records return to their source. Governed work alone claims ANC-enforced authority.",
      "Observed 与 Federated 任务返回原系统；只有 Governed 任务声明由 ANC 强制治理。",
    ))}
    <section class="portfolio-work-list">${snapshot.work.map((work) => `
      <article class="portfolio-work-row"><div>${badge(work.mode, "depth")}
      <h3>${escapeHtml(work.title)}</h3><p>${escapeHtml(work.summary)}</p>
      <small>${c("Agent", "执行 Agent")} ${escapeHtml(work.agentId)} · ${c("Source revision", "来源版本")} ${work.sourceRevision}</small></div>
      <div><strong>${escapeHtml(work.status)}</strong><span>${money(work.costCents)}</span>
      ${work.source.returnUrl ? `<a href="${escapeHtml(work.source.returnUrl)}" target="_blank" rel="noreferrer">${c("Open source fixture", "打开来源演示")}</a>` : ""}</div></article>`).join("")}</section>`);
  }

  if (section === "approvals") {
    const governed = snapshot.governed;
    return page(`${heading(c("Approvals", "审批"), c(
      "Only actions that ANC actually governs appear here.",
      "这里只处理 ANC 真正能够治理的高风险动作。",
    ))}
    <section class="portfolio-approval-card">
      <div><p class="family-kicker">${c("GOVERNED WORKFLOW", "GOVERNED 工作流")}</p>
      <h2>${c("Send customer quotations in bulk", "批量向客户发送报价")}</h2>
      <p>${c("The high-risk action pauses with a human owner, data scope, evidence, and exact approval binding.", "高风险动作会暂停，并绑定真人负责人、数据范围、证据与精确审批。")}</p></div>
      <dl><div><dt>${c("Phase", "阶段")}</dt><dd>${escapeHtml(governed.phase)}</dd></div>
      <div><dt>${c("Approval", "审批")}</dt><dd>${escapeHtml(governed.approvalRequestId ?? "—")}</dd></div>
      <div><dt>${c("Evidence", "证据")}</dt><dd>${governed.evidenceReferences.length}</dd></div>
      <div><dt>${c("Cost", "成本")}</dt><dd>${money(governed.costCents)}</dd></div></dl>
      <div class="task-actions">${governed.phase === "READY"
        ? `<button type="button" data-demo-trigger-governed>${c("Trigger governed workflow", "触发 Governed 工作流")}</button>`
        : governed.phase === "AWAITING_APPROVAL"
        ? `<button type="button" data-demo-decision="APPROVED">${c("Approve", "批准")}</button><button class="danger" type="button" data-demo-decision="REJECTED">${c("Reject", "拒绝")}</button>`
        : badge(governed.phase, governed.phase === "APPROVED" ? "healthy" : "")}</div>
    </section>`);
  }

  if (section === "connectors") {
    return page(`${heading(c("Governance", "治理"), c(
      "Identity, data, credential references, Connector health, management depth, and external sync.",
      "统一管理身份、数据、Credential 引用、Connector 健康、管理深度与外部同步。",
    ))}
    <section class="portfolio-governance-grid">
      <article><h3>${c("Capability truth", "能力真实性")}</h3><p>${c(
        "Inventory Connectors do not claim task control. Federated sources synchronize references without ANC execution.",
        "Inventory Connector 不声明任务控制；Federated 来源只同步引用，不经 ANC 执行。",
      )}</p>${badge("INVENTORY")}${badge("OBSERVED")}${badge("GOVERNED")}${badge("FEDERATED")}</article>
      <article><h3>${c("Personal privacy", "个人隐私")}</h3><p>${c(
        "No private conversations, local files, sessions, or reasoning are present.",
        "不包含私人对话、本地文件、Session 或私有推理。",
      )}</p>${badge("PRIVATE_ACTIVITY_EXCLUDED", "healthy")}</article>
      <article><h3>${c("External synchronization", "外部平台同步")}</h3><p>${c(
        "The workspace and Run below are deterministic reference data, not a live platform connection.",
        "下方 Workspace 与 Run 是确定性参考数据，不代表真实平台连接。",
      )}</p>${badge("DEMO_FIXTURE")}</article>
    </section>`);
  }

  if (section === "usage") {
    return page(`${heading(c("Usage & Billing", "用量与计费"), c(
      "Subscriptions, seats, quotas, renewal dates, credential status, allocation, and exceptions.",
      "统一展示订阅、席位、额度、续费日期、Credential 状态、成本分摊与异常。",
    ))}
    <section class="portfolio-commercial-grid">
      ${snapshot.commercial.subscriptions.map((item) => `<article><p class="family-kicker">SUBSCRIPTION</p><h3>${escapeHtml(item.id)}</h3><strong>${money(item.periodCostCents)}</strong><p>${item.seatCount} ${c("seat", "席位")} · ${item.quotaUnits.toLocaleString()} ${item.quotaUnit}</p><small>${c("Renews", "续费日")} ${escapeHtml(item.renewalAt)}</small></article>`).join("")}
      ${snapshot.commercial.credentials.map((item) => `<article><p class="family-kicker">CREDENTIAL</p><h3>${escapeHtml(item.id)}</h3>${badge(item.status, item.status === "VALID" ? "healthy" : "")}<p>${escapeHtml(item.policyStatus)} · ${c("reference only", "仅引用")}</p><button type="button" data-demo-renewal-target="${escapeHtml(item.id)}" data-demo-renewal-type="CREDENTIAL">${c("Request renewal", "申请续期")}</button></article>`).join("")}
      ${snapshot.commercial.renewals.map((item) => `<article><p class="family-kicker">RENEWAL</p><h3>${escapeHtml(item.targetId)}</h3>${badge(item.status)}<p>${escapeHtml(item.reason)}</p></article>`).join("")}
    </section>`);
  }

  return page(`${heading(c("Agent Portfolio", "Agent 资产组合"), c(
    "Identity, ownership, permission, usage, cost, lifecycle, evidence, and responsibility—without replacing Agent runtimes.",
    "统一管理身份、归属、权限、用量、成本、生命周期、证据与责任，但不替代 Agent Runtime。",
  ))}
  <section class="portfolio-metric-grid">
    <article><span>${personalCount}</span><strong>Personal</strong><small>INVENTORY</small></article>
    <article><span>${sharedCount}</span><strong>Shared</strong><small>OBSERVED + GOVERNED</small></article>
    <article><span>${federatedCount}</span><strong>Federated</strong><small>EXTERNAL EXECUTION</small></article>
    <article><span>${money(totalCost)}</span><strong>${c("Recorded cost", "已记录成本")}</strong><small>DEMO FIXTURE</small></article>
    <article><span>${expiring}</span><strong>${c("Credential alerts", "Credential 提醒")}</strong><small>${c("Reference status only", "仅引用状态")}</small></article>
    <article><span>${snapshot.commercial.renewals.length}</span><strong>${c("Renewal requests", "续期申请")}</strong><small>${c("Approval-bound", "绑定审批")}</small></article>
  </section>
  <section class="portfolio-demo-path"><h2>${c("Three-minute path", "三分钟体验")}</h2>
  <ol><li>${c("Compare management depth in Agents.", "在 Agents 中比较管理深度。")}</li>
  <li>${c("Open Observed and Federated Work.", "打开 Observed 与 Federated Work。")}</li>
  <li>${c("Trigger and decide a Governed approval.", "触发并处理 Governed 审批。")}</li>
  <li>${c("Request a credential renewal in Usage & Billing.", "在用量与计费中提交 Credential 续期。")}</li></ol></section>`);
}
