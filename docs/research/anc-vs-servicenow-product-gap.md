# ANC 与 ServiceNow AI Control Tower 产品差距分析

状态：调研基线
日期：2026-09-04
对比对象：Company OS · Agent Network Control（ANC）与 ServiceNow AI Control Tower

## 1. 执行摘要

ANC 与 ServiceNow AI Control Tower 处于同一个“企业 AI 控制层”赛道，但两者当前的产品重心不同：

- ServiceNow 以企业 AI 资产、风险合规、运行观测和既有工作流平台为中心。
- ANC 以公司组织、真人责任、跨平台 Agent、精确审批、执行证据和责任闭环为中心。

ANC 并非缺少治理基础。它已经具备多类型 Agent 资产、治理深度、真人负责人、责任合同、动作策略、数据授权、审批、暂停/恢复、证据、成本和预算等核心合同。当前最明显的差距集中在三层：

1. **资产范围**：尚未把模型、Prompt、数据集、MCP Server、工具和 Agent 统一为一套 AI 资产图谱。
2. **运行观测与评估**：尚未形成 Session、Trace、Span 级质量、安全、延迟和行为评估体系。
3. **自动处置闭环**：已有策略拒绝和 Agent 暂停能力，但尚未形成“检测异常—解释关系—自动暂停—创建事件—分派责任人—复核恢复”的完整体验。

因此，ANC 下一阶段不应复制 ServiceNow 的完整界面或庞大模块，而应优先把现有底层能力串成一个可观察、可执行、可演示的 Agent 运行治理闭环。

## 2. 调研范围与证据边界

本分析使用以下证据：

- [NVIDIA GTC 2026：Build Trust at Scale: Governing AI Across Your Enterprise](https://www.nvidia.com/en-us/on-demand/session/gtc26-s82114/)
- [ServiceNow AI asset inventory](https://www.servicenow.com/docs/r/intelligent-experiences/ai-control-tower/ai-inventory.html)
- [Managing your AI asset inventory](https://www.servicenow.com/docs/r/zurich/intelligent-experiences/disc-ai-asset-inventory.html)
- [Using the Access Map](https://www.servicenow.com/docs/r/intelligent-experiences/ai-control-tower/using-the-access-map.html)
- [Security & privacy tab](https://www.servicenow.com/docs/r/intelligent-experiences/ai-control-tower/security-privacy-tab.html)
- [How evaluation scoring works](https://www.servicenow.com/docs/r/intelligent-experiences/mon-ai-how-evaluation-scoring-works.html)
- [AI cases](https://www.servicenow.com/docs/r/intelligent-experiences/ac-ai-cases.html)
- [Value dashboard](https://www.servicenow.com/docs/r/zurich/intelligent-experiences/measure-aict-value-insights.html)
- [AI strategy tab](https://www.servicenow.com/docs/r/intelligent-experiences/ai-strategy-ai-control-tower.html)
- [ServiceNow 2026 AI Control Tower expansion announcement](https://newsroom.servicenow.com/press-releases/details/2026/ServiceNow-expands-AI-Control-Tower-to-discover-observe-govern-secure-and-measure-AI-deployed-across-any-system-in-the-enterprise/default.aspx)
- ANC 当前公开 Demo、正式产品页面和本仓库内的正式产品合同。

证据限制：

- GTC 视频包含前瞻性声明，演示数据和界面不能自动视为所有客户当时已经可用的正式功能。
- ServiceNow 官方公告说明，部分 2026 年增强能力按滚动节奏提供，并可能依赖额外许可证、插件和配置。
- ServiceNow 演示中的资产数量、收入、成本、风险和质量数字属于演示内容，不作为客户实际效果证据。
- ANC Demo 使用明确标记的确定性演示数据；它证明交互和产品合同，不代表真实生产 Agent、成本或外部平台调用。

## 3. ServiceNow 视频中展示的核心产品链

| 视频时间 | 展示内容 | 产品意义 |
|---|---|---|
| 25:34 | AI 总览，按模型、技能、Agent、工具、数据集和 Prompt 汇总资产 | 从 Agent 管理扩展到完整 AI 资产管理 |
| 26:00 | AI 战略、目标、Target、项目及进度 | 把 AI 投资与企业战略关联 |
| 26:36 | Steward review、批准、构建测试、部署等生命周期状态 | 建立 AI 资产准入与发布治理 |
| 27:06 | 成本、净价值、节省工时、采用率、CSAT | 同时管理 AI 成本和业务收益 |
| 27:45 | 系统、模型、数据集的风险与合规分布 | 将技术资产映射到风险框架和政策 |
| 28:33 | 单 Agent 的质量、幻觉率、合规、风险、ROI、Token 成本 | 把资产、运行表现和价值合并到一个详情页 |
| 28:46 | HR Data Sync Agent 安全告警 | 从静态盘点进入运行时风险检测 |
| 28:53 | 告警原因、风险等级、被触发的政策 | 给出可解释的异常原因 |
| 29:23 | Agent—Workflow—Tool—数据表 Access Map | 展示实际访问路径和越权操作 |
| 29:31 | 助手建议暂停 Agent | 把观察转成治理动作 |
| 29:35 | Agent 被暂停，并自动创建、路由安全事件 | 形成检测、控制、处置和责任闭环 |

这段演示最重要的不是某张仪表盘，而是以下闭环：

```text
运行信号
  → 风险识别
  → 访问关系解释
  → Agent 暂停/停止
  → 安全事件或治理任务
  → 分派真人负责人
  → 修复、复核、恢复
```

## 4. ANC 已经具备的能力

### 4.1 Agent 资产与管理边界

ANC 已经支持：

- Personal、Shared、Federated Runtime 三类 Agent。
- Inventory、Observed、Governed、Federated 四种治理深度。
- Agent 的提供方、Runtime、Connector、权限、数据授权和同步来源。
- 个人 Agent 私人活动排除、外部来源只读引用和 ANC 治理执行三种不同边界。

对应实现：

- `core/agent-portfolio.ts`
- `application/manage-agent-portfolio.ts`
- `application/formal-agent-portfolio-api.ts`
- `web/pages/agent-portfolio-pages.ts`

### 4.2 真人责任和公司组织

ANC 已经支持：

- Agent 必须关联真人负责人。
- 责任合同与责任转交。
- 公司、部门、岗位、汇报关系和 Agent 组织位置。
- 任务、目标、项目和责任范围关联。

这是 ANC 相比大多数 Agent Builder 和模型平台更清晰的差异化。

### 4.3 权限、审批和数据治理

ANC 已经支持：

- Tool Profile 和 Tool Policy。
- Allow、Block、Require Approval、Rate Limit 等策略类型。
- 高风险动作精确绑定一次审批。
- 数据源、Agent、操作、用途、分类、导出目的地和有效期约束。
- 模型路由、数据分类、驻留方式和 Credential 引用约束。
- Secret 只通过引用和短期租约使用，不返回浏览器。

对应实现：

- `core/tool-access.ts`
- `core/data-governance.ts`
- `core/model-governance.ts`
- `application/decide-high-risk-action.ts`
- `application/prepare-work-execution.ts`

### 4.4 执行、生命周期与证据

ANC 已经支持：

- Agent 批准、暂停、恢复、清除错误和终止。
- 手工、预算和系统三类暂停原因。
- Work Attempt、Connector Observation、证据摘要和结果引用。
- 高风险操作触发等待审批，并在审批后恢复或取消。
- 结构化活动、审计事件和责任账本。

对应实现：

- `core/agent-lifecycle.ts`
- `application/collect-connector-observations.ts`
- `application/work-attempt-service.ts`
- `application/get-accountability-ledger.ts`

### 4.5 成本与商业治理

ANC 已经支持：

- Token、运行次数、额度、订阅和固定成本等计费类型。
- 按 Agent、真人、部门和提供方进行成本归因。
- Credential 有效、过期、撤销和合规状态。
- 续期申请、预算策略、预警阈值和硬停止。
- 对未定价用量保持显式未知，不虚构金额。

对应实现：

- `core/agent-commercial-governance.ts`
- `core/usage-budget.ts`
- `application/ingest-connector-usage.ts`
- `application/manage-usage-budget.ts`

## 5. 产品差距矩阵

| 能力域 | ServiceNow AI Control Tower | ANC 当前状态 | 差距判断 |
|---|---|---|---|
| Agent 资产清单 | 支持内部和第三方 Agent/AI system | 已有 Personal、Shared、Federated Agent 资产 | 已有基础 |
| 全类型 AI 资产 | 统一管理 Agent、模型、Prompt、数据集、MCP Server 等 | 模型路由、数据合同、工具和 Agent 分散在不同领域对象中 | 明显缺失 |
| 自动资产发现 | Connector、云平台、Trace 和手工导入 | 有 Connector 和联邦同步合同，缺少 Trace 自动发现 | 明显缺失 |
| 重复与 Shadow AI | 重复资产分组、人工确认、Shadow AI 管理 | 尚无统一重复检测和 Shadow AI 工作流 | 缺失 |
| 统一资产关系图 | 关联资产、业务应用、负责人和依赖 | 有组织、任务和责任关系，但缺少统一 AI 资产依赖图 | 部分具备 |
| 运行观测 | 持续指标、告警、Trace 和行为分析 | 有有序 Connector Observation 和状态变化 | 部分具备 |
| 质量与安全评估 | Session、Trace、Span 级评估和组合评分 | 尚无通用评估模板、评测集和评分引擎 | 核心缺失 |
| Agent 详情指标 | 质量、幻觉、安全、合规、ROI、成本 | 有状态、健康、治理深度、权限、数据授权和成本 | 部分具备 |
| Access Map | Agent—Workflow—Tool—Resource 图，含访问记录和失败次数 | 有声明式权限和数据合同，没有运行时访问图 | 核心缺失 |
| 策略执行 | 可发现越权并实时停止 Agent | 可拒绝工具/数据动作，也可暂停 Agent | 执行基础已有 |
| 自动风险处置 | 告警、解释、暂停、Case、分派和修复 | 各能力分散，尚未形成自动闭环 | 核心缺失 |
| Agent 生命周期 | Intake、评估、构建测试、部署、监控、退役 | Agent 有请求、活动、暂停、错误、退役/终止状态 | 部分具备 |
| 其他资产生命周期 | 模型、Prompt、数据集也进入治理生命周期 | 尚未统一覆盖 | 缺失 |
| 风险与合规 | NIST、EU AI Act、风险评估、控制、Attestation | 有模型、数据、工具和导出策略 | 部分具备 |
| AI Case | 事件、根因、后果、修复、预防和事后复核 | 有任务、审批、证据和活动，没有 AI Case 领域模型 | 缺失 |
| 成本治理 | Token、模型成本、趋势和异常 | 已有经验证的成本、预算和硬停止 | 较接近 |
| 价值与 ROI | 节省工时、采用率、质量修正价值、净收益 | 有成本，没有收益和价值公式 | 明显缺失 |
| AI 战略 | 战略优先级、目标、Target、投资项、RIDAC | 有公司目标、项目和责任范围 | 部分具备 |
| 自然语言查询 | 查询资产、风险、许可证和异常 | 有搜索/命令入口，不是资产语义问答 | 缺失 |
| 企业集成生态 | 大量云、ERP、HR、模型和安全集成 | 有厂商中立 Connector SDK，实际适配器数量较少 | 生态差距 |
| 部署中立性 | 以 ServiceNow 平台和许可证组合为中心 | 同一代码库支持托管和独立部署 | ANC 优势 |
| 真人责任 | 资产 Owner 和 Steward | 责任合同、负责人、替补、转交、精确审批 | ANC 更深入 |
| 跨来源工作治理 | 依赖 ServiceNow 工作流体系 | 明确区分 Observed、Governed 和 Federated 工作权威 | ANC 差异化 |

## 6. 最重要的三个缺口

### 6.1 统一 AI Asset Graph

当前 ANC 已经存在 Agent、模型路由、数据合同、工具、Connector、Secret 引用等对象，但它们尚未成为统一资产模型。

建议新增统一的 `AIAsset` 和 `AIAssetRelationship` 产品层：

- 资产类型：Agent、Model、Prompt、Dataset、Tool、MCP Server、Workflow、Knowledge Base。
- 通用字段：提供方、供应商、Owner、部门、用途、环境、版本、来源、风险级别、生命周期、管理深度。
- 关系类型：使用、调用、训练、评估、读取、写入、负责、依赖、部署于、同步自。
- 来源：手工登记、Connector 同步、Trace 发现、导入、外部平台引用。
- 管理状态：Unmanaged、Observed、Governed、Federated。

注意：统一资产图谱应建立在现有领域对象之上，不应把所有领域逻辑压成一个巨型通用表。

### 6.2 Runtime Observation 与 Evaluation

ANC 已有 Connector Observation，但目前主要表达工作状态、证据、审批请求和成本。需要扩展为标准运行观测合同：

- Session、Trace、Span 标识和层级。
- 延迟、首 Token 时间、Token 数、工具调用、模型调用和重试。
- 数据访问、工具访问、策略决定和拒绝原因。
- 任务完成度、答案正确性、上下文相关性和工具调用正确性。
- Prompt Injection、敏感数据、越权操作和输出安全信号。
- 评估模板、评估器版本、阈值、结果摘要和历史趋势。

运行数据必须保持边界：默认不采集私人会话、本地文件、模型私有推理或 Secret；只收集经 Connector 合同授权的最小结构化证据。

### 6.3 自动安全处置闭环

这是最适合 ANC 下一阶段形成竞争力的完整垂直功能：

```text
Connector 上报实际访问/行为
  → ANC 根据 Tool/Data/Responsibility Policy 评估
  → 产生结构化 Policy Violation
  → 展示 Agent Access Map 与证据
  → 达到阈值后系统暂停 Agent
  → 创建治理任务或 AI Incident
  → 分派给 Agent 真人负责人及安全负责人
  → 真人查看证据并决定恢复、修改权限或终止
  → 全流程写入责任账本
```

ANC 已有该闭环所需的大部分积木，因此这是比复制完整 ServiceNow 套件更短、更有辨识度的路径。

## 7. 推荐实施优先级

### P0：形成可售卖的核心闭环

1. 扩展 Connector Observation，加入 Trace/Span、工具调用和数据访问事件。
2. 建立 Policy Violation 与 Alert 领域合同。
3. 建立 Agent—Work—Tool—Data Source 的 Access Map 投影。
4. 将风险事件与现有 Pause、Approval、Responsibility、Evidence 串联。
5. 在 Agent 详情页展示最近行为、策略拒绝、成本、质量和责任人。
6. 提供一个真实 Connector 的端到端生产验收，不使用 Fixture 冒充运行数据。

### P1：扩大治理对象和运营价值

1. 建立统一 AI Asset Graph。
2. 增加 Model、Prompt、Dataset 和 MCP Server 清单。
3. 增加评估模板、评测集、质量/安全评分和回归趋势。
4. 增加节省工时、采用率、结果价值和 ROI 的可验证输入。
5. 把公司目标、项目、AI 资产和预算关联起来。

### P2：进入大型企业采购能力

1. 中国适用的合规控制包和审计映射。
2. 风险评估、控制证明、例外和定期复核。
3. AI Incident/Case 的根因、修复、预防和事后复核。
4. Shadow AI 发现、重复资产审查和批量管理规则。
5. 更多企业目录、云平台、Agent 平台和 CMDB/ITAM Connector。

## 8. 当前不建议照搬的 ServiceNow 能力

- 不复制由大量标签页构成的复杂信息架构。
- 不在数据量很小时复制 260 个资产的蜂窝图或大屏数字。
- 不优先建设完整 SPM、PPM、CMDB 和 RIDAC 套件。
- 不为尚无目标客户的法域预装大量法规内容包。
- 不把聊天助手变成第二个任务权威来源。
- 不为了显示“AI”而生成无法验证的 ROI、质量或风险数字。
- 不追求一次接入几十个浅层集成，应先完成少量 Connector 的真实闭环。

## 9. ANC 应保持的差异化

ANC 不应把自己定义为更小的 ServiceNow。建议坚持以下定位：

> ANC 是企业 Agent 的身份、责任与执行治理控制平面。无论 Agent 来自 Codex、Claude、DeepSeek、Raft、企业自建 Runtime 或外部平台，公司都能知道它是谁、归谁负责、被允许做什么、实际做过什么、花了多少钱，以及出问题时谁审批、谁处理、如何恢复。

需要持续保持的产品原则：

- 公司和真人责任先于 Agent 执行。
- 所有 Agent 通过平等、厂商中立的 Connector 合同接入。
- 可见、可观察、可治理和可执行必须明确区分。
- 高风险动作必须绑定精确审批，不授予模糊的长期许可。
- Secret、私人活动和外部平台控制边界必须诚实展示。
- 成本、证据、质量和价值均不得使用无法验证的数据。
- 托管云和独立部署是同一代码库的部署模式。

## 10. 建议的下一阶段产品定义

如果只选择一个阶段目标，建议定义为：

> **交付 ANC Agent Runtime Governance v1：让一个正式接入的 Agent 在真实运行中产生可验证的工具和数据访问记录；ANC 能识别越权、展示访问关系、暂停 Agent、创建治理任务、分派真人负责人，并在复核后安全恢复。**

验收标准：

1. 使用非 Fixture 的真实 Connector 和独立测试数据。
2. 展示一次允许访问和一次被拒绝访问。
3. Access Map 能解释 Agent、任务、工具、数据源、操作和策略决定。
4. 高风险违规能够按照策略自动暂停 Agent。
5. 治理任务绑定负责人、证据摘要、策略版本和 Agent 状态。
6. 未授权用户无法读取跨公司事件或资产关系。
7. Secret、私人会话、模型私有推理和原始敏感数据不进入控制面。
8. 真人完成复核后可以修改授权、恢复或终止 Agent。
9. 全过程进入活动记录和责任账本。
10. 公共 Demo 必须继续明确标记为确定性演示数据。

完成该目标后，ANC 将不再只是展示 Agent 资产和治理配置，而会拥有与 ServiceNow 视频中最关键演示相对应、同时体现 ANC 独立价值的真实运行控制闭环。
