# Company OS / ANC 演示证据报告

**版本日期：2026-09-04**
**适用对象：企业客户、合作伙伴、投资人、内部决策者**
**核心定位：Company OS 是 AI 原生公司的控制平面——统一管理人、Agent、身份、权限、审批、工作、证据与责任。**

## 一句话结论

Agent 正在从“聊天工具”进入工作流，但企业采用速度明显快于治理、身份、审计和规模化能力。NIST、欧盟 AI 法案、ISO、MCP 等标准与 ServiceNow、Salesforce、Microsoft、IBM、OpenAI 等产品动作共同证明：企业需要一个跨模型、跨 Agent、跨部署方式的控制层。Company OS 的机会不在于再做一个 Agent，而在于成为所有 Agent 的组织与责任基础设施。

## 使用规则

- **A 级：官方法规、政府、标准、学术/非营利研究。** 可用于核心结论。
- **B 级：大型咨询机构或跨行业调查。** 可用于趋势和市场信号，必须同时说明样本与年份。
- **C 级：厂商调查、产品公告、遥测。** 可用于证明客户痛点或品类形成，不能单独证明 Company OS 优于竞品。
- **D 级：Company OS 自有产品和验收证据。** 可证明“我们已经做到了什么”，不能代替第三方客户案例。
- 预测必须说“预计/预测”；调查关联不能说成因果；全球数据不能直接外推为中国市场份额。

## 10 页演示主线

### 1. AI 已从工具变成数字劳动力

**台上说法：** 企业正在把 AI 从个人助手推进到可执行工作流的 Agent。微软 2025 调查称，82% 的领导者预计未来 12–18 个月使用数字劳动力；McKinsey 报告 23% 的受访组织已在至少一个业务职能规模化 Agent，39% 处于试验阶段。

**证据：** [Microsoft 2025 Work Trend Index](https://news.microsoft.com/en-cee/2025/04/24/microsofts-2025-work-trend-index-report-reveals-the-rise-of-the-frontier-firm-marking-a-new-era-of-workforce-dynamics-2/)（B/C）；[McKinsey State of AI 2025](https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai)（B）。

### 2. 采用很快，但规模化和回报还没跟上

**台上说法：** Stanford 记录的企业 AI 使用率从 2023 年 55% 升至 2024 年 78%，但多数企业报告的成本和收入改善仍较小。IBM 的高管调查称，过去三年只有 25% 的 AI 项目达到预期 ROI。Gartner 预测，到 2027 年底超过 40% 的 Agentic AI 项目会因成本、价值不清或风险控制不足而取消。

**证据：** [Stanford AI Index 2025—Economy](https://hai.stanford.edu/ai-index/2025-ai-index-report/economy%C2%A0)（A/B）；[IBM From AI projects to profits](https://www.ibm.com/thought-leadership/institute-business-value/report/agentic-ai-profits)（C）；[Gartner 2025 prediction](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027)（C，预测）。

### 3. 真正缺的不是模型，而是企业控制平面

**台上说法：** ServiceNow、Salesforce、Microsoft、IBM 和 OpenAI 都在推出“控制塔、命令中心、治理中心、企业 Agent 平台”。这不是单家公司的营销偶然，而是一个正在形成的企业基础设施品类。

**证据：** [ServiceNow AI Control Tower](https://www.servicenow.com/products/ai-control-tower.html)、[Salesforce Agentforce 3 Command Center](https://investor.salesforce.com/news/news-details/2025/Salesforce-Launches-Agentforce-3-to-Solve-the-Biggest-Blockers-to-Scaling-AI-Agents-Visibility-and-Control/default.aspx)、[Microsoft Copilot Control System](https://learn.microsoft.com/en-us/microsoft-365/copilot/copilot-control-system/overview)、[IBM watsonx.governance](https://www.ibm.com/products/watsonx-governance)、[OpenAI Frontier](https://openai.com/business/frontier/)（均为 C；用于品类验证）。

### 4. 多模型、多 Agent、多工具会成为默认状态

**台上说法：** Google 推动 A2A 解决 Agent 之间的跨厂商协作；Anthropic 用 MCP 标准化 Agent 与数据、工具的连接。NIST 2026 年启动 Agent 标准计划，重点就是互操作、安全、身份和授权。企业未来不会只用一个模型或一个 Agent，因此控制层必须供应商中立。

**证据：** [Google A2A](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)、[Anthropic MCP](https://www.anthropic.com/news/model-context-protocol)、[NIST AI Agent Standards Initiative](https://www.nist.gov/artificial-intelligence/ai-agent-standards-initiative)（A/C）。

### 5. Agent 身份与最小权限会成为硬要求

**台上说法：** NIST 零信任原则要求不因网络位置或资产归属而隐式信任；Microsoft Entra 已把 Agent 身份作为独立治理对象；MCP 授权规范明确采用 OAuth 2.1、验证 token audience，并禁止 token passthrough。Agent 必须有自己的身份、授权边界和生命周期。

**证据：** [NIST Zero Trust Architecture](https://www.nist.gov/publications/zero-trust-architecture)、[Microsoft Entra Agent ID](https://learn.microsoft.com/en-us/entra/agent-id/)、[MCP Authorization Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)（A/C）。

### 6. 审批、日志和责任链不是附加功能

**台上说法：** 欧盟 AI 法案对高风险系统提出日志、透明度和人类监督要求；NIST AI RMF 要求在全生命周期治理、测量和管理风险；英国 NCSC 的联合指南强调安全部署、日志和持续监测。能回答“谁授权、Agent 做了什么、依据是什么、结果由谁负责”正在变成企业基础能力。

**证据：** [EU AI Act 正文](https://eur-lex.europa.eu/eli/reg/2024/1689)、[EU Commission AI Act overview](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)、[NIST AI RMF GenAI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence)、[NCSC Secure AI System Development](https://www.ncsc.gov.uk/collection/guidelines-secure-ai-system-development)（A）。

### 7. Shadow AI 已经是现实的数据与访问风险

**台上说法：** IBM 2025 数据泄露研究称，63% 的受访组织尚无成熟 AI 治理政策，五分之一报告过涉及 Shadow AI 的泄露；Cisco 调查中 64% 的隐私和安全专业人士担心敏感信息泄露。Netskope 遥测显示，企业 AI 使用中大量活动仍发生在未受管理的应用里。

**证据：** [IBM Cost of a Data Breach 2025](https://www.ibm.com/reports/data-breach)、[Cisco Data Privacy Benchmark 2025](https://newsroom.cisco.com/c/r/newsroom/en/us/a/y2025/m04/cisco-2025-data-privacy-benchmark-study-privacy-landscape-grows-increasingly-complex-in-the-age-of-ai.html)、[Netskope Shadow AI and Agentic AI 2025](https://www.netskope.com/resources/cloud-and-threat-reports/cloud-and-threat-report-shadow-ai-and-agentic-ai-2025)（B/C）。

### 8. 能力增长很快，但自治必须有边界

**台上说法：** METR 的任务时长研究显示，前沿模型可可靠完成的任务时长在快速增长，但在长任务上可靠性仍明显下降。OpenAI 和 Anthropic 的工程指南都建议对高风险动作保留人工监督、权限边界和检查点。正确路线是“可审计的有界自治”，不是一次性放开所有权限。

**证据：** [METR Measuring AI Ability to Complete Long Tasks](https://metr.org/blog/2025-03-19-measuring-ai-ability-to-complete-long-tasks/)、[OpenAI Practical Guide to Building AI Agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)、[Anthropic Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents)（A/B/C）。

### 9. 中国市场正在同时出现需求、政策和用户基础

**台上说法：** CNNIC 报告 2025 年 12 月中国生成式 AI 用户达到 6.02 亿、普及率 42.8%。国务院“人工智能+”行动明确提出发展“模型即服务”“智能体即服务”和 AI 应用服务链。中国的机会不是是否采用 AI，而是如何把 Agent 安全接入真实组织。

**证据：** [CNNIC 第57次中国互联网络发展状况统计报告发布信息](https://www3.cnnic.cn/n4/2026/0304/c88-11549.html)、[国务院关于深入实施“人工智能+”行动的意见（公报 PDF）](https://www.gov.cn/gongbao/2025/issue_12266/material/gwygb202525.pdf)、[国家网信办《生成式人工智能服务管理暂行办法》](https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm)（A）。

### 10. Company OS 已经把这套原则做成可运行产品

**台上说法：** Company OS 不是模型，也不是另一个聊天窗口；它管理公司、成员、Agent、工作、审批、证据和责任。公开 Demo 可现场演示，代码仓库可核验其供应商中立的分层架构、独立 Demo 边界、OIDC、多租户、故障关闭和发布验收合同。

**证据：** [Company OS / ANC 公开站点与 Demo](https://anc.raft.xin/)、[Company OS GitHub 仓库](https://github.com/ElliottYip/company-os)、[GitHub Actions](https://github.com/ElliottYip/company-os/actions)（D）。

## 核心证据卡

| 可支持的主张 | 关键数字/事实 | 来源级别 | 演示使用提示 |
|---|---|---:|---|
| Agent 将成为数字劳动力 | 82% 领导者预计 12–18 个月内采用数字劳动力；46% 称组织正用 Agent 自动化工作流 | B/C | 说“微软全球调查显示”，不要说“所有企业” |
| Agent 已进入规模化 | 23% 受访组织在至少一个职能规模化，39% 正试验 | B | 与“多数尚未规模化”同时使用，制造真实张力 |
| AI 采用已主流化 | 企业 AI 使用率 78%，生成式 AI 使用率 71% | A/B | 数据为 2024 年调查结果，报告发布于 2025 年 |
| 回报仍不稳定 | 多数受访企业成本节省低于 10%、收入提升低于 5% | A/B | 支持“需要运营系统”，不等于 AI 无价值 |
| 生产率潜力真实 | AI 暴露行业生产率增长显著加速；AI 技能职位工资溢价 56% | B | PwC 基于近 10 亿招聘信息；属于宏观相关性分析 |
| 失败风险真实 | Gartner 预测 2027 年底前超过 40% Agent 项目被取消 | C | 必须明确“预测”及三个原因：成本、价值不清、风控不足 |
| 集中治理与 ROI 相关 | IBM 调查称集中/中心辐射式 AI 运营模式与 36% 更高 ROI 相关 | C | 厂商调查，仅作为方向性证据 |
| 多模型现实 | IBM CAIO 调查称典型组织使用 11 个生成式 AI 模型，预计 2026 年底至少 16 个 | C | 支持供应商中立和统一目录 |
| 数据风险正在发生 | IBM：五分之一组织报告涉及 Shadow AI 的泄露；此类环境平均增加 67 万美元泄露成本 | C | 只说“IBM 受访/研究样本”，避免全球普遍化 |
| AI 事故增加 | Stanford 记录 2024 年 AI 事件 233 起，同比增加 56.4% | A/B | 支持审计、监督和事件响应 |
| 中国用户基础成形 | 2025 年 12 月生成式 AI 用户 6.02 亿，普及率 42.8% | A | CNNIC 官方口径 |
| 政策明确支持智能体服务 | 国务院提出发展“模型即服务”“智能体即服务” | A | 可直接作为中国市场方向信号 |
| 标准正在收敛 | NIST 明确把 Agent 互操作、安全、身份和授权列为重点 | A | 强支撑 Company OS 的技术路线 |

## Company OS 与证据的对应关系

| 外部证据指向的企业需求 | Company OS 的产品回答 | 可展示内容 |
|---|---|---|
| 多模型、多 Agent 碎片化 | 供应商中立 Connector 与端口合同 | 架构图、Agent 资产组合、连接器健康状态 |
| 人与 Agent 身份混淆 | 公司成员、Agent、执行身份分离 | 公司空间、成员/组织、Agent 绑定 |
| 权限过大与凭据泄露 | 最小权限、Secret Broker 引用、控制平面不返回 Secret | 权限页、Secret 空值与故障关闭行为 |
| 高风险动作不可控 | 精确动作审批、暂停/恢复、责任人绑定 | Approval 流程、批准/拒绝、责任链 |
| 无法知道执行了什么 | 工作、尝试、事件、证据与结果引用 | Work 页面、Evidence、审计事件 |
| ROI 无法管理 | 目标、预算、运行状态和结果在同一控制面 | Goal/Work/Run/预算与结果视图 |
| SaaS 与私有部署割裂 | 一套代码、托管云与自托管两种 profile | `/start` 部署选择和运行边界 |
| Demo 与生产容易混用 | 独立 fixture-only Demo runtime 与正式 API 隔离 | 首页 Demo 标签、重置、返回首页、正式公司空间 |

## 竞品与品类信号

这些产品证明“AI 控制平面”正在成为预算类别，但也说明 Company OS 不能只卖一个仪表盘。

| 产品 | 对外定位 | 对 Company OS 的意义 |
|---|---|---|
| ServiceNow AI Control Tower | 管理任何 Agent、模型与工作流的可见性、治理、生命周期和价值 | 品类最直接的验证；Company OS 需强调独立、开放、部署中立 |
| Salesforce Agentforce Command Center | 解决 Agent 扩展时的可见性、控制与可观测性 | 证明 CRM 原生平台也在向控制层扩张 |
| Microsoft Copilot Control System | 安全治理、管理控制、度量报告 | 证明身份/合规/管理是企业采购核心 |
| IBM watsonx.governance | 多模型、多供应商 AI 生命周期与 GRC | 证明混合、多供应商治理是长期需求 |
| OpenAI Frontier / Workspace Agents | 企业 Agent 运行、权限、审计、审批 | 证明模型厂商也在补企业控制层 |
| Microsoft Entra Agent ID | Agent 身份、访问和生命周期治理 | 证明 Agent 将成为一等身份主体 |

**差异化表达：** “我们不是绑定某个模型、CRM、ITSM 或云，而是把公司本身——组织、责任、权限、工作和证据——做成所有 Agent 共用的控制平面。”

## 反对意见与证据回答

### “Microsoft / Salesforce / ServiceNow 最后会把它做完，为什么需要独立产品？”

它们证明了需求，但各自天然优化自己的生态。A2A、MCP 与 NIST 的互操作方向说明企业环境会长期保持多供应商。独立层的价值是统一组织语义、权限、责任和证据，而不把公司事实锁进某个模型或 SaaS。

### “这是不是又一个 Agent 平台？”

不是。Agent 平台负责构建或运行 Agent；Company OS 管理 Agent 为哪家公司、代表谁、能做什么、什么时候必须审批、产出什么证据、由谁负责。它可以连接多个 Agent 平台。

### “AI 的 ROI 还不确定，为什么现在投入？”

正因为 ROI 不确定，企业才需要从零散试点转向组合管理：明确目标、预算、责任、运行状态、证据和停止条件。Stanford、IBM 和 Gartner 的数据都指向“扩展与治理”而不是“再做更多无边界试点”。

### “Agent 还不够可靠。”

Company OS 不假设 Agent 永远正确。METR 的结果支持“能力快速进步、长任务可靠性仍有限”的双重判断；因此使用精确授权、人工检查点、可暂停运行和证据回收。

### “会不会把公司 Secret 都集中到你们那里？”

Company OS 的设计是存引用和摘要，不在控制平面回传 Secret；企业可自持 Secret Broker 和执行节点。对外表达应说“支持这种部署和安全边界”，不要在没有客户安全评估时说“绝对不会泄露”。

## 完整链接库（按可信度与用途整理）

### A. 市场采用、生产率与组织变化

1. [Stanford AI Index 2025—Economy](https://hai.stanford.edu/ai-index/2025-ai-index-report/economy%C2%A0) — 企业采用、投资和财务收益。
2. [Stanford AI Index 2025 完整 PDF](https://hai.stanford.edu/assets/files/hai_ai_index_report_2025.pdf) — 可截图做图表，引用时标注页码。
3. [McKinsey State of AI 2025](https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai) — Agent 规模化与试验比例。
4. [Microsoft 2025 Work Trend Index](https://news.microsoft.com/en-cee/2025/04/24/microsofts-2025-work-trend-index-report-reveals-the-rise-of-the-frontier-firm-marking-a-new-era-of-workforce-dynamics-2/) — 数字劳动力与“Agent boss”。
5. [Microsoft Work Trend Index 方法说明](https://techcommunity.microsoft.com/blog/surfaceitpro/endpoints-and-ai-strategy-lessons-of-the-microsoft-work-trend-index-2025/4462110) — 31 个国家、31,000 名知识工作者及产品信号。
6. [PwC 2025 Global AI Jobs Barometer](https://www.pwc.com/gx/en/news-room/press-releases/2025/ai-linked-to-a-fourfold-increase-in-productivity-growth.html) — 生产率、工资溢价与招聘数据。
7. [PwC 报告 PDF](https://www.pwc.com/gx/en/issues/artificial-intelligence/job-barometer/2025/report.pdf) — 适合引用原图和方法。
8. [WEF Future of Jobs 2025—Jobs outlook](https://www.weforum.org/publications/the-future-of-jobs-report-2025/in-full/2-jobs-outlook/) — 2030 年岗位结构变化。
9. [WEF Future of Jobs 2025—Workforce strategies](https://www.weforum.org/publications/the-future-of-jobs-report-2025/in-full/4-workforce-strategies/) — 63% 将技能缺口视为转型障碍。
10. [IBM From AI projects to profits](https://www.ibm.com/thought-leadership/institute-business-value/report/agentic-ai-profits) — AI ROI 与从项目到利润的转变（厂商调查）。
11. [IBM Chief AI Officers and AI ROI](https://www.ibm.com/thought-leadership/institute-business-value/report/chief-ai-officer) — CAIO、AI 组合管理与多模型现实（厂商调查）。
12. [IBM 2025 CDO Study](https://www.ibm.com/thought-leadership/institute-business-value/c-suite-study/cdo) — 数据、Agent 治理和集中式运营模型（厂商调查）。
13. [Gartner Agentic AI cancellation prediction](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027) — 项目取消预测及原因，必须标“预测”。
14. [Deloitte State of Generative AI in the Enterprise](https://www.deloitte.com/us/en/what-we-do/capabilities/applied-artificial-intelligence/content/state-of-generative-ai-in-enterprise.html) — 风险、监管与数据障碍。
15. [Deloitte Q3 detailed release](https://www.deloitte.com/uk/en/about/press-room/deloitte-ai-institute-state-of-generative-ai-in-the-enterprise-report.html) — 2,770 名领导者、14 国样本。

### B. Agent 治理和控制平面品类

16. [ServiceNow AI Control Tower 产品页](https://www.servicenow.com/products/ai-control-tower.html) — Agent、模型、MCP Server 资产和治理。
17. [ServiceNow AI Control Tower 发布公告](https://newsroom.servicenow.com/press-releases/details/2025/ServiceNow-Launches-AI-Control-Tower-a-Centralized-Command-Center-to-Govern-Manage-Secure-and-Realize-Value-From-Any-AI-Agent-Model-and-Workflow/) — “任何 Agent、模型与工作流”的控制中心。
18. [Salesforce Agentforce 3 Command Center](https://investor.salesforce.com/news/news-details/2025/Salesforce-Launches-Agentforce-3-to-Solve-the-Biggest-Blockers-to-Scaling-AI-Agents-Visibility-and-Control/default.aspx) — 可见性、控制、可观测性与 MCP。
19. [Microsoft Copilot Control System](https://learn.microsoft.com/en-us/microsoft-365/copilot/copilot-control-system/overview) — 安全、管理和度量。
20. [Microsoft Copilot Control System announcement](https://techcommunity.microsoft.com/blog/microsoft365copilotblog/introducing-copilot-control-system/4397248) — 产品方向与企业控制。
21. [IBM watsonx.governance](https://www.ibm.com/products/watsonx-governance) — 混合、多模型、多供应商治理。
22. [OpenAI Frontier](https://openai.com/business/frontier/) — 企业 AI coworker 运行、权限与评估。
23. [OpenAI Workspace Agents](https://openai.com/business/workspace-agents/) — 集中管理、RBAC、审计和审批门槛。
24. [OpenAI Workspace Agents Help](https://help.openai.com/en/articles/20001143) — 最小权限、写操作审批与 Connector 约束。

### C. 身份、权限与互操作标准

25. [NIST AI Agent Standards Initiative](https://www.nist.gov/artificial-intelligence/ai-agent-standards-initiative) — 可信、互操作、安全的 Agent 生态；身份与授权研究。
26. [NIST Zero Trust Architecture](https://www.nist.gov/publications/zero-trust-architecture) — 不做隐式信任、持续认证授权。
27. [NIST SP 800-207A](https://csrc.nist.gov/pubs/sp/800/207/a/final) — 云原生多云环境的身份型访问控制。
28. [NIST Zero Trust Implementation Guide](https://csrc.nist.gov/pubs/sp/1800/35/final) — 19 个参考实现。
29. [Microsoft Entra Agent ID](https://learn.microsoft.com/en-us/entra/agent-id/) — Agent 作为一等身份主体。
30. [Microsoft Entra Agent ID Governance](https://learn.microsoft.com/en-us/entra/id-governance/agent-id-governance-overview) — Agent 身份生命周期与访问治理。
31. [Google Agent2Agent Protocol](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/) — 跨 Agent、跨供应商互操作。
32. [Google A2A v0.3 update](https://cloud.google.com/blog/products/ai-machine-learning/agent2agent-protocol-is-getting-an-upgrade) — 生态扩展和协议演进。
33. [Anthropic Model Context Protocol](https://www.anthropic.com/news/model-context-protocol) — 工具与数据连接的开放标准。
34. [MCP Authorization Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) — OAuth 2.1、audience 验证与禁止 token passthrough。
35. [MCP Base Specification](https://modelcontextprotocol.io/specification/2025-03-26/index) — consent、authorization 与安全责任。
36. [ISO/IEC 42001](https://www.iso.org/standard/42001) — AI 管理体系标准。
37. [ISO AI Management Systems overview](https://www.iso.org/artificial-intelligence/ai-management-systems) — 风险、透明度、可追溯与持续改进。

### D. 安全、可靠性与 Shadow AI

38. [Stanford AI Index 2025—Responsible AI](https://hai.stanford.edu/ai-index/2025-ai-index-report/responsible-ai) — AI 事故与评估采用。
39. [NIST AI RMF GenAI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence) — 全生命周期生成式 AI 风险管理。
40. [NIST AI RMF GenAI Profile PDF](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) — 原始规范。
41. [MITRE ATLAS](https://atlas.mitre.org/) — AI 对抗战术、技术、缓解措施与案例。
42. [OWASP Top 10 for Agentic Applications](https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/) — 目标劫持、工具滥用、身份权限、记忆污染等。
43. [NCSC Guidelines for Secure AI System Development](https://www.ncsc.gov.uk/collection/guidelines-secure-ai-system-development) — 国际联合安全开发指南。
44. [NCSC 指南 PDF](https://www.ncsc.gov.uk/files/Guidelines-for-secure-AI-system-development.pdf) — 可下载原文。
45. [IBM Cost of a Data Breach 2025](https://www.ibm.com/reports/data-breach) — AI 治理、Shadow AI 和泄露成本（厂商研究）。
46. [IBM AI breach press release](https://newsroom.ibm.com/2025-07-30-ibm-report-13-of-organizations-reported-breaches-of-ai-models-or-applications%2C-97-of-which-reported-lacking-proper-ai-access-controls) — AI 访问控制缺口。
47. [Netskope Shadow AI and Agentic AI 2025](https://www.netskope.com/resources/cloud-and-threat-reports/cloud-and-threat-report-shadow-ai-and-agentic-ai-2025) — 未管理应用和数据流遥测。
48. [Netskope Generative AI 2025](https://www.netskope.com/resources/cloud-and-threat-reports/cloud-and-threat-report-generative-ai-2025) — GenAI 使用与 Shadow AI 比例。
49. [Cisco Data Privacy Benchmark 2025](https://newsroom.cisco.com/c/r/newsroom/en/us/a/y2025/m04/cisco-2025-data-privacy-benchmark-study-privacy-landscape-grows-increasingly-complex-in-the-age-of-ai.html) — 2,600 名隐私/安全专业人士调查。
50. [Cisco 报告 PDF](https://www.cisco.com/c/dam/en_us/about/doing_business/trust-center/docs/cisco-privacy-benchmark-study-2025.pdf) — 原始报告。
51. [Cyberhaven 2025 AI Adoption & Risk](https://www.cyberhaven.com/resources/report/2025-ai-adoption-risk-report) — 企业工作流中的敏感数据流（厂商遥测）。
52. [METR long-task capability research](https://metr.org/blog/2025-03-19-measuring-ai-ability-to-complete-long-tasks/) — 能力增长与长任务可靠性边界。
53. [METR Time Horizons](https://metr.org/time-horizons/) — 最新方法与时间序列。
54. [Anthropic Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) — 工作流、Agent、检查点与工程实践。
55. [Anthropic Trustworthy Agents](https://www.anthropic.com/research/trustworthy-agents) — 人类控制、安全交互、透明度与隐私。
56. [OpenAI Practical Guide to Building AI Agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/) — 高风险动作人工监督与 guardrails。

### E. 法规与中国市场

57. [EU AI Act consolidated text](https://eur-lex.europa.eu/eli/reg/2024/1689) — 法律正文，重点 Articles 12–14。
58. [EU AI Act official PDF](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX%3A32024R1689) — 可下载原文。
59. [European Commission AI Act overview](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai) — 当前适用时间线与分类。
60. [CNNIC 2025 年 6 月生成式 AI 用户报告](https://www1.cnnic.cn/n4/2025/1021/c88-11391.html) — 5.15 亿用户、36.5% 普及率。
61. [CNNIC 第57次报告发布信息](https://www3.cnnic.cn/n4/2026/0304/c88-11549.html) — 2025 年 12 月 6.02 亿用户、42.8% 普及率。
62. [国务院“人工智能+”行动意见 PDF](https://www.gov.cn/gongbao/2025/issue_12266/material/gwygb202525.pdf) — “模型即服务”“智能体即服务”和应用服务链。
63. [生成式人工智能服务管理暂行办法](https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm) — 中国生成式 AI 服务治理基础。
64. [国家网信办生成式 AI 服务备案公告](https://www.cac.gov.cn/2024-04/02/c_1713729983803145.htm) — 面向公众服务的备案与信息披露。
65. [国家网信办智能体应用发展治理指引](https://www.cac.gov.cn/2026-05/08/c_1779979789523320.htm) — 智能体全生命周期安全、可靠与可信。
66. [国家统计局 2025 年人工智能产业数据解读](https://www.stats.gov.cn/sj/sjjd/202606/t20260603_1963868.html) — AI 核心产业规模和制造业应用。
67. [国家数据局《数字中国建设2025年行动方案/报告》专题](https://www.nda.gov.cn/sjj/zhuanti/sjzgzxd/szzgbg/0430/20260430104239061752429_pc.html) — AI 应用向智能体升级。

### F. Company OS 自有可验证资产

68. [Company OS / ANC 公开产品与 Demo](https://anc.raft.xin/) — 公开可访问的产品首页和 fixture-only Demo。
69. [Company OS GitHub](https://github.com/ElliottYip/company-os) — 代码、架构、测试和部署合同。
70. [Company OS GitHub Actions](https://github.com/ElliottYip/company-os/actions) — 公开 CI 运行记录（以页面当前显示为准）。

## 现场演示建议

1. 先打开 [ANC 首页](https://anc.raft.xin/)，一句话定义“公司控制平面”。
2. 进入 Demo，展示公司 → Agent 资产 → Work → Approval → Evidence 的闭环。
3. 用“返回首页”回到正式入口，强调 Demo 与生产隔离。
4. 展示 `/start`：客户可选 SaaS 或自托管、可选飞书/其他 OAuth/OIDC/自建身份。
5. 若场合允许，再展示授权公司的 `/leike/`，说明共享域名路径租户和组织身份绑定。
6. 最后用 GitHub 架构和测试合同收尾：Company OS 是可验证基础设施，不是概念片。

## 不应过度声称的内容

- 当前公开 Demo 是 fixture-only，不应称为真实客户数据或真实 Agent 执行。
- 第二家真实公司、第二个真实用户的生产 E2E 尚不能在没有授权身份和数据时声称完成。
- 尚无公开第三方客户案例时，不要声称“已被多家企业采用”。
- 不要把 Gartner 预测、厂商自有调查或遥测说成独立学术事实。
- 不要声称满足所有地区、行业的全部合规要求；应说“提供支持治理与审计所需的基础控制”。
- 不要把“可自托管、Secret 不回传控制平面”的设计说成无条件安全保证，仍需客户环境评估。

## 最精炼的结尾

“模型越来越强，但企业真正缺的是让它们合法、安全、可控地工作。Company OS 把每个 Agent 放回真实公司结构里：有身份、有权限、有负责人、有审批、有证据。我们不是替企业选择某个 AI；我们让企业能够同时使用所有 AI，而不失去控制。”
