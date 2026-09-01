import type { PublicDemoPortfolioSnapshot } from "../public-demo-client.ts";

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
})[character]!);

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;
const technicalValue = (value: string): string =>
  `<span data-technical-value>${escapeHtml(value).replaceAll("_", "_<wbr>")}</span>`;
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
      <div><h1>${title}</h1><p>${description}</p></div>
      ${badge(c("DEMO FIXTURE · NO EXTERNAL CALLS", "演示数据 · 无外部调用"), "demo")}
    </header>`;

  if (section === "agents") {
    const managedCount = snapshot.agents.filter(({ managementDepth }) => managementDepth === "GOVERNED").length;
    const agentRows = snapshot.agents.map((agent) => `
      <button class="portfolio-agent-card" type="button" data-demo-agent-detail="${escapeHtml(agent.id)}" aria-haspopup="dialog">
        <span class="portfolio-agent-identity"><span class="portfolio-agent-monogram" aria-hidden="true">AI</span><span><span class="family-kicker">${escapeHtml(agent.agentClass.replaceAll("_", " "))}</span>
        <strong>${escapeHtml(agent.displayName)}</strong><small>${c("Accountable human", "真人负责人")}: ${escapeHtml(agent.accountableHumanId ?? c("Gap", "缺口"))}</small></span></span>
        <span class="portfolio-agent-state"><span class="portfolio-health-dot${agent.connectorHealth === "HEALTHY" ? " is-healthy" : ""}" aria-hidden="true"></span><span><small>${c("Current state", "当前状态")}</small><strong>${technicalValue(agent.lifecycleStatus)}</strong></span></span>
        <span class="portfolio-agent-boundary"><span>${badge(agent.managementDepth, "depth")}</span><small>${c("Open management boundary", "查看管理边界")}</small></span>
      </button>`).join("");
    const agentDrawers = snapshot.agents.map((agent) => `<dialog class="portfolio-agent-dialog family-overlay family-drawer" data-demo-agent-detail-dialog="${escapeHtml(agent.id)}" aria-labelledby="demo-agent-title-${escapeHtml(agent.id)}">
      <header><span class="portfolio-agent-monogram portfolio-agent-monogram--large" aria-hidden="true">AI</span><div><p class="family-kicker">${escapeHtml(agent.agentClass.replaceAll("_", " "))}</p><h2 id="demo-agent-title-${escapeHtml(agent.id)}">${escapeHtml(agent.displayName)}</h2><p>${c("Accountable human", "真人负责人")}: ${escapeHtml(agent.accountableHumanId ?? c("Gap", "缺口"))}</p></div><button class="family-overlay-close" type="button" data-detail-close aria-label="${c("Close Agent details", "关闭 Agent 详情")}">×</button></header>
      <div class="portfolio-agent-detail-body"><section><p class="family-kicker">${c("OPERATING STATE", "运行状态")}</p><div class="portfolio-detail-status">${badge(agent.lifecycleStatus, agent.lifecycleStatus === "ACTIVE" ? "healthy" : "")}${badge(agent.connectorHealth, agent.connectorHealth === "HEALTHY" ? "healthy" : "")}${badge(agent.managementDepth, "depth")}</div></section>
      <dl><div><dt>${c("Execution owner", "执行归属")}</dt><dd>${technicalValue(agent.executionOwner)}</dd></div><div><dt>${c("Work visibility", "任务可见性")}</dt><dd>${technicalValue(agent.workVisibility)}</dd></div><div><dt>${c("Privacy boundary", "隐私边界")}</dt><dd>${technicalValue(agent.privacyBoundary)}</dd></div><div><dt>${c("Runtime reference", "运行环境引用")}</dt><dd>${escapeHtml(agent.runtimeReference ?? "—")}</dd></div><div><dt>${c("Provider reference", "提供方引用")}</dt><dd>${escapeHtml(agent.providerReference ?? "—")}</dd></div><div><dt>${c("Connector", "Connector")}</dt><dd>${escapeHtml(agent.source.connectorId ?? "—")}</dd></div><div><dt>${c("Permissions", "权限")}</dt><dd>${agent.permissionIds.length ? agent.permissionIds.map(escapeHtml).join(", ") : "—"}</dd></div><div><dt>${c("Data authorizations", "数据授权")}</dt><dd>${agent.dataAuthorizationIds.length ? agent.dataAuthorizationIds.map(escapeHtml).join(", ") : "—"}</dd></div></dl>
      <p class="profile-boundary-note">${c("Demo fixture · read-only · no model, credential, or external system is opened", "演示数据 · 只读 · 不会打开模型、凭据或外部系统")}</p></div></dialog>`).join("");
    return `${heading(c("Agents", "Agents"), c(
      "One inventory across Personal, Shared, and Federated Agents—with the actual management boundary visible.",
      "统一管理个人、共享与联邦 Agent，并明确展示 ANC 的实际管理边界。",
    ))}
    <section class="portfolio-agent-summary" aria-label="${c("Agent portfolio summary", "Agent 资产概况")}"><div><span>${snapshot.agents.length}</span><small>${c("Agents recorded", "已登记 Agent")}</small></div><div><span>${managedCount}</span><small>${c("Governed by ANC", "由 ANC 治理")}</small></div><p>${c("Identity and operating state lead each row. Open an Agent to inspect runtime, visibility, privacy, permission, and data boundaries.", "列表先展示身份与运行状态；打开 Agent 后再查看运行环境、可见性、隐私、权限与数据边界。")}</p></section>
    <section class="portfolio-agent-grid" aria-label="${c("Agents", "Agent 列表")}">${agentRows}</section>${agentDrawers}`;
  }

  if (section === "work") {
    return `${heading(c("Work across sources", "跨来源任务"), c(
      "Observed and Federated records return to their source. Governed work alone claims ANC-enforced authority.",
      "Observed 与 Federated 任务返回原系统；只有 Governed 任务声明由 ANC 强制治理。",
    ))}
    <section class="portfolio-workspace"><div class="portfolio-work-main"><section class="portfolio-work-summary"><div><p class="family-kicker">${c("SOURCE-AWARE WORK", "来源感知任务")}</p><h2>${c("Cross-source execution register", "跨来源执行台账")}</h2><p>${c("Source, revision, evidence, result and cost remain visible without overstating ANC authority.", "集中核对来源、版本、证据、结果与成本，同时不夸大 ANC 的治理权限。")}</p></div><dl><div><dt>${c("Records", "任务记录")}</dt><dd>${snapshot.work.length}</dd></div><div><dt>Observed</dt><dd>${snapshot.work.filter(({ mode }) => mode === "OBSERVED").length}</dd></div><div><dt>Federated</dt><dd>${snapshot.work.filter(({ mode }) => mode === "FEDERATED").length}</dd></div></dl></section>
    <section class="portfolio-work-list" aria-label="${c("Cross-source work", "跨来源任务")}">${snapshot.work.map((work) => `
      <article class="portfolio-work-row"><div class="portfolio-work-identity">${badge(work.mode, "depth")}
      <h3>${escapeHtml(work.title)}</h3><p>${escapeHtml(work.summary)}</p></div>
      <dl><div><dt>${c("Agent", "执行 Agent")}</dt><dd>${escapeHtml(work.agentId)}</dd></div><div><dt>${c("Source revision", "来源版本")}</dt><dd>${work.sourceRevision}</dd></div><div><dt>${c("Evidence", "证据")}</dt><dd>${work.evidenceReferences.length}</dd></div><div><dt>${c("Result", "结果")}</dt><dd>${escapeHtml(work.resultReference ?? "—")}</dd></div></dl>
      <div class="portfolio-work-outcome">${badge(work.status, work.status === "COMPLETED" ? "healthy" : "")}<strong>${money(work.costCents)}</strong>
      ${work.source.returnUrl ? `<a class="family-button family-button--secondary" href="${escapeHtml(work.source.returnUrl)}" target="_blank" rel="noreferrer">${c("Open source fixture", "打开来源演示")}</a>` : ""}</div></article>`).join("")}</section></div>
      <aside class="portfolio-work-boundary"><p class="family-kicker">${c("AUTHORITY BOUNDARY", "治理边界")}</p><h3>${c("The source still owns execution", "执行权仍属于来源系统")}</h3><p>${c("Observed records expose bounded summaries. Federated records synchronize references. Neither becomes ANC-governed work by being visible here.", "Observed 记录只提供有限摘要；Federated 记录只同步引用。两者不会因为在此可见就变成 ANC Governed 任务。")}</p><dl><div><dt>Observed</dt><dd>${c("Return to channel or source thread", "返回频道或来源线程")}</dd></div><div><dt>Federated</dt><dd>${c("Return to external workspace", "返回外部工作空间")}</dd></div><div><dt>Governed</dt><dd>${c("ANC enforces the recorded action boundary", "由 ANC 强制执行已记录的操作边界")}</dd></div></dl></aside>
    </section>`;
  }

  if (section === "approvals") {
    const governed = snapshot.governed;
    return `${heading(c("Approvals", "审批"), c(
      "Only actions that ANC actually governs appear here.",
      "这里只处理 ANC 真正能够治理的高风险动作。",
    ))}
    <section class="portfolio-approval-workspace">
      <div class="portfolio-approval-subject"><header><div><p class="family-kicker">${c("GOVERNED WORKFLOW", "GOVERNED 工作流")}</p>
      <h2>${c("Send customer quotations in bulk", "批量向客户发送报价")}</h2>
      <p>${c("The high-risk action pauses with a human owner, data scope, evidence, and exact approval binding.", "高风险动作会暂停，并绑定真人负责人、数据范围、证据与精确审批。")}</p></div>${badge(governed.phase, governed.phase === "APPROVED" ? "healthy" : "depth")}</header>
      <section class="portfolio-approval-binding" aria-labelledby="approval-binding-title"><div><p class="family-kicker">${c("EXACT DECISION BINDING", "精确决策绑定")}</p><h3 id="approval-binding-title">${c("This decision applies only to the action below", "本次决策仅适用于下方操作")}</h3></div><dl><div><dt>${c("Action", "操作")}</dt><dd>${c("Send customer quotations in bulk", "批量向客户发送报价")}</dd></div><div><dt>${c("Approval request", "审批请求")}</dt><dd>${escapeHtml(governed.approvalRequestId ?? "—")}</dd></div><div><dt>${c("Evidence binding", "证据绑定")}</dt><dd>${governed.evidenceReferences.length} ${c("deterministic references", "条确定性引用")}</dd></div><div><dt>${c("Recorded cost", "已记录成本")}</dt><dd>${money(governed.costCents)}</dd></div></dl></section>
      <footer class="portfolio-decision-footer"><p>${c("The authoritative result is recorded after the Demo service accepts the decision.", "Demo 服务接受决策后，权威结果才会写入记录。")}</p><div class="task-actions">${governed.phase === "READY"
        ? `<button class="family-button family-button--primary" type="button" data-demo-trigger-governed>${c("Trigger governed workflow", "触发 Governed 工作流")}</button>`
        : governed.phase === "AWAITING_APPROVAL"
        ? `<button class="family-button family-button--secondary" type="button" data-demo-open-evidence>${c("Review evidence", "查看证据")}</button><button class="family-button family-button--primary" type="button" data-demo-decision="APPROVED">${c("Approve", "批准")}</button><button class="family-button family-button--danger" type="button" data-demo-open-reject>${c("Reject", "拒绝")}</button>`
        : badge(governed.phase, governed.phase === "APPROVED" ? "healthy" : "")}</div></footer></div>
      <aside class="portfolio-approval-context"><section><p class="family-kicker">${c("WHY IT PAUSED", "暂停原因")}</p><h3>${c("Human accountability remains explicit", "真人责任保持明确")}</h3><p>${c("The decision is bound to one governed action, not a reusable permission or blanket approval.", "这项决策只绑定一个 Governed 操作，不会变成可复用权限或一揽子授权。")}</p></section><section><p class="family-kicker">${c("EVIDENCE", "证据")}</p><strong>${governed.evidenceReferences.length}</strong><p>${c("Read-only deterministic references are available for inspection.", "可查看只读的确定性证据引用。")}</p></section></aside>
    </section>${governed.evidenceReferences.length ? `<dialog class="evidence-detail-dialog family-overlay family-drawer" data-demo-evidence-dialog aria-labelledby="demo-evidence-title"><header><div><p class="family-kicker">${c("EXACT APPROVAL BINDING", "精确审批绑定")}</p><h2 id="demo-evidence-title">${c("Evidence references", "证据引用")}</h2></div><button class="family-overlay-close" type="button" data-detail-close aria-label="${c("Close evidence", "关闭证据")}">×</button></header><div class="evidence-detail-body"><p>${c("These deterministic references are bound to this governed action. No external file or enterprise system is opened.", "这些确定性引用已绑定当前 Governed 操作；不会打开外部文件或企业系统。")}</p><dl>${governed.evidenceReferences.map((reference, index) => `<div><dt>${c(`Evidence ${index + 1}`, `证据 ${index + 1}`)}</dt><dd><code>${escapeHtml(reference)}</code></dd></div>`).join("")}</dl><p class="profile-boundary-note">${c("Demo fixture · read-only · no external calls", "演示数据 · 只读 · 无外部调用")}</p></div></dialog>` : ""}${governed.phase === "AWAITING_APPROVAL" ? `<dialog class="portfolio-reject-dialog editor-dialog family-overlay family-modal family-modal--confirm" data-demo-reject-dialog aria-labelledby="demo-reject-title"><form method="dialog" data-demo-reject-form><header><div><p class="family-kicker">${c("DANGEROUS DECISION", "高影响决策")}</p><h2 id="demo-reject-title">${c("Reject this approval", "拒绝本次审批")}</h2></div><button class="family-overlay-close" type="button" data-editor-close aria-label="${c("Close rejection", "关闭拒绝确认")}">×</button></header><p>${c("The governed action will remain blocked and the rejection will become the authoritative Demo result for this request.", "该 Governed 操作将保持阻止状态，本次拒绝会成为该请求在 Demo 中的权威结果。")}</p><div class="portfolio-renewal-target"><span>${c("Action", "操作")}</span><strong>${c("Send customer quotations in bulk", "批量向客户发送报价")}</strong>${badge(governed.phase, "depth")}</div><footer><button class="family-button family-button--secondary" type="button" data-editor-close data-demo-reject-cancel>${c("Cancel", "取消")}</button><button class="family-button family-button--danger" type="submit">${c("Reject", "拒绝")}</button></footer></form></dialog>` : ""}`;
  }

  if (section === "connectors") {
    const depthCounts = ["INVENTORY", "OBSERVED", "GOVERNED", "FEDERATED"].map((depth) => ({
      depth,
      count: snapshot.agents.filter((agent) => agent.managementDepth === depth).length,
    }));
    return `${heading(c("Governance", "治理"), c(
      "Identity, data, credential references, Connector health, management depth, and external sync.",
      "统一管理身份、数据、Credential 引用、Connector 健康、管理深度与外部同步。",
    ))}
    <section class="portfolio-governance-workspace"><div class="portfolio-governance-subject"><div><p class="family-kicker">${c("MANAGEMENT DEPTH", "管理深度")}</p><h2>${c("One inventory, four explicit authority levels", "一套清单，四种明确治理深度")}</h2><p>${c("The interface distinguishes what Company OS can inventory, observe, govern, or only reference from a federated source.", "界面明确区分 Company OS 能够登记、观察、治理或只能引用的联邦来源。")}</p></div><dl>${depthCounts.map(({ depth, count }) => `<div><dt>${depth}</dt><dd>${count}</dd></div>`).join("")}</dl></div>
    <div class="portfolio-governance-grid">
      <article><p class="family-kicker">${c("CAPABILITY TRUTH", "能力真实性")}</p><h3>${c("No invented task control", "不虚构任务控制能力")}</h3><p>${c(
        "Inventory Connectors do not claim task control. Federated sources synchronize references without ANC execution.",
        "Inventory Connector 不声明任务控制；Federated 来源只同步引用，不经 ANC 执行。",
      )}</p><div class="portfolio-badge-row">${badge("INVENTORY")}${badge("OBSERVED")}${badge("GOVERNED")}${badge("FEDERATED")}</div></article>
      <article><p class="family-kicker">${c("PERSONAL PRIVACY", "个人隐私")}</p><h3>${c("Private activity stays excluded", "私人活动保持排除")}</h3><p>${c(
        "No private conversations, local files, sessions, or reasoning are present.",
        "不包含私人对话、本地文件、Session 或私有推理。",
      )}</p><div class="portfolio-badge-row">${badge("PRIVATE_ACTIVITY_EXCLUDED", "healthy")}</div></article>
      <article><p class="family-kicker">${c("EXTERNAL SYNC", "外部同步")}</p><h3>${c("References, not a live connection", "仅引用，不代表实时连接")}</h3><p>${c(
        "The workspace and Run below are deterministic reference data, not a live platform connection.",
        "下方 Workspace 与 Run 是确定性参考数据，不代表真实平台连接。",
      )}</p><div class="portfolio-badge-row">${badge("DEMO_FIXTURE")}</div></article>
    </div></section>`;
  }

  if (section === "usage") {
    const subscriptionCost = snapshot.commercial.subscriptions.reduce((sum, item) => sum + item.periodCostCents, 0);
    const renewalDialogs = snapshot.commercial.credentials.map((item) => `<dialog class="portfolio-renewal-dialog editor-dialog family-overlay family-modal" data-demo-renewal-dialog="${escapeHtml(item.id)}" aria-labelledby="renewal-title-${escapeHtml(item.id)}"><form method="dialog" data-demo-renewal-form="${escapeHtml(item.id)}"><header><div><p class="family-kicker">${c("CREDENTIAL RENEWAL", "CREDENTIAL 续期")}</p><h2 id="renewal-title-${escapeHtml(item.id)}">${c("Request renewal", "申请续期")}</h2></div><button class="family-overlay-close" type="button" data-editor-close aria-label="${c("Close renewal", "关闭续期")}">×</button></header><p>${c("This Demo request records a renewal intent only. It does not expose or rotate a credential.", "这项 Demo 操作只记录续期意图，不会显示或轮换任何凭据。")}</p><div class="portfolio-renewal-target"><span>${c("Credential reference", "Credential 引用")}</span><strong>${escapeHtml(item.id)}</strong>${badge(item.status, item.status === "VALID" ? "healthy" : "depth")}</div><label class="company-field">${c("Reason", "续期原因")}<textarea class="company-form-control" name="reason" required maxlength="500" rows="4">${c("Renew before the exhibition demo.", "在展会演示前完成续期。")}</textarea></label><footer><button class="family-button family-button--secondary" type="button" data-editor-close>${c("Cancel", "取消")}</button><button class="family-button family-button--primary" type="submit">${c("Submit request", "提交申请")}</button></footer></form></dialog>`).join("");
    return `${heading(c("Usage & Billing", "用量与计费"), c(
      "Subscriptions, seats, quotas, renewal dates, credential status, allocation, and exceptions.",
      "统一展示订阅、席位、额度、续费日期、Credential 状态、成本分摊与异常。",
    ))}
    <section class="portfolio-usage-workspace"><div class="portfolio-usage-main"><section class="portfolio-usage-summary"><div><p class="family-kicker">${c("CURRENT COST BOUNDARY", "当前成本边界")}</p><strong>${money(subscriptionCost)}</strong><p>${c("Recorded subscription cost for the deterministic Demo period", "确定性 Demo 周期内记录的订阅成本")}</p></div><dl><div><dt>${c("Subscriptions", "订阅")}</dt><dd>${snapshot.commercial.subscriptions.length}</dd></div><div><dt>${c("Credential alerts", "Credential 提醒")}</dt><dd>${expiring}</dd></div><div><dt>${c("Renewal requests", "续期申请")}</dt><dd>${snapshot.commercial.renewals.length}</dd></div></dl></section>
      <section class="portfolio-subscription-list"><header><div><p class="family-kicker">${c("SUBSCRIPTIONS", "订阅")}</p><h2>${c("Seats, quota, and renewal dates", "席位、额度与续费日期")}</h2></div></header>${snapshot.commercial.subscriptions.map((item) => `<article><div><h3>${escapeHtml(item.id)}</h3><p>${item.seatCount} ${c("seat", "席位")} · ${item.quotaUnits.toLocaleString()} ${item.quotaUnit}</p></div><div><strong>${money(item.periodCostCents)}</strong><small>${c("Renews", "续费日")} ${escapeHtml(item.renewalAt)}</small></div></article>`).join("")}</section></div>
      <aside class="portfolio-credential-panel"><header><p class="family-kicker">${c("CREDENTIAL STATUS", "CREDENTIAL 状态")}</p><h2>${c("Renewal stays reference-only", "续期仅处理引用状态")}</h2><p>${c("Company OS records the request without exposing a secret value.", "Company OS 只记录申请，不会显示任何 Secret 值。")}</p></header>${snapshot.commercial.credentials.map((item) => `<article><div><h3>${escapeHtml(item.id)}</h3><p>${escapeHtml(item.policyStatus)} · ${c("reference only", "仅引用")}</p></div>${badge(item.status, item.status === "VALID" ? "healthy" : "depth")}<button class="family-button family-button--secondary" type="button" data-demo-renewal-target="${escapeHtml(item.id)}">${c("Request renewal", "申请续期")}</button></article>`).join("")}${snapshot.commercial.renewals.map((item) => `<article class="portfolio-renewal-record"><div><p class="family-kicker">${c("RENEWAL REQUEST", "续期申请")}</p><h3>${escapeHtml(item.targetId)}</h3><p>${escapeHtml(item.reason)}</p></div>${badge(item.status)}</article>`).join("")}</aside>
    </section>${renewalDialogs}`;
  }

  const managementDepths = ["INVENTORY", "OBSERVED", "GOVERNED", "FEDERATED"] as const;
  const depthCounts = managementDepths.map((depth) => ({
    depth,
    count: snapshot.agents.filter((agent) => agent.managementDepth === depth).length,
  }));
  const governedCount = depthCounts.find(({ depth }) => depth === "GOVERNED")?.count ?? 0;
  const approvalAttention = snapshot.governed.phase === "AWAITING_APPROVAL" ? 1 : 0;
  const attentionCount = approvalAttention + expiring + snapshot.commercial.renewals.length;
  const evidenceCount = snapshot.work.reduce(
    (sum, work) => sum + work.evidenceReferences.length,
    snapshot.governed.evidenceReferences.length,
  );
  const maxDepthCount = Math.max(snapshot.agents.length, 1);
  const approvalState = snapshot.governed.phase === "AWAITING_APPROVAL"
    ? c("Human decision required", "需要真人决策")
    : c("No decision waiting", "暂无待决策事项");
  return `${heading(c("Agent Portfolio", "Agent 资产组合"), c(
    "Review attention signals, current work, evidence, and recorded cost without replacing Agent runtimes.",
    "集中查看待处理事项、当前任务、证据与已记录成本，不替代 Agent Runtime。",
    ))}
  <section class="portfolio-dashboard-console" aria-label="${c("Control plane snapshot", "控制面快照")}">
    <header class="portfolio-dashboard-toolbar"><div><h2>${c("Attention and current position", "待处理与当前态势")}</h2><p>${c("Start with decisions and exceptions, then inspect the supporting records.", "先处理决策与异常，再检查对应记录。")}</p></div><div class="portfolio-dashboard-toolbar-meta"><details class="portfolio-dashboard-provenance"><summary>${c("Data source", "数据来源")}</summary><div><span>GEN ${snapshot.generation} · REV ${snapshot.revision}</span><span data-technical-value>${escapeHtml(snapshot.provenance)}</span></div></details><div><button class="family-button family-button--secondary" type="button" data-section-target="agents">${c("Agent inventory", "Agent 清单")}</button><button class="family-button family-button--primary" type="button" data-section-target="approvals">${c("Approval queue", "审批队列")}</button></div></div></header>
    <dl class="portfolio-dashboard-kpis">
      <div><dt>${c("Agents", "Agent 总数")}</dt><dd>${snapshot.agents.length}</dd><small>${personalCount} ${c("personal", "个人")} · ${sharedCount} ${c("shared", "共享")}</small></div>
      <div><dt>${c("ANC governed", "ANC 治理")}</dt><dd>${governedCount}</dd><small>${c("of", "占")} ${snapshot.agents.length} ${c("recorded", "项登记")}</small></div>
      <div class="${attentionCount ? "is-attention" : "is-clear"}"><dt>${c("Open signals", "待处理信号")}</dt><dd>${attentionCount}</dd><small>${c("approval, credential, renewal", "审批、凭据、续期")}</small></div>
      <div><dt>${c("Recorded cost", "已记录成本")}</dt><dd>${money(totalCost)}</dd><small>${c("deterministic fixture", "确定性演示记录")}</small></div>
      <div><dt>${c("Evidence refs", "证据引用")}</dt><dd>${evidenceCount}</dd><small>${c("across current work", "覆盖当前任务")}</small></div>
    </dl>
    <div class="portfolio-dashboard-analysis">
      <section class="portfolio-management-coverage"><header><div><h3>${c("Management coverage", "管理覆盖")}</h3></div><span>${snapshot.agents.length} ${c("total", "项")}</span></header><div class="portfolio-coverage-list">${depthCounts.map(({ depth, count }) => `<div><div><strong>${depth}</strong><span>${count}</span></div><progress max="${maxDepthCount}" value="${count}" aria-label="${escapeHtml(depth)} ${count} ${c("of", "共")} ${snapshot.agents.length}"></progress></div>`).join("")}</div><footer>${c("Authority depth is reported from the current inventory; visibility does not imply ANC control.", "治理深度来自当前资产清单；可见并不等于由 ANC 控制。")}</footer></section>
      <section class="portfolio-attention-queue"><header><div><h3>${c("Operational signals", "运维信号")}</h3></div>${badge(`${attentionCount} ${c("open", "待处理")}`, attentionCount ? "depth" : "healthy")}</header><div>
        <button type="button" data-section-target="approvals"><span><strong>${c("Governed decision", "Governed 决策")}</strong><small>${approvalState}</small></span>${badge(snapshot.governed.phase, approvalAttention ? "depth" : "healthy")}</button>
        <button type="button" data-section-target="usage"><span><strong>${c("Credential posture", "Credential 状态")}</strong><small>${expiring ? c(`${expiring} reference alerts`, `${expiring} 项引用提醒`) : c("No expiry alert", "无到期提醒")}</small></span>${badge(expiring ? `${expiring} ALERT` : "CLEAR", expiring ? "depth" : "healthy")}</button>
        <button type="button" data-section-target="usage"><span><strong>${c("Renewal requests", "续期申请")}</strong><small>${snapshot.commercial.renewals.length ? c("Recorded requests require follow-up", "已记录申请需要跟进") : c("No open request", "暂无待处理申请")}</small></span>${badge(`${snapshot.commercial.renewals.length} OPEN`, snapshot.commercial.renewals.length ? "depth" : "healthy")}</button>
      </div></section>
    </div>
    <section class="portfolio-recent-work"><header><div><h3>${c("Recent work", "近期任务")}</h3><p>${c("Execution source, evidence, cost, and status.", "执行来源、证据、成本与状态。")}</p></div><button class="family-button family-button--secondary" type="button" data-section-target="work">${c("Open Work", "打开 Work")}</button></header><div class="portfolio-recent-work-table"><table><thead><tr><th scope="col">${c("Work", "任务")}</th><th scope="col">${c("Mode", "模式")}</th><th scope="col">Agent</th><th class="family-numeric" scope="col">${c("Evidence", "证据")}</th><th class="family-numeric" scope="col">${c("Cost", "成本")}</th><th scope="col">${c("Status", "状态")}</th></tr></thead><tbody>${snapshot.work.map((work) => `<tr><td><strong>${escapeHtml(work.title)}</strong><small data-technical-value>${escapeHtml(work.id)}</small></td><td>${badge(work.mode, "depth")}</td><td><code>${escapeHtml(work.agentId)}</code></td><td class="family-numeric">${work.evidenceReferences.length}</td><td class="family-numeric">${money(work.costCents)}</td><td>${badge(work.status, work.status === "COMPLETED" ? "healthy" : "")}</td></tr>`).join("")}</tbody></table></div></section>
    <footer class="portfolio-dashboard-footnote"><span>${c("Snapshot created", "快照生成于")} ${escapeHtml(snapshot.createdAt)}</span><span>${federatedCount} ${c("federated runtime records", "项联邦 Runtime 记录")}</span></footer>
  </section>`;
}
